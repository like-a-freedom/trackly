//! Collector registry, static labels, the DB-pool handles reported on the
//! `/metrics` route, and the startup baseline that pre-creates label sets.

use std::sync::Arc;

use once_cell::sync::{Lazy, OnceCell};
use prometheus::Registry;
use sqlx::PgPool;
use tracing::info;

use super::definitions::*;
use super::http::HttpMetricsLayer;

pub(crate) static REGISTRY: Lazy<Registry> = Lazy::new(|| {
    // Infallible: `const_labels` keys are the compile-time literals produced by
    // `static_labels` (`env`, `service`, `instance`, `version`), so label-name
    // validation can never reject them. The process is unusable without a
    // registry, so a panic here is the intended behaviour if that ever changed.
    Registry::new_custom(None, Some(static_labels())).expect("static const label names are valid")
});

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

pub(crate) static DB_POOL: OnceCell<Arc<PgPool>> = OnceCell::new();

pub(crate) static DB_POOL_MAX: OnceCell<i64> = OnceCell::new();

/// Pre-create label value combinations so metrics appear in scraping even before traffic.
pub fn initialize_metrics_baseline() {
    // Ensure collectors are registered
    let _ = HttpMetricsLayer::new();

    // Log the current registry families for debugging on startup
    {
        let families = REGISTRY.gather();
        let names: Vec<String> = families.iter().map(|f| f.name().to_string()).collect();
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
    let _ = TRACK_UPLOAD_FAILURES.with_label_values(&["bad_request"]);
    let _ = TRACK_UPLOAD_FAILURES.with_label_values(&["database"]);
    let _ = TRACK_UPLOAD_FAILURES.with_label_values(&["internal"]);
    let _ = TRACKS_UPLOADED_TOTAL.with_label_values(&["anonymous"]);
    let _ = TRACKS_UPLOADED_TOTAL.with_label_values(&["editor"]);
    let _ = TRACKS_DEDUPLICATED_TOTAL.with_label_values(&["gpx_hash_match"]);
    let _ = TRACKS_DELETED_TOTAL.with_label_values(&["success"]);
    let _ = TRACK_PARSE_DURATION_SECONDS.with_label_values(&["gpx"]);
    let _ = TRACK_PIPELINE_LATENCY_SECONDS.with_label_values(&["success"]);
    let _ = TRACK_LENGTH_KM_BUCKET.with_label_values(&["anonymous"]);
    let _ = TRACK_LENGTH_KM_BUCKET.with_label_values(&["editor"]);
    let _ = TRACK_CATEGORIES_TOTAL.with_label_values(&["unknown"]);

    // Category edit baselines
    let _ = TRACK_CATEGORY_EDITS_TOTAL.with_label_values(&["set"]);
    let _ = TRACK_CATEGORY_EDITS_TOTAL.with_label_values(&["add"]);
    let _ = TRACK_CATEGORY_EDITS_TOTAL.with_label_values(&["remove"]);

    // Enrichment
    let _ = TRACK_ENRICH_REQUESTS_TOTAL.with_label_values(&["success"]);
    let _ = TRACK_ENRICH_REQUESTS_TOTAL.with_label_values(&["failed_remote"]);
    let _ = TRACK_ENRICH_DURATION_SECONDS.with_label_values(&["success"]);
    let _ = TRACK_ENRICH_DURATION_SECONDS.with_label_values(&["failed_remote"]);
    let _ = TRACK_SLOPE_RECALC_DURATION_SECONDS.with_label_values(&["success"]);
    let _ = TRACK_SLOPE_RECALC_DURATION_SECONDS.with_label_values(&["db_error"]);

    // Elevation API calls counter baseline
    let _ = ELEVATION_API_CALLS_TOTAL.with_label_values(&["opentopodata"]);
    let _ = ELEVATION_API_CALLS_TOTAL.with_label_values(&["open-elevation"]);
    for service in ["opentopodata", "open-elevation"] {
        let _ = ELEVATION_API_DURATION_SECONDS.with_label_values(&[service]);
        for kind in [
            "timeout",
            "network",
            "http_status",
            "invalid_response",
            "limit",
        ] {
            let _ = ELEVATION_API_ERRORS_TOTAL.with_label_values(&[service, kind]);
        }
    }

    // Export/simplify/POI
    let _ = TRACK_EXPORT_DURATION_SECONDS.with_label_values(&["gpx"]);
    let _ = TRACK_SIMPLIFY_DURATION_SECONDS.with_label_values(&["detail"]);
    let _ = TRACK_SIMPLIFY_DURATION_SECONDS.with_label_values(&["overview"]);
    let _ = POIS_CREATED_TOTAL.with_label_values(&["manual"]);
    let _ = POIS_DELETED_TOTAL.with_label_values(&["unlink_track"]);
    let _ = POIS_DELETED_TOTAL.with_label_values(&["delete_poi"]);

    // Product observability
    let _ = TRACK_VIEWS_TOTAL.with_label_values(&["unknown", "direct"]);
    let _ = TRACK_VIEWS_TOTAL.with_label_values(&["own", "direct"]);
    let _ = TRACK_VIEWS_TOTAL.with_label_values(&["public", "direct"]);
    let _ = TRACK_VIEWS_TOTAL.with_label_values(&["own", "search"]);
    let _ = TRACK_VIEWS_TOTAL.with_label_values(&["public", "search"]);
    let _ = TRACK_VIEWS_TOTAL.with_label_values(&["own", "link"]);
    let _ = TRACK_VIEWS_TOTAL.with_label_values(&["public", "link"]);
    let _ = TRACK_SEARCHES_TOTAL.with_label_values(&["zero", "name"]);
    let _ = TRACK_SEARCHES_TOTAL.with_label_values(&["success", "name"]);
    let _ = TRACK_EDITS_TOTAL.with_label_values(&["name"]);
    let _ = TRACK_EDITS_TOTAL.with_label_values(&["description"]);
    let _ = TRACK_EDITS_TOTAL.with_label_values(&["categories"]);
    let _ = TRACK_EXPORTS_TOTAL.with_label_values(&["gpx"]);
    let _ = MAP_INTERACTIONS_TOTAL.with_label_values(&["zoom", "low"]);
    let _ = MAP_INTERACTIONS_TOTAL.with_label_values(&["zoom", "mid"]);
    let _ = MAP_INTERACTIONS_TOTAL.with_label_values(&["zoom", "high"]);
    let _ = MAP_INTERACTIONS_TOTAL.with_label_values(&["pan", "low"]);
    let _ = MAP_INTERACTIONS_TOTAL.with_label_values(&["pan", "mid"]);
    let _ = MAP_INTERACTIONS_TOTAL.with_label_values(&["pan", "high"]);
    let _ = MAP_INTERACTIONS_TOTAL.with_label_values(&["layer_switch", "low"]);
    let _ = MAP_INTERACTIONS_TOTAL.with_label_values(&["layer_switch", "mid"]);
    let _ = MAP_INTERACTIONS_TOTAL.with_label_values(&["layer_switch", "high"]);
    let _ = SESSION_HEARTBEAT.with_label_values(&["0000000000000000", "view"]);
    let _ = SESSION_HEARTBEAT.with_label_values(&["0000000000000000", "upload"]);
    let _ = SESSION_HEARTBEAT.with_label_values(&["0000000000000000", "edit"]);
    let _ = SESSION_HEARTBEAT.with_label_values(&["0000000000000000", "search"]);
    let _ = SESSION_HEARTBEAT.with_label_values(&["0000000000000000", "export"]);
    let _ = SESSION_HEARTBEAT.with_label_values(&["0000000000000000", "enrich"]);
    let _ = SESSION_HEARTBEAT.with_label_values(&["0000000000000000", "map"]);

    // Background workers gauge
    BACKGROUND_TASKS_IN_FLIGHT.set(0);

    // Auth metrics (NFR-MAINT-003)
    let _ = AUTH_LOGIN_ATTEMPTS_TOTAL.with_label_values(&["google", "success"]);
    let _ = AUTH_LOGIN_ATTEMPTS_TOTAL.with_label_values(&["google", "failed"]);
    let _ = AUTH_TOKEN_REFRESHES_TOTAL.with_label_values(&["success"]);
    let _ = AUTH_TOKEN_REFRESHES_TOTAL.with_label_values(&["expired"]);
    let _ = AUTH_TOKEN_REFRESHES_TOTAL.with_label_values(&["invalid"]);
    let _ = AUTH_TOKEN_REFRESHES_TOTAL.with_label_values(&["revoked"]);
    let _ = AUTH_TOKEN_VALIDATION_DURATION_SECONDS.with_label_values(&["success"]);
    let _ = AUTH_TOKEN_VALIDATION_DURATION_SECONDS.with_label_values(&["expired"]);
    let _ = AUTH_TOKEN_VALIDATION_DURATION_SECONDS.with_label_values(&["invalid"]);
    AUTH_ACTIVE_SESSIONS_TOTAL.set(0);
    let _ = AUTH_USER_REGISTRATIONS_TOTAL.with_label_values(&["google"]);
    let _ = AUTH_ACCOUNT_DELETIONS_TOTAL.with_label_values(&["success"]);
    let _ = AUTH_ACCOUNT_DELETIONS_TOTAL.with_label_values(&["failed"]);
    let _ = AUTH_SESSION_MIGRATIONS_TOTAL.with_label_values(&["success"]);
    let _ = AUTH_SESSION_MIGRATIONS_TOTAL.with_label_values(&["failed"]);
    let _ = AUTH_RATE_LIMITS_TOTAL.with_label_values(&["login"]);
    let _ = AUTH_RATE_LIMITS_TOTAL.with_label_values(&["refresh"]);
}
