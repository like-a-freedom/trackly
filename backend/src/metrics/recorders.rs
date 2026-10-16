//! Recording functions — the only way production code writes to the
//! collectors. Grouped here so the metric definitions stay declaration-only.

use std::sync::Arc;

use prometheus::IntGauge;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use super::definitions::*;
use super::registry::{DB_POOL, DB_POOL_MAX};

pub fn record_track_deduplicated(reason: &str) {
    TRACKS_DEDUPLICATED_TOTAL.with_label_values(&[reason]).inc();
}

/// Record a successfully persisted track, labelled by how it was created
/// (`anonymous` for file uploads, `editor` for the track editor).
pub fn record_track_uploaded(source: &str) {
    TRACKS_UPLOADED_TOTAL.with_label_values(&[source]).inc();
}

/// Record a rejected upload, labelled by the domain error class
/// (`validation`, `bad_request`, `database`, `internal`).
pub fn record_track_upload_failure(reason: &str) {
    TRACK_UPLOAD_FAILURES.with_label_values(&[reason]).inc();
}

pub fn record_track_deleted(result: &str) {
    TRACKS_DELETED_TOTAL.with_label_values(&[result]).inc();
}

pub fn record_track_category(category: &str) {
    TRACK_CATEGORIES_TOTAL.with_label_values(&[category]).inc();
}

/// Record an overall category-edit operation (action: set/add/remove)
pub fn record_track_category_edit(action: &str) {
    TRACK_CATEGORY_EDITS_TOTAL
        .with_label_values(&[action])
        .inc();
}

pub fn record_track_search(result_type: &str, query_type: &str) {
    let result_label = if result_type == "zero" {
        "zero"
    } else {
        "success"
    };
    let query_label = match query_type {
        "category" => "category",
        "location" => "location",
        "meta" => "meta",
        _ => "name",
    };
    TRACK_SEARCHES_TOTAL
        .with_label_values(&[result_label, query_label])
        .inc();
}

pub fn record_track_view(ownership: &str, referrer: &str) {
    let ownership_label = match ownership {
        "own" => "own",
        "public" => "public",
        _ => "unknown",
    };
    let referrer_label = match referrer {
        "search" => "search",
        "link" => "link",
        _ => "direct",
    };
    TRACK_VIEWS_TOTAL
        .with_label_values(&[ownership_label, referrer_label])
        .inc();
}

pub fn record_track_edit(field: &str) {
    let field_label = match field {
        "name" => "name",
        "description" => "description",
        "categories" => "categories",
        _ => "other",
    };
    TRACK_EDITS_TOTAL.with_label_values(&[field_label]).inc();
}

pub fn record_track_export(format: &str) {
    let fmt_label = match format {
        "gpx" => "gpx",
        "kml" => "kml",
        "geojson" => "geojson",
        "fit" => "fit",
        _ => "other",
    };
    TRACK_EXPORTS_TOTAL.with_label_values(&[fmt_label]).inc();
}

pub fn record_map_interaction(action: &str, zoom_bucket: &str) {
    let action_label = match action {
        "zoom" => "zoom",
        "pan" => "pan",
        "layer_switch" => "layer_switch",
        _ => "other",
    };
    let bucket_label = match zoom_bucket {
        "low" => "low",
        "mid" => "mid",
        "high" => "high",
        _ => "mid",
    };
    MAP_INTERACTIONS_TOTAL
        .with_label_values(&[action_label, bucket_label])
        .inc();
}

pub(crate) fn hash_session_id(session_id: &Uuid) -> String {
    let mut hasher = Sha256::new();
    hasher.update(session_id.as_bytes());
    let digest = hasher.finalize();
    let hex = hex::encode(digest);
    hex.chars().take(16).collect()
}

