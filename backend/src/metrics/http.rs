//! HTTP surface: the tower layer/middleware that instruments every request
//! and the `/metrics` scrape endpoint itself.

use std::convert::Infallible;
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Instant;

use axum::body::Body;
use axum::extract::MatchedPath;
use axum::http::header::{CONTENT_TYPE, HeaderName, USER_AGENT};
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use prometheus::{Encoder, TextEncoder};
use tower::{Layer, Service};
use tracing::info;

use super::definitions::*;
use super::registry::{DB_POOL, DB_POOL_MAX, REGISTRY, initialize_metrics_baseline};

#[derive(Clone)]
pub struct HttpMetricsLayer;

impl Default for HttpMetricsLayer {
    fn default() -> Self {
        Self::new()
    }
}

impl HttpMetricsLayer {
    pub fn new() -> Self {
        // Touch statics to ensure registration
        let _ = &*HTTP_REQUESTS_TOTAL;
        let _ = &*HTTP_REQUEST_DURATION_SECONDS;
        let _ = &*HTTP_REQUESTS_IN_FLIGHT;
        let _ = &*DB_QUERY_DURATION_SECONDS;
        let _ = &*TRACK_PARSE_DURATION_SECONDS;
        let _ = &*TRACK_ENRICH_DURATION_SECONDS;
        let _ = &*TRACK_ENRICH_REQUESTS_TOTAL;
        let _ = &*TRACK_EXPORT_DURATION_SECONDS;
        let _ = &*TRACK_PIPELINE_LATENCY_SECONDS;
        let _ = &*TRACKS_DEDUPLICATED_TOTAL;
        let _ = &*TRACKS_DELETED_TOTAL;
        let _ = &*TRACK_CATEGORIES_TOTAL;
        let _ = &*TRACK_LENGTH_KM_BUCKET;
        let _ = &*POIS_CREATED_TOTAL;
        let _ = &*POIS_DELETED_TOTAL;
        let _ = &*HTTP_REQUEST_SIZE_BYTES;
        let _ = &*HTTP_RESPONSE_SIZE_BYTES;
        let _ = &*HTTP_REQUEST_ERRORS_TOTAL;
        let _ = &*DB_POOL_CONNECTIONS;
        let _ = &*BACKGROUND_TASKS_IN_FLIGHT;
        let _ = &*TRACK_SIMPLIFY_DURATION_SECONDS;
        let _ = &*TRACK_SLOPE_RECALC_DURATION_SECONDS;
        let _ = &*TRACK_POI_LINK_DURATION_SECONDS;
        let _ = &*BULK_OPERATIONS_TOTAL;
        let _ = &*BULK_OPERATIONS_ITEMS;
        let _ = &*TRACK_VIEWS_TOTAL;
        let _ = &*TRACK_SEARCHES_TOTAL;
        let _ = &*TRACK_EDITS_TOTAL;
        let _ = &*TRACK_EXPORTS_TOTAL;
        let _ = &*MAP_INTERACTIONS_TOTAL;
        let _ = &*SESSION_HEARTBEAT;
        Self
    }
}

impl<S> Layer<S> for HttpMetricsLayer {
    type Service = HttpMetricsMiddleware<S>;

    fn layer(&self, inner: S) -> Self::Service {
        HttpMetricsMiddleware { inner }
    }
}

#[derive(Clone)]
pub struct HttpMetricsMiddleware<S> {
    inner: S,
}

