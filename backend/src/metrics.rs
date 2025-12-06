use std::convert::Infallible;
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Instant;

use axum::body::Body;
use axum::extract::MatchedPath;
use axum::http::header::{HeaderName, CONTENT_TYPE, USER_AGENT};
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use once_cell::sync::{Lazy, OnceCell};
use prometheus::{
    Encoder, HistogramOpts, HistogramVec, IntCounterVec, IntGauge, Opts, Registry, TextEncoder,
};
use sqlx::PgPool;
use std::sync::Arc;
use tower::{Layer, Service};
use tracing::info;

static REGISTRY: Lazy<Registry> =
    Lazy::new(|| Registry::new_custom(None, Some(static_labels())).unwrap());

fn static_labels() -> std::collections::HashMap<String, String> {
    let mut labels = std::collections::HashMap::new();
    if let Ok(env) = std::env::var("APP_ENV") {
        labels.insert("env".to_string(), env);
    }
    if let Ok(service) = std::env::var("SERVICE_NAME") {
        labels.insert("service".to_string(), service);
    } else {
        labels.insert("service".to_string(), "backend".to_string());
    }
    if let Ok(instance) = std::env::var("INSTANCE_ID") {
        labels.insert("instance".to_string(), instance);
    }
    if let Ok(version) = std::env::var("VERSION") {
        labels.insert("version".to_string(), version);
    }
    labels
}

static HTTP_REQUESTS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("http_requests_total", "Total HTTP requests");
    let counter =
        IntCounterVec::new(opts, &["method", "route", "status_class"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register http_requests_total");
    counter
});

static HTTP_REQUEST_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new("http_request_duration_seconds", "HTTP request latency")
        .buckets(vec![0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0]);
    let hist = HistogramVec::new(opts, &["method", "route", "status_class"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register http_request_duration_seconds");
    hist
});

static HTTP_REQUESTS_IN_FLIGHT: Lazy<IntGauge> = Lazy::new(|| {
    let gauge = IntGauge::with_opts(Opts::new(
        "http_requests_in_flight",
        "In-flight HTTP requests",
    ))
    .expect("gauge");
    REGISTRY
        .register(Box::new(gauge.clone()))
        .expect("register http_requests_in_flight");
    gauge
});

static TRACK_UPLOAD_FAILURES: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new(
        "track_upload_failures_total",
        "Track upload failures by reason",
    );
    let counter = IntCounterVec::new(opts, &["reason"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register track_upload_failures_total");
    counter
});

static TRACKS_UPLOADED_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("tracks_uploaded_total", "Successfully uploaded tracks");
    let counter = IntCounterVec::new(opts, &["source"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register tracks_uploaded_total");
    counter
});

static TRACKS_DEDUPLICATED_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new(
        "tracks_deduplicated_total",
        "Skipped uploads due to hash dedup",
    );
    let counter = IntCounterVec::new(opts, &["reason"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register tracks_deduplicated_total");
    counter
});

static TRACKS_DELETED_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("tracks_deleted_total", "Tracks deleted by users");
    let counter = IntCounterVec::new(opts, &["result"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register tracks_deleted_total");
    counter
});

static TRACK_CATEGORIES_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("track_categories_total", "Track categories assignments");
    let counter = IntCounterVec::new(opts, &["category"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register track_categories_total");
    counter
});

static TRACK_LENGTH_KM_BUCKET: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new(
        "track_length_km_bucket",
        "Distribution of uploaded track lengths",
    )
    .buckets(vec![0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0, 200.0]);
    let hist = HistogramVec::new(opts, &["source"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register track_length_km_bucket");
    hist
});

static POIS_CREATED_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("pois_created_total", "POIs created");
    let counter = IntCounterVec::new(opts, &["source"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register pois_created_total");
    counter
});

static POIS_DELETED_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("pois_deleted_total", "POIs deleted/unlinked");
    let counter = IntCounterVec::new(opts, &["source"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register pois_deleted_total");
    counter
});

static DB_QUERY_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new("db_query_duration_seconds", "DB query latency by operation")
        .buckets(vec![
            0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0,
        ]);
    let hist = HistogramVec::new(opts, &["operation"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register db_query_duration_seconds");
    hist
});

