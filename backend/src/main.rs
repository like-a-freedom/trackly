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
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing::info;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() {
    // Handle health check flag
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 && args[1] == "--health-check" {
        // Simple health check - try to connect to the health endpoint
        match tokio::net::TcpStream::connect("127.0.0.1:8080").await {
            Ok(_) => {
                println!("Health check passed");
                std::process::exit(0);
            }
            Err(_) => {
                eprintln!("Health check failed");
                std::process::exit(1);
            }
        }
    }

    // Load environment variables from `.env` during local development
    // dotenvy will silently ignore if no .env file exists.
    dotenvy::dotenv().ok();

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

    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/metrics", get(metrics::serve_metrics))
        .route("/api/tracks/upload", post(handlers::upload_track))
        .route("/api/tracks", get(handlers::list_tracks_geojson))
        .route("/api/tracks", post(handlers::upload_track))
        .route("/api/tracks/exist", post(handlers::check_track_exist))
        .route("/api/tracks/search", get(handlers::search_tracks))
        .route("/api/tracks/{id}", get(handlers::get_track))
        .route(
            "/api/tracks/{id}/simplified",
            get(handlers::get_track_simplified),
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
        .route("/api/tracks/{id}/export", get(handlers::export_track_gpx))
        .route(
            "/api/tracks/{id}/enrich-elevation",
            post(handlers::enrich_elevation),
        )
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
            get(handlers::get_poi).delete(handlers::delete_poi),
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
