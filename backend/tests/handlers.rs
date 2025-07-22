use axum::body::to_bytes;
use axum::routing::post;
use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use backend::handlers;
use backend::models::TrackExistResponse;
use serde_json::from_slice;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::sync::Arc;
use tower::ServiceExt; // for .oneshot()

// Helper function to create a mock PgPool (in-memory SQLite for simplicity if needed, or mock)
// For true integration tests, a real test PostgreSQL database is needed.
// The connection string is now read from the DATABASE_URL environment variable (or TEST_DATABASE_URL for test-specific overrides).
async fn setup_test_pool() -> Arc<PgPool> {
    // Prefer TEST_DATABASE_URL, fallback to DATABASE_URL, never hardcode
    let db_url = std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .expect("Either TEST_DATABASE_URL or DATABASE_URL must be set for tests");
    Arc::new(
        PgPoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .expect("Failed to create test pool"),
    )
}

#[tokio::test]
async fn test_health_handler() {
    let app = Router::new().route("/health", axum::routing::get(handlers::health));
    let req = Request::builder()
        .uri("/health")
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_check_track_exist_no_file() {
    let pool = setup_test_pool().await;
    let app = Router::new()
        .route("/track/exist", post(handlers::check_track_exist)) // Updated route
        .with_state(pool);

    // Simulate a multipart request with no 'file' field or empty
    // This is tricky to do correctly without a multipart builder.
    // We expect the handler to return Ok(Json(TrackExistResponse { is_exist: false, id: None }))
    // if file_bytes or file_name is None.

    // A more direct way to test this part of the handler would be to refactor
    // the handler to accept parsed parts, or use a test helper that can build Multipart.
    // For now, we'll test the outcome if the handler proceeds as if no file was found.
    // This specific test case is hard to trigger precisely without fine-grained multipart control.
    // Let's assume the handler's internal logic for None file_bytes is hit.
    // One way to force this is an empty multipart body, though the handler might error out earlier.
    let request = Request::builder()
        .method("POST")
        .uri("/track/exist") // Updated URI
        .header(
            "content-type",
            "multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW",
        )
        .body(Body::empty()) // Empty body
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK); // Should be OK because it defaults to not existing

    let body_bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let track_response: TrackExistResponse = from_slice(&body_bytes).unwrap();
    assert!(!track_response.is_exist);
    assert_eq!(track_response.id, None);
}

