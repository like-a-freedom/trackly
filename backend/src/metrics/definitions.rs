//! Prometheus collector definitions. Each `Lazy` registers itself into the
//! shared registry on first access, so the metric name set is unchanged by
//! construction order.

use once_cell::sync::Lazy;
use prometheus::{HistogramOpts, HistogramVec, IntCounterVec, IntGauge, Opts};

use super::registry::REGISTRY;

pub(crate) static HTTP_REQUESTS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("http_requests_total", "Total HTTP requests");
    let counter =
        IntCounterVec::new(opts, &["method", "route", "status_class"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register http_requests_total");
    counter
});

pub(crate) static HTTP_REQUEST_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new("http_request_duration_seconds", "HTTP request latency")
        .buckets(vec![0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0]);
    let hist = HistogramVec::new(opts, &["method", "route", "status_class"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register http_request_duration_seconds");
    hist
});

pub(crate) static HTTP_REQUESTS_IN_FLIGHT: Lazy<IntGauge> = Lazy::new(|| {
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

pub(crate) static TRACK_UPLOAD_FAILURES: Lazy<IntCounterVec> = Lazy::new(|| {
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

pub(crate) static TRACKS_UPLOADED_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("tracks_uploaded_total", "Successfully uploaded tracks");
    let counter = IntCounterVec::new(opts, &["source"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register tracks_uploaded_total");
    counter
});

pub(crate) static TRACKS_DEDUPLICATED_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
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

pub(crate) static TRACKS_DELETED_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("tracks_deleted_total", "Tracks deleted by users");
    let counter = IntCounterVec::new(opts, &["result"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register tracks_deleted_total");
    counter
});

pub(crate) static TRACK_CATEGORIES_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("track_categories_total", "Track categories assignments");
    let counter = IntCounterVec::new(opts, &["category"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register track_categories_total");
    counter
});

// Count of category edit operations (set/add/remove)
pub(crate) static TRACK_CATEGORY_EDITS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new(
        "track_category_edits_total",
        "Track category edit operations (by action)",
    );
    let counter = IntCounterVec::new(opts, &["action"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register track_category_edits_total");
    counter
});

pub(crate) static TRACK_LENGTH_KM_BUCKET: Lazy<HistogramVec> = Lazy::new(|| {
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

pub(crate) static POIS_CREATED_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("pois_created_total", "POIs created");
    let counter = IntCounterVec::new(opts, &["source"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register pois_created_total");
    counter
});

pub(crate) static POIS_DELETED_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("pois_deleted_total", "POIs deleted/unlinked");
    let counter = IntCounterVec::new(opts, &["source"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register pois_deleted_total");
    counter
});

pub(crate) static DB_QUERY_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
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

pub(crate) static TRACK_PARSE_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new("track_parse_duration_seconds", "Track parsing duration")
        .buckets(vec![0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0]);
    let hist = HistogramVec::new(opts, &["format"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register track_parse_duration_seconds");
    hist
});

pub(crate) static TRACK_ENRICH_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
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

pub(crate) static TRACK_ENRICH_REQUESTS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
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

pub(crate) static TRACK_VIEWS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new(
        "track_views_total",
        "Track detail views by ownership and referrer",
    );
    let counter = IntCounterVec::new(opts, &["ownership", "referrer"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register track_views_total");
    counter
});

pub(crate) static TRACK_SEARCHES_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new(
        "track_searches_total",
        "Track search queries by result and type",
    );
    let counter = IntCounterVec::new(opts, &["result_type", "query_type"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register track_searches_total");
    counter
});

pub(crate) static TRACK_EDITS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("track_edits_total", "Track metadata edits by field");
    let counter = IntCounterVec::new(opts, &["field"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register track_edits_total");
    counter
});

pub(crate) static TRACK_EXPORTS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("track_exports_total", "Track exports by format");
    let counter = IntCounterVec::new(opts, &["format"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register track_exports_total");
    counter
});

pub(crate) static MAP_INTERACTIONS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new(
        "map_interactions_total",
        "Map interactions by action and zoom bucket",
    );
    let counter = IntCounterVec::new(opts, &["action", "zoom_bucket"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register map_interactions_total");
    counter
});

pub(crate) static SESSION_HEARTBEAT: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new(
        "trackly_session_heartbeat",
        "Session heartbeat for engagement and retention",
    );
    let counter = IntCounterVec::new(opts, &["session_hash", "activity"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register trackly_session_heartbeat");
    counter
});

pub(crate) static ELEVATION_API_CALLS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new(
        "elevation_api_calls_total",
        "Elevation API calls by service",
    );
    let counter = IntCounterVec::new(opts, &["service"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register elevation_api_calls_total");
    counter
});

pub(crate) static ELEVATION_API_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new(
        "elevation_api_duration_seconds",
        "Elevation API round-trip duration by service",
    )
    .buckets(vec![0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0]);
    let hist = HistogramVec::new(opts, &["service"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register elevation_api_duration_seconds");
    hist
});

pub(crate) static ELEVATION_API_ERRORS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new(
        "elevation_api_errors_total",
        "Elevation API failures by service and kind (timeout, network, http_status, invalid_response, limit)",
    );
    let counter = IntCounterVec::new(opts, &["service", "kind"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register elevation_api_errors_total");
    counter
});

pub(crate) static TRACK_EXPORT_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new("track_export_duration_seconds", "GPX export duration")
        .buckets(vec![0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0]);
    let hist = HistogramVec::new(opts, &["format"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register track_export_duration_seconds");
    hist
});

pub(crate) static TRACK_PIPELINE_LATENCY_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
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

pub(crate) static HTTP_REQUEST_SIZE_BYTES: Lazy<HistogramVec> = Lazy::new(|| {
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

pub(crate) static HTTP_RESPONSE_SIZE_BYTES: Lazy<HistogramVec> = Lazy::new(|| {
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

pub(crate) static HTTP_REQUEST_ERRORS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
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

pub(crate) static DB_POOL_CONNECTIONS: Lazy<prometheus::IntGaugeVec> = Lazy::new(|| {
    let opts = Opts::new("db_pool_connections", "DB pool connections by state");
    let gauge = prometheus::IntGaugeVec::new(opts, &["state"]).expect("gauge vec");
    REGISTRY
        .register(Box::new(gauge.clone()))
        .expect("register db_pool_connections");
    gauge
});

pub(crate) static BACKGROUND_TASKS_IN_FLIGHT: Lazy<IntGauge> = Lazy::new(|| {
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

pub(crate) static ENRICHMENT_QUEUE_DEPTH: Lazy<IntGauge> = Lazy::new(|| {
    let gauge = IntGauge::with_opts(Opts::new(
        "enrichment_queue_depth",
        "Elevation enrichment jobs accepted but not yet completed",
    ))
    .expect("gauge");
    REGISTRY
        .register(Box::new(gauge.clone()))
        .expect("register enrichment_queue_depth");
    gauge
});

pub(crate) static TRACK_SIMPLIFY_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
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

pub(crate) static TRACK_SLOPE_RECALC_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
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

pub(crate) static TRACK_POI_LINK_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new("track_poi_link_duration_seconds", "POI link duration")
        .buckets(vec![0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]);
    let hist = HistogramVec::new(opts, &["operation"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register track_poi_link_duration_seconds");
    hist
});

pub(crate) static BULK_OPERATIONS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("bulk_operations_total", "Bulk DB operations by type");
    let counter = IntCounterVec::new(opts, &["operation"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register bulk_operations_total");
    counter
});

pub(crate) static BULK_OPERATIONS_ITEMS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts =
        HistogramOpts::new("bulk_operations_items", "Items per bulk operation").buckets(vec![
            1.0, 5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0,
        ]);
    let hist = HistogramVec::new(opts, &["operation"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register bulk_operations_items");
    hist
});

// ============================================================================
// Auth Metrics (NFR-MAINT-003)
// ============================================================================

pub(crate) static AUTH_LOGIN_ATTEMPTS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new(
        "auth_login_attempts_total",
        "Login attempts by method and success",
    );
    let counter = IntCounterVec::new(opts, &["method", "success"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register auth_login_attempts_total");
    counter
});

pub(crate) static AUTH_TOKEN_REFRESHES_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new(
        "auth_token_refreshes_total",
        "Token refresh attempts by result",
    );
    let counter = IntCounterVec::new(opts, &["result"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register auth_token_refreshes_total");
    counter
});

pub(crate) static AUTH_TOKEN_VALIDATION_DURATION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new(
        "auth_token_validation_duration_seconds",
        "JWT token validation duration",
    )
    .buckets(vec![0.0001, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.025, 0.05]);
    let hist = HistogramVec::new(opts, &["result"]).expect("hist vec");
    REGISTRY
        .register(Box::new(hist.clone()))
        .expect("register auth_token_validation_duration_seconds");
    hist
});

pub(crate) static AUTH_ACTIVE_SESSIONS_TOTAL: Lazy<IntGauge> = Lazy::new(|| {
    let gauge = IntGauge::with_opts(Opts::new(
        "auth_active_sessions_total",
        "Active user sessions (refresh tokens)",
    ))
    .expect("gauge");
    REGISTRY
        .register(Box::new(gauge.clone()))
        .expect("register auth_active_sessions_total");
    gauge
});

pub(crate) static AUTH_USER_REGISTRATIONS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("auth_user_registrations_total", "New user registrations");
    let counter = IntCounterVec::new(opts, &["method"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register auth_user_registrations_total");
    counter
});

pub(crate) static AUTH_ACCOUNT_DELETIONS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("auth_account_deletions_total", "Account deletions");
    let counter = IntCounterVec::new(opts, &["result"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register auth_account_deletions_total");
    counter
});

pub(crate) static AUTH_SESSION_MIGRATIONS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("auth_session_migrations_total", "Session track migrations");
    let counter = IntCounterVec::new(opts, &["result"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register auth_session_migrations_total");
    counter
});

pub(crate) static AUTH_RATE_LIMITS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("auth_rate_limits_total", "Rate limit hits by endpoint");
    let counter = IntCounterVec::new(opts, &["endpoint"]).expect("counter vec");
    REGISTRY
        .register(Box::new(counter.clone()))
        .expect("register auth_rate_limits_total");
    counter
});