static TRACK_PARSE_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new("track_parse_duration_seconds", "Track parsing duration")
        .buckets(vec![0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0]);
    let hist = HistogramVec::new(opts, &["format"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register track_parse_duration_seconds");
    hist
});

static TRACK_ENRICH_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new(
        "track_enrich_duration_seconds",
        "Elevation enrichment duration",
    )
    .buckets(vec![0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0]);
    let hist = HistogramVec::new(opts, &["status"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register track_enrich_duration_seconds");
    hist
});

static TRACK_ENRICH_REQUESTS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new(
        "track_enrich_requests_total",
        "Elevation enrichment attempts",
    );
    let counter = IntCounterVec::new(opts, &["status"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register track_enrich_requests_total");
    counter
});

static TRACK_EXPORT_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new("track_export_duration_seconds", "GPX export duration")
        .buckets(vec![0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0]);
    let hist = HistogramVec::new(opts, &["format"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register track_export_duration_seconds");
    hist
});

static TRACK_PIPELINE_LATENCY_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new(
        "track_pipeline_latency_seconds",
        "End-to-end upload latency",
    )
    .buckets(vec![0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 40.0, 60.0]);
    let hist = HistogramVec::new(opts, &["outcome"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register track_pipeline_latency_seconds");
    hist
});

static HTTP_REQUEST_SIZE_BYTES: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new("http_request_size_bytes", "HTTP request size").buckets(vec![
        512.0,
        1_024.0,
        2_048.0,
        5_000.0,
        10_000.0,
        50_000.0,
        100_000.0,
        500_000.0,
        1_000_000.0,
        5_000_000.0,
    ]);
    let hist = HistogramVec::new(opts, &["method", "route"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register http_request_size_bytes");
    hist
});

static HTTP_RESPONSE_SIZE_BYTES: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new("http_response_size_bytes", "HTTP response size").buckets(vec![
        512.0,
        1_024.0,
        2_048.0,
        5_000.0,
        10_000.0,
        50_000.0,
        100_000.0,
        500_000.0,
        1_000_000.0,
        5_000_000.0,
    ]);
    let hist = HistogramVec::new(opts, &["method", "route", "status_class"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register http_response_size_bytes");
    hist
});

static HTTP_REQUEST_ERRORS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new(
        "http_requests_errors_total",
        "HTTP error responses by class",
    );
    let counter = IntCounterVec::new(opts, &["route", "status_class"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register http_requests_errors_total");
    counter
});

static DB_POOL_CONNECTIONS: Lazy<prometheus::IntGaugeVec> = Lazy::new(|| {
    let opts = Opts::new("db_pool_connections", "DB pool connections by state");
    let gauge = prometheus::IntGaugeVec::new(opts, &["state"]).expect("gauge vec");
    REGISTRY
        .register(Box::new(gauge.clone()))
        .expect("register db_pool_connections");
    gauge
});

static BACKGROUND_TASKS_IN_FLIGHT: Lazy<IntGauge> = Lazy::new(|| {
    let gauge = IntGauge::with_opts(Opts::new(
        "background_tasks_in_flight",
        "Spawned background tasks currently running",
    ))
    .expect("gauge");
    REGISTRY
        .register(Box::new(gauge.clone()))
        .expect("register background_tasks_in_flight");
    gauge
});

static TRACK_SIMPLIFY_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new(
        "track_simplify_duration_seconds",
        "Track simplification duration",
    )
    .buckets(vec![0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]);
    let hist = HistogramVec::new(opts, &["mode"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register track_simplify_duration_seconds");
    hist
});

static TRACK_SLOPE_RECALC_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new(
        "track_slope_recalc_duration_seconds",
        "Slope recalculation duration",
    )
    .buckets(vec![0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0]);
    let hist = HistogramVec::new(opts, &["result"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register track_slope_recalc_duration_seconds");
    hist
});

static DB_POOL: OnceCell<Arc<PgPool>> = OnceCell::new();

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
        Self
    }
}