#[tokio::test]
async fn test_upload_track_no_file() {
    let pool = setup_test_pool().await;
    let app = Router::new()
        .route("/tracks/upload", post(handlers::upload_track))
        .with_state(pool);

    let request = Request::builder()
        .method("POST")
        .uri("/tracks/upload")
        .header("content-type", "multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW")
        .body(Body::from("------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name=\"name\"\r\n\r\nTest Track\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW--\r\n")) // Missing file part
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_upload_track_unsupported_file_type() {
    let pool = setup_test_pool().await;
    let app = Router::new()
        .route("/tracks/upload", post(handlers::upload_track))
        .with_state(pool);

    let boundary = "boundary";
    let body = format!(
        "--{boundary}\r\n\
        Content-Disposition: form-data; name=\"file\"; filename=\"test.txt\"\r\n\
        Content-Type: text/plain\r\n\r\n\
        Some test data\r\n\
        --{boundary}\r\n\
        Content-Disposition: form-data; name=\"name\"\r\n\r\n\
        Test Track\r\n\
        --{boundary}--\r\n"
    );

    let request = Request::builder()
        .method("POST")
        .uri("/tracks/upload")
        .header(
            "content-type",
            format!("multipart/form-data; boundary={boundary}"),
        )
        .body(Body::from(body))
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

// Note: Testing actual file uploads (GPX/KML parsing) and database interactions (track_exists, insert_track)
// correctly requires a more elaborate setup:
// 1. A running test PostgreSQL database with the correct schema.
// 2. Sample GPX/KML files.
// 3. Potentially mocking the `db::` functions if direct DB testing is too complex for this stage.
//
// The `create_multipart_request_with_file` helper is very basic. Real-world scenarios
// would use a crate like `axum-test-helper` or `reqwest` (if testing an HTTP server externally)
// to build these requests.
//
// For `check_track_exist` with a file:
// - Mock `track_utils::parse_gpx` / `parse_kml` to return a specific hash.
// - Mock `db::track_exists` to return Some(uuid) or None.
//
// For `upload_track` with a file:
// - Mock `track_utils::parse_gpx` / `parse_kml` to return `ParsedTrackData`.
//   This `ParsedTrackData` should include test values for `hr_data` (e.g., `Some(vec![Some(100), Some(110)])`)
//   and `avg_hr` (e.g., `Some(105)`).
// - Mock `db::track_exists` (for deduplication check).
// - Mock `db::insert_track` and verify it's called with the correct `avg_hr`
//   and `hr_data_json` (which should be the JSON serialized version of `ParsedTrackData.hr_data`).

/*
#[tokio::test]
async fn test_check_track_exist_gpx_found() {
    // --- This test requires significant mocking infrastructure or a live DB ---
    // 1. Setup mock pool / DB state where a track with a known hash exists.
    // 2. Create a valid GPX file content.
    // 3. Build a multipart request with this file.
    // 4. Ensure `track_utils::parse_gpx` is called and returns the expected hash.
    // 5. Ensure `db::track_exists` is called with that hash and returns the existing ID.

    let pool = setup_test_pool().await; // Needs to point to a test DB
    let app = Router::new()
        .route("/tracks", post(handlers::create_track))
        .route("/track/exist", post(handlers::check_track_exist)) // Updated route
        .with_state(pool.clone());

    // Minimal GPX content
    let gpx_content = "<?xml version=\"1.0\"?><gpx version=\"1.1\" creator=\"test\"><trk><trkseg><trkpt lat=\"0\" lon=\"0\"></trkpt></trkseg></trk></gpx>";
    let file_name = "test.gpx";

    // Assume `track_utils::parse_gpx` for this content yields a hash, e.g., "testhashgpx"
    // And assume a track with this hash exists in the DB with id `test_uuid`
    // let test_uuid = Uuid::new_v4();
    // You would need to insert this into your test DB before running the test,
    // or mock the db::track_exists function.

    let request = create_multipart_request_with_file(
        "dummy.gpx", // not used by current helper
        gpx_content.as_bytes().to_vec(),
        file_name,
        "/tracks/exist"
    );

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body_bytes = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let track_response: TrackExistResponse = serde_json::from_slice(&body_bytes).unwrap();

    // This assertion depends on the mocked/test DB state
    // assert_eq!(track_response.is_exist, true);
    // assert_eq!(track_response.id, Some(test_uuid));
}
*/

#[tokio::test]
async fn test_update_track_name_not_found() {
    let pool = setup_test_pool().await;
    let app = Router::new()
        .route(
            "/tracks/{id}/name",
            axum::routing::patch(handlers::update_track_name),
        )
        .with_state(pool);

    let fake_uuid = uuid::Uuid::new_v4();
    let fake_session_id = uuid::Uuid::new_v4();
    let payload = serde_json::json!({
        "name": "Updated Track Name",
        "session_id": fake_session_id.to_string()
    });

    let req = Request::builder()
        .uri(format!("/tracks/{fake_uuid}/name"))
        .method("PATCH")
        .header("content-type", "application/json")
        .body(Body::from(payload.to_string()))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_update_track_name_empty_name() {
    let pool = setup_test_pool().await;
    let app = Router::new()
        .route(
            "/tracks/{id}/name",
            axum::routing::patch(handlers::update_track_name),
        )
        .with_state(pool);

    let fake_uuid = uuid::Uuid::new_v4();
    let fake_session_id = uuid::Uuid::new_v4();
    let payload = serde_json::json!({
        "name": "",
        "session_id": fake_session_id.to_string()
    });

    let req = Request::builder()
        .uri(format!("/tracks/{fake_uuid}/name"))
        .method("PATCH")
        .header("content-type", "application/json")
        .body(Body::from(payload.to_string()))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_update_track_name_too_long() {
    let pool = setup_test_pool().await;
    let app = Router::new()
        .route(
            "/tracks/{id}/name",
            axum::routing::patch(handlers::update_track_name),
        )
        .with_state(pool);

    let fake_uuid = uuid::Uuid::new_v4();
    let fake_session_id = uuid::Uuid::new_v4();
    let long_name = "a".repeat(256); // 256 characters, too long
    let payload = serde_json::json!({
        "name": long_name,
        "session_id": fake_session_id.to_string()
    });

    let req = Request::builder()
        .uri(format!("/tracks/{fake_uuid}/name"))
        .method("PATCH")
        .header("content-type", "application/json")
        .body(Body::from(payload.to_string()))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_export_track_gpx_not_found() {
    let pool = setup_test_pool().await;
    let app = Router::new()
        .route(
            "/tracks/{id}/export",
            axum::routing::get(handlers::export_track_gpx),
        )
        .with_state(pool);

    let req = Request::builder()
        .uri("/tracks/00000000-0000-0000-0000-000000000000/export")
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_export_track_gpx_invalid_uuid() {
    let pool = setup_test_pool().await;
    let app = Router::new()
        .route(
            "/tracks/{id}/export",
            axum::routing::get(handlers::export_track_gpx),
        )
        .with_state(pool);

    let req = Request::builder()
        .uri("/tracks/invalid-uuid/export")
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}
