use backend::db;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use uuid::Uuid;

#[tokio::test]
async fn test_track_exists_and_insert() {
    // Using mocks, for real tests, you need to set up a test database
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set for tests");
    let pool = Arc::new(
        PgPoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .unwrap(),
    );
    let id = Uuid::new_v4();
    let hash = format!("testhash-{id}");
    let name = "Test Track";
    let cats = ["testcat"];
    let geom_geojson = serde_json::json!({
        "type": "LineString",
        "coordinates": vec![vec![0.0, 0.0], vec![1.0, 1.0]]
    });
    let res = db::insert_track(backend::db::InsertTrackParams {
        pool: &pool,
        id,
        name,
        description: Some("desc".to_string()),
        categories: &cats[..],
        auto_classifications: &["aerobic_run".to_string()],
        geom_geojson: &geom_geojson,
        length_km: 1.0,
        elevation_profile_json: None,
        hr_data_json: None,
        temp_data_json: None,
        time_data_json: None,
        elevation_up: None,
        elevation_down: None,
        avg_speed: None,
        avg_hr: Some(150),
        hr_min: None,
        hr_max: None,
        moving_time: None,
        pause_time: None,
        moving_avg_speed: None,
        moving_avg_pace: None,
        duration_seconds: Some(3600),
        hash: &hash,
        recorded_at: None,
        session_id: None,
    })
    .await;
    if let Err(e) = &res {
        println!("insert_track error: {e:?}");
    }
    assert!(res.is_ok());
    let found = db::track_exists(&pool, &hash).await.unwrap();
    assert_eq!(found, Some(id));
}

#[tokio::test]
async fn test_insert_track_with_time_data() {
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set for tests");
    let pool = Arc::new(
        PgPoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .unwrap(),
    );

    let id = Uuid::new_v4();
    let hash = format!("testhash-with-time-{id}");
    let name = "Test Track with Time";
    let cats = ["testcat"];
    let geom_geojson = serde_json::json!({
        "type": "LineString",
        "coordinates": vec![vec![0.0, 0.0], vec![1.0, 1.0]]
    });

    let time_data = serde_json::json!(["2024-01-01T10:00:00Z", "2024-01-01T10:01:00Z"]);

    let res = db::insert_track(backend::db::InsertTrackParams {
        pool: &pool,
        id,
        name,
        description: Some("Track with timestamps".to_string()),
        categories: &cats[..],
        auto_classifications: &["aerobic_run".to_string()],
        geom_geojson: &geom_geojson,
        length_km: 1.0,
        elevation_profile_json: None,
        hr_data_json: None,
        temp_data_json: None,
        time_data_json: Some(time_data),
        elevation_up: None,
        elevation_down: None,
        avg_speed: None,
        avg_hr: Some(150),
        hr_min: None,
        hr_max: None,
        moving_time: None,
        pause_time: None,
        moving_avg_speed: None,
        moving_avg_pace: None,
        duration_seconds: Some(3600),
        hash: &hash,
        recorded_at: None,
        session_id: None,
    })
    .await;

    assert!(
        res.is_ok(),
        "Failed to insert track with time_data: {:?}",
        res.err()
    );

    // Verify the track was inserted
    let found = db::track_exists(&pool, &hash).await.unwrap();
    assert_eq!(found, Some(id));

    // Optionally, verify that time_data was stored correctly by retrieving the track
    // This would require a get_track function in db module
}