pub fn record_session_activity(session_id: Option<Uuid>, activity: &str) {
    let Some(session_uuid) = session_id else {
        return;
    };
    let activity_label = match activity {
        "view" => "view",
        "upload" => "upload",
        "edit" => "edit",
        "search" => "search",
        "export" => "export",
        "enrich" => "enrich",
        "map" => "map",
        _ => "other",
    };
    let hash = hash_session_id(&session_uuid);
    SESSION_HEARTBEAT
        .with_label_values(&[hash.as_str(), activity_label])
        .inc();
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

pub fn record_bulk_operation(operation: &str, count: usize) {
    BULK_OPERATIONS_TOTAL.with_label_values(&[operation]).inc();
    BULK_OPERATIONS_ITEMS
        .with_label_values(&[operation])
        .observe(count as f64);
}

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

pub fn observe_poi_link_duration(operation: &str, seconds: f64) {
    TRACK_POI_LINK_DURATION_SECONDS
        .with_label_values(&[operation])
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

/// Record elevation API calls (for Prometheus). Service name like "opentopodata" or "open-elevation".
pub fn record_elevation_api_calls(service: &str, count: u32) {
    ELEVATION_API_CALLS_TOTAL
        .with_label_values(&[service])
        .inc_by(count as u64);
}

pub fn observe_track_export_duration(format: &str, seconds: f64) {
    TRACK_EXPORT_DURATION_SECONDS
        .with_label_values(&[format])
        .observe(seconds);
}

/// Record the round-trip duration of one elevation API call.
pub fn observe_elevation_api_duration(service: &str, seconds: f64) {
    ELEVATION_API_DURATION_SECONDS
        .with_label_values(&[service])
        .observe(seconds);
}

/// Record an elevation API failure.
///
/// `kind` is intentionally coarse — `timeout`, `network`, `http_status`,
/// `invalid_response` or `limit` — so the metric stays bounded by the number of
/// upstream services rather than by the text of individual failures.
pub fn record_elevation_api_error(service: &str, kind: &str) {
    ELEVATION_API_ERRORS_TOTAL
        .with_label_values(&[service, kind])
        .inc();
}

/// Shared gauge for the elevation-enrichment backlog.
///
/// The queue owns the increments/decrements and injects this gauge so tests can
/// substitute a private one instead of asserting on global state.
pub fn enrichment_queue_depth_gauge() -> IntGauge {
    ENRICHMENT_QUEUE_DEPTH.clone()
}

pub fn observe_track_pipeline_latency(outcome: &str, seconds: f64) {
    TRACK_PIPELINE_LATENCY_SECONDS
        .with_label_values(&[outcome])
        .observe(seconds);
}

// ============================================================================
// Auth Metrics Recording Functions (NFR-MAINT-003)
// ============================================================================

/// Record a login attempt (successful or failed)
pub fn record_auth_login_attempt(method: &str, success: bool) {
    let method_label = match method {
        "google" => "google",
        "github" => "github",
        _ => "unknown",
    };
    let success_label = if success { "success" } else { "failed" };
    AUTH_LOGIN_ATTEMPTS_TOTAL
        .with_label_values(&[method_label, success_label])
        .inc();
}

/// Record a token refresh attempt
pub fn record_auth_token_refresh(result: &str) {
    let result_label = match result {
        "success" => "success",
        "expired" => "expired",
        "invalid" => "invalid",
        "revoked" => "revoked",
        _ => "failed",
    };
    AUTH_TOKEN_REFRESHES_TOTAL
        .with_label_values(&[result_label])
        .inc();
}

/// Observe JWT token validation duration
pub fn observe_auth_token_validation(result: &str, duration_seconds: f64) {
    let result_label = match result {
        "success" => "success",
        "expired" => "expired",
        "invalid" => "invalid",
        _ => "failed",
    };
    AUTH_TOKEN_VALIDATION_DURATION_SECONDS
        .with_label_values(&[result_label])
        .observe(duration_seconds);
}
/// Increment the active sessions gauge
pub fn inc_auth_active_sessions() {
    AUTH_ACTIVE_SESSIONS_TOTAL.inc();
}

/// Decrement the active sessions gauge
pub fn dec_auth_active_sessions() {
    AUTH_ACTIVE_SESSIONS_TOTAL.dec();
}

/// Record a new user registration
pub fn record_auth_user_registration(method: &str) {
    let method_label = match method {
        "google" => "google",
        "github" => "github",
        _ => "unknown",
    };
    AUTH_USER_REGISTRATIONS_TOTAL
        .with_label_values(&[method_label])
        .inc();
}

/// Record account deletion
pub fn record_auth_account_deletion(result: &str) {
    let result_label = if result == "success" {
        "success"
    } else {
        "failed"
    };
    AUTH_ACCOUNT_DELETIONS_TOTAL
        .with_label_values(&[result_label])
        .inc();
}

/// Record session track migration
pub fn record_auth_session_migration(result: &str) {
    let result_label = if result == "success" {
        "success"
    } else {
        "failed"
    };
    AUTH_SESSION_MIGRATIONS_TOTAL
        .with_label_values(&[result_label])
        .inc();
}

/// Record rate limit hit on auth endpoint
pub fn record_auth_rate_limit(endpoint: &str) {
    let endpoint_label = match endpoint {
        "login" => "login",
        "refresh" => "refresh",
        "callback" => "callback",
        _ => "other",
    };
    AUTH_RATE_LIMITS_TOTAL
        .with_label_values(&[endpoint_label])
        .inc();
}