/// Pre-create label value combinations so metrics appear in scraping even before traffic.
pub fn initialize_metrics_baseline() {
    // Ensure collectors are registered
    let _ = HttpMetricsLayer::new();

    // Log the current registry families for debugging on startup
    {
        let families = REGISTRY.gather();
        let names: Vec<String> = families
            .iter()
            .map(|f| f.name().to_string())
            .collect();
        info!(count = families.len(), names = ?names, "metrics baseline registered");
    }

    // HTTP core metrics
    let _ = HTTP_REQUESTS_TOTAL.with_label_values(&["INIT", "/init", "0xx"]);
    let _ = HTTP_REQUEST_DURATION_SECONDS.with_label_values(&["INIT", "/init", "0xx"]);
    let _ = HTTP_REQUEST_SIZE_BYTES.with_label_values(&["INIT", "/init"]);
    let _ = HTTP_RESPONSE_SIZE_BYTES.with_label_values(&["INIT", "/init", "0xx"]);
    let _ = HTTP_REQUEST_ERRORS_TOTAL.with_label_values(&["/init", "5xx"]);
    HTTP_REQUESTS_IN_FLIGHT.set(0);

    // DB metrics
    let _ = DB_QUERY_DURATION_SECONDS.with_label_values(&["unknown"]);
    DB_POOL_CONNECTIONS.with_label_values(&["idle"]).set(0);
    DB_POOL_CONNECTIONS.with_label_values(&["in_use"]).set(0);
    DB_POOL_CONNECTIONS.with_label_values(&["max"]).set(0);

    // Upload and parsing
    let _ = TRACK_UPLOAD_FAILURES.with_label_values(&["validation"]);
    let _ = TRACKS_UPLOADED_TOTAL.with_label_values(&["anonymous"]);
    let _ = TRACKS_DEDUPLICATED_TOTAL.with_label_values(&["gpx_hash_match"]);
    let _ = TRACKS_DELETED_TOTAL.with_label_values(&["success"]);
    let _ = TRACK_PARSE_DURATION_SECONDS.with_label_values(&["gpx"]);
    let _ = TRACK_PIPELINE_LATENCY_SECONDS.with_label_values(&["success"]);
    let _ = TRACK_LENGTH_KM_BUCKET.with_label_values(&["anonymous"]);
    let _ = TRACK_CATEGORIES_TOTAL.with_label_values(&["unknown"]);

    // Enrichment
    let _ = TRACK_ENRICH_REQUESTS_TOTAL.with_label_values(&["success"]);
    let _ = TRACK_ENRICH_REQUESTS_TOTAL.with_label_values(&["failed_remote"]);
    let _ = TRACK_ENRICH_DURATION_SECONDS.with_label_values(&["success"]);
    let _ = TRACK_ENRICH_DURATION_SECONDS.with_label_values(&["failed_remote"]);
    let _ = TRACK_SLOPE_RECALC_DURATION_SECONDS.with_label_values(&["success"]);
    let _ = TRACK_SLOPE_RECALC_DURATION_SECONDS.with_label_values(&["db_error"]);

    // Export/simplify/POI
    let _ = TRACK_EXPORT_DURATION_SECONDS.with_label_values(&["gpx"]);
    let _ = TRACK_SIMPLIFY_DURATION_SECONDS.with_label_values(&["detail"]);
    let _ = TRACK_SIMPLIFY_DURATION_SECONDS.with_label_values(&["overview"]);
    let _ = POIS_CREATED_TOTAL.with_label_values(&["manual"]);
    let _ = POIS_DELETED_TOTAL.with_label_values(&["unlink_track"]);
    let _ = POIS_DELETED_TOTAL.with_label_values(&["delete_poi"]);

    // Background workers gauge
    BACKGROUND_TASKS_IN_FLIGHT.set(0);
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
        let names: Vec<String> = families
            .iter()
            .map(|f| f.name().to_string())
            .collect();
        info!(count = families.len(), names = ?names, "serving metrics request");
    }
    let metric_families = REGISTRY.gather();
    let mut buffer = Vec::new();
    if let Err(_e) = encoder.encode(&metric_families, &mut buffer) {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    let body = String::from_utf8(buffer).unwrap_or_default();

    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, encoder.format_type())
        .body(Body::from(body))
        .unwrap()
}

