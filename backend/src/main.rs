use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{HeaderValue, Method, header},
    routing::{get, post},
};
use backend::{handlers, logging, metrics, services};
use mimalloc::MiMalloc;
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use tracing::info;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() {
    // Load environment variables from `.env` during local development
    // dotenvy will silently ignore if no .env file exists.
    dotenvy::dotenv().ok();

    // The container healthcheck runs `/app/backend --health-check`. Without
    // this branch the flag was ignored and the probe booted a second full
    // server, which then failed to bind :8080 and reported the container
    // unhealthy even though the real server was serving fine.
    if std::env::args().any(|a| a == "--health-check") {
        std::process::exit(run_health_check().await);
    }

    logging::init();

    // Log whether authentication is configured (helpful in local dev)
    info!(auth_configured = %backend::auth::is_auth_configured(), "auth configuration status");

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let max_body_size = std::env::var("MAX_HTTP_BODY_SIZE")
        .ok()
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(50 * 1024 * 1024); // Default 50MB

    let max_connections = std::env::var("DATABASE_MAX_CONNECTIONS")
        .ok()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(5);

    let pool = Arc::new(
        PgPoolOptions::new()
            .max_connections(max_connections)
            .connect(&db_url)
            .await
            .expect("DB connect"),
    );

    metrics::set_db_pool(Arc::clone(&pool), max_connections as i64);
    metrics::initialize_metrics_baseline();

    services::enrichment_queue::init_enrichment_queue(Arc::clone(&pool));

    // Run migrations automatically on startup
    info!(
        stage = "migrations",
        action = "start",
        "running database migrations"
    );
    sqlx::migrate!("./migrations")
        .run(&*pool)
        .await
        .expect("Failed to run migrations");
    info!(
        stage = "migrations",
        action = "complete",
        "database migrations finished"
    );

    // CORS configuration
    let cors_allowed_origins = std::env::var("CORS_ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:5173,http://localhost:81".to_string());

    let allowed_origins: Vec<HeaderValue> = cors_allowed_origins
        .split(',')
        .filter_map(|origin| origin.trim().parse().ok())
        .collect();

    let cors = CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT])
        .allow_credentials(true)
        .max_age(std::time::Duration::from_secs(3600));

    info!(
        cors_origins = %cors_allowed_origins,
        "CORS configured"
    );

    let graph_dir = std::env::var("FAST_PATHS_GRAPH_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("data/graphs"));

    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/api/feature-flags", get(handlers::get_feature_flags))
        .route("/metrics", get(metrics::serve_metrics))
        .nest_service("/graphs", ServeDir::new(graph_dir))
        .route("/api/tracks/upload", post(handlers::upload_track))
        .route("/api/tracks", get(handlers::list_tracks_geojson))
        .route("/api/tracks/heatmap", get(handlers::list_tracks_heatmap))
        .route("/api/tracks/search", get(handlers::search_tracks))
        .route("/api/tracks/{id}", get(handlers::get_track))
        .route(
            "/api/tracks/{id}/simplified",
            get(handlers::get_track_simplified),
        )
        .route(
            "/api/tracks/simplify-preview",
            post(handlers::simplify_track_preview),
        )
        .route(
            "/api/tracks/{id}/description",
            axum::routing::patch(handlers::update_track_description),
        )
        .route(
            "/api/tracks/{id}/name",
            axum::routing::patch(handlers::update_track_name),
        )
        .route(
            "/api/tracks/{id}/categories",
            axum::routing::patch(handlers::update_track_categories),
        )
        .route(
            "/api/tracks/{id}/distance-markers",
            axum::routing::patch(handlers::update_track_distance_markers),
        )
        .route("/api/tracks/{id}/export", get(handlers::export_track))
        .route(
            "/api/tracks/{id}/enrich-elevation",
            post(handlers::enrich_elevation),
        )
        .route("/api/elevation/preview", post(handlers::preview_elevation))
        .route(
            "/api/tracks/{id}/slope-profile",
            get(handlers::get_track_slope_profile),
        )
        .route(
            "/api/tracks/{id}/recalculate-slopes",
            post(handlers::recalculate_track_slopes),
        )
        .route(
            "/api/tracks/{id}",
            axum::routing::delete(handlers::delete_track),
        )
        // Track editor routes
        .route(
            "/api/tracks/create",
            post(handlers::create_track_from_editor),
        )
        .route(
            "/api/tracks/{id}/geometry",
            axum::routing::put(handlers::update_track_geometry),
        )
        .route(
            "/api/tracks/{id}/duplicate",
            post(handlers::duplicate_track),
        )
        .route("/api/tracks/{id}/publish", post(handlers::publish_track))
        .route(
            "/observability/map-interactions",
            post(handlers::record_map_interaction),
        )
        // POI routes
        .route(
            "/api/pois",
            get(handlers::get_pois).post(handlers::create_poi),
        )
        .route(
            "/api/pois/{id}",
            get(handlers::get_poi)
                .patch(handlers::update_poi)
                .delete(handlers::delete_poi),
        )
        .route("/api/tracks/{track_id}/pois", get(handlers::get_track_pois))
        .route(
            "/api/tracks/{track_id}/pois/{poi_id}",
            axum::routing::delete(handlers::unlink_track_poi),
        )
        // Auth routes
        .route("/api/auth/oauth-config", get(handlers::oauth_config))
        .route("/api/auth/google/login", get(handlers::google_login))
        .route("/api/auth/google/callback", post(handlers::google_callback))
        .route("/api/auth/refresh", post(handlers::refresh_token))
        .route("/api/auth/logout", post(handlers::logout))
        .route("/api/auth/logout-all", post(handlers::logout_all))
        .route(
            "/api/auth/me/nickname",
            axum::routing::patch(handlers::update_nickname),
        )
        .route(
            "/api/account/profile",
            axum::routing::patch(handlers::update_profile),
        )
        .route(
            "/api/auth/migrate-session-tracks",
            post(handlers::migrate_session_tracks),
        )
        // Account routes
        .route(
            "/api/account",
            axum::routing::delete(handlers::delete_account),
        )
        .route("/api/account/me", get(handlers::get_current_user))
        .route("/api/account/tracks", get(handlers::list_account_tracks))
        .route(
            "/api/account/tracks/bulk",
            axum::routing::delete(handlers::bulk_delete_tracks),
        )
        .route(
            "/api/account/tracks/bulk/visibility",
            axum::routing::patch(handlers::bulk_toggle_visibility),
        )
        // Track visibility route
        .route(
            "/api/tracks/{id}/visibility",
            axum::routing::patch(handlers::update_track_visibility),
        )
        // Debug endpoints (disabled by default)
        .route(
            "/debug/background_task",
            get(handlers::debug_background_task),
        )
        .route("/sitemap.xml", get(handlers::sitemap))
        .layer(DefaultBodyLimit::max(max_body_size))
        .layer(metrics::HttpMetricsLayer::new())
        .layer(cors)
        .with_state(pool);
    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    info!(address = %addr, "listening");
    info!(
        max_body_bytes = max_body_size,
        max_body_mb = max_body_size / (1024 * 1024),
        "configured http body size limit"
    );
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind to address {addr}: {e}");
            std::process::exit(1);
        }
    };

    if let Err(e) = axum::serve(listener, app.into_make_service()).await {
        eprintln!("Server error: {e}");
        std::process::exit(1);
    }
}