impl<S, B> Service<Request<B>> for HttpMetricsMiddleware<S>
where
    S: Service<Request<B>, Response = Response<Body>, Error = Infallible> + Clone + Send + 'static,
    S::Future: Send + 'static,
    B: Send + 'static,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<B>) -> Self::Future {
        let method = req.method().to_string();
        let matched = req
            .extensions()
            .get::<MatchedPath>()
            .map(|p| p.as_str().to_string())
            .unwrap_or_else(|| req.uri().path().to_string());
        let uri = req.uri().path().to_string();
        let req_size = req
            .headers()
            .get(axum::http::header::CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);
        // Note: chunked bodies won't have Content-Length; size will be 0 in that case.
        let user_agent = req
            .headers()
            .get(USER_AGENT)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let forwarded_for = req
            .headers()
            .get(HeaderName::from_static("x-forwarded-for"))
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let request_id = req
            .headers()
            .get(HeaderName::from_static("x-request-id"))
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let traceparent = req
            .headers()
            .get(HeaderName::from_static("traceparent"))
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let session_id = req
            .headers()
            .get(HeaderName::from_static("x-session-id"))
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        HTTP_REQUESTS_IN_FLIGHT.inc();
        let start = Instant::now();
        let mut inner = self.inner.clone();

        Box::pin(async move {
            let result: Result<Response, Infallible> = inner.call(req).await;
            let elapsed = start.elapsed().as_secs_f64();
            HTTP_REQUESTS_IN_FLIGHT.dec();

            match result {
                Ok(response) => {
                    let status = response.status();
                    let status_class = status.as_u16() / 100;
                    let status_class_str = status_class.to_string();

                    HTTP_REQUESTS_TOTAL
                        .with_label_values(&[
                            method.as_str(),
                            matched.as_str(),
                            status_class_str.as_str(),
                        ])
                        .inc();
                    HTTP_REQUEST_DURATION_SECONDS
                        .with_label_values(&[
                            method.as_str(),
                            matched.as_str(),
                            status_class_str.as_str(),
                        ])
                        .observe(elapsed);
                    HTTP_REQUEST_SIZE_BYTES
                        .with_label_values(&[method.as_str(), matched.as_str()])
                        .observe(req_size);

                    let resp_size = response
                        .headers()
                        .get(axum::http::header::CONTENT_LENGTH)
                        .and_then(|v| v.to_str().ok())
                        .and_then(|s| s.parse::<f64>().ok());

                    if let Some(len) = resp_size {
                        HTTP_RESPONSE_SIZE_BYTES
                            .with_label_values(&[
                                method.as_str(),
                                matched.as_str(),
                                status_class_str.as_str(),
                            ])
                            .observe(len);
                    }

                    if status.is_server_error() || status.is_client_error() {
                        HTTP_REQUEST_ERRORS_TOTAL
                            .with_label_values(&[matched.as_str(), status_class_str.as_str()])
                            .inc();
                    }

                    info!(
                        method = method.as_str(),
                        route = matched.as_str(),
                        uri = uri,
                        status = status.as_u16(),
                        status_class = status_class,
                        latency_ms = elapsed * 1000.0,
                        request_size_bytes = req_size,
                        response_size_bytes = resp_size.unwrap_or(0.0),
                        user_agent = user_agent.as_deref().unwrap_or(""),
                        forwarded_for = forwarded_for.as_deref().unwrap_or(""),
                        request_id = request_id.as_deref().unwrap_or(""),
                        traceparent = traceparent.as_deref().unwrap_or(""),
                        session_id = session_id.as_deref().unwrap_or(""),
                        "http_request"
                    );

                    Ok(response)
                }
                Err(err) => {
                    HTTP_REQUESTS_TOTAL
                        .with_label_values(&[method.as_str(), matched.as_str(), "5xx"])
                        .inc();
                    HTTP_REQUEST_ERRORS_TOTAL
                        .with_label_values(&[matched.as_str(), "5xx"])
                        .inc();
                    info!(
                        method = method.as_str(),
                        route = matched.as_str(),
                        uri = uri,
                        status = 500u16,
                        status_class = 5,
                        latency_ms = elapsed * 1000.0,
                        request_size_bytes = req_size,
                        response_size_bytes = 0.0,
                        user_agent = user_agent.as_deref().unwrap_or(""),
                        forwarded_for = forwarded_for.as_deref().unwrap_or(""),
                        request_id = request_id.as_deref().unwrap_or(""),
                        traceparent = traceparent.as_deref().unwrap_or(""),
                        session_id = session_id.as_deref().unwrap_or(""),
                        "http_request"
                    );
                    Err(err)
                }
            }
        })
    }
}
pub async fn serve_metrics() -> impl IntoResponse {
    // Ensure all metrics are registered even if no requests have hit the middleware yet
    initialize_metrics_baseline();
    // Touch a baseline sample so the metric name appears even before traffic
    HTTP_REQUESTS_TOTAL
        .with_label_values(&["init", "/metrics", "0xx"])
        .inc_by(0);

    // Refresh DB pool gauges if pool is registered
    if let Some(pool) = DB_POOL.get() {
        let size = pool.size() as i64;
        let idle = pool.num_idle() as i64;
        let in_use = (size - idle).max(0);
        DB_POOL_CONNECTIONS
            .with_label_values(&["in_use"])
            .set(in_use);
        DB_POOL_CONNECTIONS.with_label_values(&["idle"]).set(idle);
        DB_POOL_CONNECTIONS
            .with_label_values(&["max"])
            .set(DB_POOL_MAX.get().copied().unwrap_or(size));
    }

    // Emit a short debug log so we can see which metrics are served at runtime
    let encoder = TextEncoder::new();
    {
        let families = REGISTRY.gather();
        let names: Vec<String> = families.iter().map(|f| f.name().to_string()).collect();
        info!(count = families.len(), names = ?names, "serving metrics request");
    }
    let metric_families = REGISTRY.gather();
    let mut buffer = Vec::new();
    if let Err(_e) = encoder.encode(&metric_families, &mut buffer) {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    let body = String::from_utf8(buffer).unwrap_or_default();

    // `format_type()` and `StatusCode::OK` are always valid header material, so
    // building the response cannot realistically fail — but this is a handler,
    // so a failure degrades to 500 instead of panicking the worker.
    match Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, encoder.format_type())
        .body(Body::from(body))
    {
        Ok(response) => response,
        Err(error) => {
            tracing::error!(%error, "failed to build /metrics response");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