pub fn record_track_upload_failure(reason: &str) {
    TRACK_UPLOAD_FAILURES.with_label_values(&[reason]).inc();
}

pub fn record_track_uploaded(source: &str) {
    TRACKS_UPLOADED_TOTAL.with_label_values(&[source]).inc();
}

pub fn record_track_deduplicated(reason: &str) {
    TRACKS_DEDUPLICATED_TOTAL.with_label_values(&[reason]).inc();
}

pub fn record_track_deleted(result: &str) {
    TRACKS_DELETED_TOTAL.with_label_values(&[result]).inc();
}

pub fn record_track_category(category: &str) {
    TRACK_CATEGORIES_TOTAL.with_label_values(&[category]).inc();
}

pub fn observe_track_length_km(source: &str, length_km: f64) {
    TRACK_LENGTH_KM_BUCKET
        .with_label_values(&[source])
        .observe(length_km);
}

pub fn record_poi_created(source: &str) {
    POIS_CREATED_TOTAL.with_label_values(&[source]).inc();
}

pub fn record_poi_deleted(source: &str) {
    POIS_DELETED_TOTAL.with_label_values(&[source]).inc();
}

static DB_POOL_MAX: OnceCell<i64> = OnceCell::new();

pub fn set_db_pool(pool: Arc<PgPool>, max_connections: i64) {
    let _ = DB_POOL.set(pool);
    let _ = DB_POOL_MAX.set(max_connections);
}

pub fn observe_track_simplify(mode: &str, seconds: f64) {
    TRACK_SIMPLIFY_DURATION_SECONDS
        .with_label_values(&[mode])
        .observe(seconds);
}

pub fn observe_slope_recalc(result: &str, seconds: f64) {
    TRACK_SLOPE_RECALC_DURATION_SECONDS
        .with_label_values(&[result])
        .observe(seconds);
}

pub struct BackgroundTaskGuard;

impl Default for BackgroundTaskGuard {
    fn default() -> Self {
        Self::new()
    }
}

impl BackgroundTaskGuard {
    pub fn new() -> Self {
        BACKGROUND_TASKS_IN_FLIGHT.inc();
        Self
    }
}

impl Drop for BackgroundTaskGuard {
    fn drop(&mut self) {
        BACKGROUND_TASKS_IN_FLIGHT.dec();
    }
}

pub fn observe_db_query(operation: &str, seconds: f64) {
    DB_QUERY_DURATION_SECONDS
        .with_label_values(&[operation])
        .observe(seconds);
}

pub fn observe_track_parse_duration(format: &str, seconds: f64) {
    TRACK_PARSE_DURATION_SECONDS
        .with_label_values(&[format])
        .observe(seconds);
}

pub fn observe_track_enrich_duration(status: &str, seconds: f64) {
    TRACK_ENRICH_DURATION_SECONDS
        .with_label_values(&[status])
        .observe(seconds);
}

pub fn record_track_enrich_status(status: &str) {
    TRACK_ENRICH_REQUESTS_TOTAL
        .with_label_values(&[status])
        .inc();
}

pub fn observe_track_export_duration(format: &str, seconds: f64) {
    TRACK_EXPORT_DURATION_SECONDS
        .with_label_values(&[format])
        .observe(seconds);
}

pub fn observe_track_pipeline_latency(outcome: &str, seconds: f64) {
    TRACK_PIPELINE_LATENCY_SECONDS
        .with_label_values(&[outcome])
        .observe(seconds);
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use axum::response::IntoResponse;

    #[tokio::test]
    async fn metrics_endpoint_returns_ok() {
        let response = serve_metrics().await.into_response();
        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body to bytes");
        let body_str = String::from_utf8(body.to_vec()).expect("utf8 body");
        assert!(body_str.contains("http_requests_total"));
    }

    #[tokio::test]
    async fn baseline_exposes_product_metrics() {
        initialize_metrics_baseline();
        let response = serve_metrics().await.into_response();
        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body to bytes");
        let body_str = String::from_utf8(body.to_vec()).expect("utf8 body");
        assert!(body_str.contains("tracks_uploaded_total"));
        assert!(body_str.contains("track_enrich_requests_total"));
        assert!(body_str.contains("track_upload_failures_total"));
    }
}
