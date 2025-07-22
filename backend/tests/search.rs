use backend::db;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

#[tokio::test]
async fn test_search_tracks_by_name() {
    let pool = get_test_pool().await;
    
    // Insert a test track
    let track_id = Uuid::new_v4();
    let unique_hash = format!("test_hash_{}", Uuid::new_v4());
    let test_geom = serde_json::json!({
        "type": "LineString",
        "coordinates": [[0.0, 0.0], [1.0, 1.0]]
    });
    
    db::insert_track(backend::db::InsertTrackParams {
        pool: &pool,
        id: track_id,
        name: "Test Running Track",
        description: Some("A great running route".to_string()),
        categories: &["running"],
        auto_classifications: &["running".to_string()],
        geom_geojson: &test_geom,
        length_km: 5.0,
        elevation_profile_json: None,
        hr_data_json: None,
        temp_data_json: None,
        time_data_json: None,
        elevation_up: None,
        elevation_down: None,
        avg_speed: None,
        avg_hr: None,
        hr_min: None,
        hr_max: None,
        moving_time: None,
        pause_time: None,
        moving_avg_speed: None,
        moving_avg_pace: None,
        duration_seconds: None,
        hash: &unique_hash,
        recorded_at: None,
        session_id: None,
    })
    .await
    .unwrap();

    // Search by name
    let results = db::search_tracks(&pool, "running").await.unwrap();
    assert!(!results.is_empty());
    assert_eq!(results[0].name, "Test Running Track");
    
    // Search by description
    let results = db::search_tracks(&pool, "great").await.unwrap();
    assert!(!results.is_empty());
    assert_eq!(results[0].name, "Test Running Track");
    
    // Search with no results
    let results = db::search_tracks(&pool, "nonexistent").await.unwrap();
    assert!(results.is_empty());
}

#[tokio::test]
async fn test_search_tracks_case_insensitive() {
    let pool = get_test_pool().await;
    
    let track_id = Uuid::new_v4();
    let unique_hash = format!("test_hash_2_{}", Uuid::new_v4());
    let test_geom = serde_json::json!({
        "type": "LineString",
        "coordinates": [[0.0, 0.0], [1.0, 1.0]]
    });
    
    db::insert_track(backend::db::InsertTrackParams {
        pool: &pool,
        id: track_id,
        name: "Mountain Bike Trail",
        description: Some("Challenging MOUNTAIN bike route".to_string()),
        categories: &["cycling"],
        auto_classifications: &["cycling".to_string()],
        geom_geojson: &test_geom,
        length_km: 10.0,
        elevation_profile_json: None,
        hr_data_json: None,
        temp_data_json: None,
        time_data_json: None,
        elevation_up: None,
        elevation_down: None,
        avg_speed: None,
        avg_hr: None,
        hr_min: None,
        hr_max: None,
        moving_time: None,
        pause_time: None,
        moving_avg_speed: None,
        moving_avg_pace: None,
        duration_seconds: None,
        hash: &unique_hash,
        recorded_at: None,
        session_id: None,
    })
    .await
    .unwrap();

    // Test case insensitive search
    let results = db::search_tracks(&pool, "MOUNTAIN").await.unwrap();
    assert!(!results.is_empty());
    
    let results = db::search_tracks(&pool, "mountain").await.unwrap();
    assert!(!results.is_empty());
    
    let results = db::search_tracks(&pool, "Mountain").await.unwrap();
    assert!(!results.is_empty());
}

async fn get_test_pool() -> Arc<PgPool> {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:password@localhost:5432/trackly_test".to_string());
    
    Arc::new(
        sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .connect(&database_url)
            .await
            .expect("Failed to connect to test database")
    )
}