/// Probe used by the container healthcheck.
///
/// It verifies that the database is actually reachable and answerable rather
/// than merely that the process is alive, and it does so without binding the
/// HTTP port. Prints a short line for the Docker log and returns a process
/// exit code.
async fn run_health_check() -> i32 {
    let db_url = match std::env::var("DATABASE_URL") {
        Ok(url) => url,
        Err(_) => {
            eprintln!("health: DATABASE_URL is not set");
            return 1;
        }
    };

    let timeout = std::time::Duration::from_secs(5);

    let probe = async {
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(timeout)
            .connect(&db_url)
            .await?;
        let name: String = sqlx::query_scalar("SELECT current_database()")
            .fetch_one(&pool)
            .await?;
        Ok::<_, sqlx::Error>(name)
    };

    match tokio::time::timeout(timeout, probe).await {
        Ok(Ok(name)) => {
            println!("health: ok (database {name})");
            0
        }
        Ok(Err(e)) => {
            // Keep the driver's message: it is written to the container log,
            // not to a user-facing surface, and it names the real cause.
            eprintln!("health: database query failed: {e}");
            1
        }
        Err(_) => {
            eprintln!("health: database query timed out after {timeout:?}");
            1
        }
    }
}

#[cfg(test)]
mod health_check_tests {
    use super::*;

    #[tokio::test]
    async fn missing_database_url_fails_fast() {
        // Guards the branch that must never fall through to a success exit:
        // an unset DATABASE_URL has to be a failure, not a healthy probe.
        let previous = std::env::var("DATABASE_URL").ok();
        // SAFETY: single-threaded test process; the variable is restored below.
        unsafe { std::env::remove_var("DATABASE_URL") };

        let code = run_health_check().await;

        if let Some(value) = previous {
            // SAFETY: see above.
            unsafe { std::env::set_var("DATABASE_URL", value) };
        }
        assert_eq!(
            code, 1,
            "a probe without DATABASE_URL must report unhealthy"
        );
    }

    #[tokio::test]
    async fn unreachable_database_reports_failure() {
        // Port 1 on loopback refuses connections, so the probe must fail
        // rather than hang or exit zero.
        let code = with_database_url(
            "postgres://trackly:trackly@127.0.0.1:1/trackly",
            run_health_check(),
        )
        .await;
        assert_eq!(code, 1, "an unreachable database must report unhealthy");
    }

    /// Run `fut` with DATABASE_URL temporarily set to `url`.
    async fn with_database_url<F: std::future::Future<Output = i32>>(url: &str, fut: F) -> i32 {
        let previous = std::env::var("DATABASE_URL").ok();
        // SAFETY: single-threaded test process; restored immediately after.
        unsafe { std::env::set_var("DATABASE_URL", url) };
        let code = fut.await;
        match previous {
            Some(value) => {
                // SAFETY: see above.
                unsafe { std::env::set_var("DATABASE_URL", value) };
            }
            None => {
                // SAFETY: see above.
                unsafe { std::env::remove_var("DATABASE_URL") };
            }
        }
        code
    }
}
