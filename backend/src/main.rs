use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Router,
};
use backend::{handlers, metrics};
use mimalloc::MiMalloc;
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use std::sync::Arc;
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

    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .event_format(tracing_subscriber::fmt::format().json())
        .init();

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

    // Run migrations automatically on startup
    info!("Running database migrations...");
    sqlx::migrate!("./migrations")
        .run(&*pool)
        .await
        .expect("Failed to run migrations");
    info!("Database migrations completed successfully");

    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/metrics", get(metrics::serve_metrics))
        .route("/tracks/upload", post(handlers::upload_track))
        .route("/tracks", get(handlers::list_tracks_geojson))
        .route("/tracks", post(handlers::upload_track))
        .route("/tracks/exist", post(handlers::check_track_exist))
        .route("/tracks/search", get(handlers::search_tracks))
        .route("/tracks/{id}", get(handlers::get_track))
        .route(
            "/tracks/{id}/simplified",
            get(handlers::get_track_simplified),
        )
        .route(
            "/tracks/{id}/description",
            axum::routing::patch(handlers::update_track_description),
        )
        .route(
            "/tracks/{id}/name",
            axum::routing::patch(handlers::update_track_name),
        )
        .route("/tracks/{id}/export", get(handlers::export_track_gpx))
        .route(
            "/tracks/{id}/enrich-elevation",
            post(handlers::enrich_elevation),
        )
        .route(
            "/tracks/{id}/slope-profile",
            get(handlers::get_track_slope_profile),
        )
        .route(
            "/tracks/{id}/recalculate-slopes",
            post(handlers::recalculate_track_slopes),
        )
        .route(
            "/tracks/{id}",
            axum::routing::delete(handlers::delete_track),
        )
        // POI routes
        .route("/pois", get(handlers::get_pois).post(handlers::create_poi))
        .route(
            "/pois/{id}",
            get(handlers::get_poi).delete(handlers::delete_poi),
        )
        .route("/tracks/{track_id}/pois", get(handlers::get_track_pois))
        .route(
            "/tracks/{track_id}/pois/{poi_id}",
            axum::routing::delete(handlers::unlink_track_poi),
        )
        .layer(DefaultBodyLimit::max(max_body_size))
        .layer(metrics::HttpMetricsLayer::new())
        .with_state(pool);
    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    info!("listening on {}", addr);
    info!(
        "max body size: {} bytes ({} MB)",
        max_body_size,
        max_body_size / (1024 * 1024)
    );
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| {
            eprintln!("Failed to bind to address {addr}: {e}");
            // Consider a more graceful shutdown or specific error type if this were a library
            std::process::exit(1);
        })
        .unwrap();

    axum::serve(listener, app.into_make_service())
        .await
        .map_err(|e| {
            eprintln!("Server error: {e}");
            // Consider a more graceful shutdown
            std::process::exit(1);
        })
        .unwrap();
}
