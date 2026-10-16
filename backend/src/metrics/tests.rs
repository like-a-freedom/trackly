//! Behavior tests for the `/metrics` surface and the recording functions.

use axum::body::to_bytes;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use uuid::Uuid;

use super::*;
use crate::metrics::recorders::hash_session_id;

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

fn parse_metric_value_from_scrape(body: &str, metric: &str, label_fragment: &str) -> f64 {
    // Look for a metric line that starts with the metric name and contains the label fragment
    for line in body.lines() {
        if line.starts_with(metric) && line.contains(label_fragment) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                return parts[1].parse().unwrap_or(0.0);
            }
        }
    }
    0.0
}

#[tokio::test]
async fn track_category_edit_metrics_increment() {
    // Scrape metrics before mutation
    let response_before = serve_metrics().await.into_response();
    let body_before = to_bytes(response_before.into_body(), usize::MAX)
        .await
        .expect("body");
    let body_before_str = String::from_utf8(body_before.to_vec()).expect("utf8");

    let before = parse_metric_value_from_scrape(
        &body_before_str,
        "track_category_edits_total",
        "action=\"set\"",
    );
    record_track_category_edit("set");

    let response_after = serve_metrics().await.into_response();
    let body_after = to_bytes(response_after.into_body(), usize::MAX)
        .await
        .expect("body");
    let body_after_str = String::from_utf8(body_after.to_vec()).expect("utf8");
    let after = parse_metric_value_from_scrape(
        &body_after_str,
        "track_category_edits_total",
        "action=\"set\"",
    );

    assert_eq!(after, before + 1.0);
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
    assert!(body_str.contains("track_views_total"));
    assert!(body_str.contains("track_searches_total"));
    assert!(body_str.contains("track_edits_total"));
    assert!(body_str.contains("track_exports_total"));
    assert!(body_str.contains("trackly_session_heartbeat"));
}

#[tokio::test]
async fn record_track_view_increments_view_metric() {
    initialize_metrics_baseline();
    let frag = "ownership=\"own\",referrer=\"direct\"";

    let before_body = serve_metrics().await.into_response();
    let before_bytes = to_bytes(before_body.into_body(), usize::MAX)
        .await
        .expect("body");
    let before_str = String::from_utf8(before_bytes.to_vec()).expect("utf8");
    let before = parse_metric_value_from_scrape(&before_str, "track_views_total", frag);

    record_track_view("own", "direct");

    let after_body = serve_metrics().await.into_response();
    let after_bytes = to_bytes(after_body.into_body(), usize::MAX)
        .await
        .expect("body");
    let after_str = String::from_utf8(after_bytes.to_vec()).expect("utf8");
    let after = parse_metric_value_from_scrape(&after_str, "track_views_total", frag);

    assert_eq!(after, before + 1.0);
}

/// Scan the scrape output for a `trackly_session_heartbeat` series matching a
/// specific session hash and activity, order-independently.
fn heartbeat_value(body: &str, hash: &str, activity: &str) -> f64 {
    let act = format!("activity=\"{activity}\"");
    for line in body.lines() {
        if line.starts_with("trackly_session_heartbeat")
            && line.contains(hash)
            && line.contains(&act)
        {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                return parts[1].parse().unwrap_or(0.0);
            }
        }
    }
    0.0
}

async fn scrape() -> String {
    let response = serve_metrics().await.into_response();
    let bytes = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body bytes");
    String::from_utf8(bytes.to_vec()).expect("utf8 body")
}

#[tokio::test]
async fn record_session_activity_emits_heartbeat_per_activity() {
    let session = Uuid::new_v4();
    let hash = hash_session_id(&session);

    // The wiring seam: upload / edit / enrich are the activities now emitted by
    // the real handlers. Each must increment its own series.
    for activity in ["upload", "edit", "enrich"] {
        let before = scrape().await;
        let before = heartbeat_value(&before, &hash, activity);

        record_session_activity(Some(session), activity);

        let after = scrape().await;
        let after = heartbeat_value(&after, &hash, activity);

        assert_eq!(after, before + 1.0, "activity={activity} should increment");
    }
}

#[tokio::test]
async fn record_session_activity_normalizes_unknown_and_ignores_none() {
    let session = Uuid::new_v4();
    let hash = hash_session_id(&session);

    // Unknown activity label normalizes to "other".
    record_session_activity(Some(session), "definitely-not-an-activity");
    let body = scrape().await;
    assert!(
        heartbeat_value(&body, &hash, "other") >= 1.0,
        "unknown activity should map to activity=\"other\""
    );

    // A None session must be a no-op (no new series for a random hash).
    let ghost = Uuid::new_v4();
    let ghost_hash = hash_session_id(&ghost);
    record_session_activity(None, "upload");
    let body_after = scrape().await;
    assert_eq!(
        heartbeat_value(&body_after, &ghost_hash, "upload"),
        0.0,
        "None session must not emit a heartbeat"
    );
}
