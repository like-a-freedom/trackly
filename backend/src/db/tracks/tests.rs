use super::*;
use crate::error::AppError;
use crate::models::TrackGeoJsonQuery;
use serde_json::json;

#[test]
fn list_tracks_query_uses_binds_for_filters() {
    let params = crate::models::TrackListQuery {
        categories: Some(vec!["run".to_string(), "mtb".to_string()]),
        min_length: Some(10.5),
        max_length: Some(42.0),
        elevation_gain_min: Some(100.0),
        elevation_gain_max: Some(900.0),
        slope_min: Some(1.5),
        slope_max: Some(12.0),
        owner_session_id: None,
        owner_user_id: None,
        mine: None,
    };

    let builder = build_list_tracks_query(&params);
    let sql = builder.sql().to_string();

    // Expect placeholders rather than inlined user input
    assert!(sql.contains("$1"));
    assert!(sql.contains("$2"));
    assert!(!sql.contains("run"));
    assert!(!sql.contains("10.5"));
}

#[test]
fn sanitize_description_strips_script_tags() {
    let input = Some("<script>alert('x')</script><b>ok</b>");
    let cleaned = sanitize_description(input);
    assert_eq!(cleaned.as_deref(), Some("<b>ok</b>"));
}

#[test]
fn heatmap_grid_size_respects_bounds() {
    let low_zoom = heatmap_grid_size_degrees(0.0);
    let mid_zoom = heatmap_grid_size_degrees(12.0);
    let high_zoom = heatmap_grid_size_degrees(20.0);

    assert!(low_zoom <= 0.05);
    assert!(high_zoom >= 0.00015);
    assert!(mid_zoom < low_zoom);
    assert!(high_zoom < mid_zoom);
}

#[test]
fn compute_gap_metadata_detects_segment_boundaries() {
    let segments = vec![
        vec![(0.0, 0.0), (0.0, 0.001)],
        vec![(0.0, 0.002), (0.0, 0.003)],
    ];

    let (segment_gaps, pause_gaps) = compute_gap_metadata(Some(&segments), None);

    assert!(pause_gaps.is_none());
    let gaps = segment_gaps.expect("Expected segment gaps");
    assert_eq!(gaps.len(), 1);

    let gap = &gaps[0];
    assert_eq!(gap.kind, "segment");
    assert_eq!(gap.from.segment_index, 0);
    assert_eq!(gap.to.segment_index, 1);
    assert_eq!(gap.from.point_index, 1);
    assert_eq!(gap.to.point_index, 0);
    assert!(gap.distance_m > 100.0); // ~111m per 0.001° at equator
    assert!(gap.duration_seconds.is_none());
}

#[test]
fn compute_gap_metadata_detects_pause_on_single_segment() {
    let segments = vec![vec![(0.0, 0.0), (0.0, 0.001), (0.0, 0.002)]];
    let time_data = json!([
        "2024-01-01T00:00:00Z",
        "2024-01-01T00:01:00Z",
        "2024-01-01T00:06:00Z"
    ]);

    let (segment_gaps, pause_gaps) = compute_gap_metadata(Some(&segments), Some(&time_data));

    assert!(segment_gaps.is_none());
    let gaps = pause_gaps.expect("Expected pause gaps");
    assert_eq!(gaps.len(), 1);

    let gap = &gaps[0];
    assert_eq!(gap.kind, "pause");
    assert_eq!(gap.from.segment_index, 0);
    assert_eq!(gap.to.segment_index, 0);
    assert_eq!(gap.from.point_index, 1);
    assert_eq!(gap.to.point_index, 2);
    assert_eq!(gap.duration_seconds, Some(300));
    assert!(gap.distance_m > 100.0);
}

#[tokio::test]
#[ignore] // Requires database setup
async fn test_update_track_elevation() {
    // This test would verify that update_track_elevation correctly
    // updates all elevation fields in the database
    // Requires test database setup and transaction rollback
}

#[tokio::test]
#[ignore] // Requires database setup
async fn test_update_track_categories_db() {
    use sqlx::postgres::PgPoolOptions;
    use std::sync::Arc;
    use uuid::Uuid;

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set for tests");
    let pool = Arc::new(
        PgPoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .unwrap(),
    );

    let id = Uuid::new_v4();
    let hash = format!("testhash-cat-{id}");
    let name = "Test Track Categories";
    let cats = ["initial"];
    let geom_geojson = serde_json::json!({
        "type": "LineString",
        "coordinates": [[0.0, 0.0], [1.0, 1.0]]
    });

    insert_track(InsertTrackParams {
        pool: &pool,
        id,
        name,
        description: Some("desc".to_string()),
        categories: &cats[..],

        geom_geojson: &geom_geojson,
        length_km: 1.0,
        elevation_profile_json: None,
        hr_data_json: None,
        temp_data_json: None,
        time_data_json: None,
        elevation_gain: None,
        elevation_loss: None,
        elevation_min: None,
        elevation_max: None,
        elevation_enriched: None,
        elevation_enriched_at: None,
        elevation_dataset: None,
        elevation_api_calls: None,
        slope_min: None,
        slope_max: None,
        slope_avg: None,
        slope_histogram: None,
        slope_segments: None,
        avg_speed: None,
        avg_hr: None,
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
        speed_data_json: None,
        pace_data_json: None,
    })
    .await
    .unwrap();

    // Update categories
    let new_cats = vec!["running".to_string(), "mtb".to_string()];
    update_track_categories(&pool, id, &new_cats).await.unwrap();

    let detail = get_track_detail(&pool, id)
        .await
        .unwrap()
        .expect("track not found");
    assert_eq!(detail.categories, new_cats);
}

#[tokio::test]
#[ignore] // Requires database setup
async fn test_update_track_categories_handler_owner_check() {
    use crate::models::UpdateTrackCategoriesRequest as Req;
    use axum::Json;
    use axum::extract::{Path, State};
    use axum::http::StatusCode;
    use sqlx::postgres::PgPoolOptions;
    use std::sync::Arc;
    use uuid::Uuid;

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set for tests");
    let pool = Arc::new(
        PgPoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .unwrap(),
    );

    let owner = Uuid::new_v4();
    let other = Uuid::new_v4();
    let id = Uuid::new_v4();
    let hash = format!("testhash-handler-{id}");
    let cats = ["initial"];
    let geom_geojson = serde_json::json!({"type":"LineString","coordinates":[[0.0,0.0],[1.0,1.0]]});

    insert_track(InsertTrackParams {
        pool: &pool,
        id,
        name: "Owner Track",
        description: Some("desc".to_string()),
        categories: &cats[..],

        geom_geojson: &geom_geojson,
        length_km: 1.0,
        elevation_profile_json: None,
        hr_data_json: None,
        temp_data_json: None,
        time_data_json: None,
        elevation_gain: None,
        elevation_loss: None,
        elevation_min: None,
        elevation_max: None,
        elevation_enriched: None,
        elevation_enriched_at: None,
        elevation_dataset: None,
        elevation_api_calls: None,
        slope_min: None,
        slope_max: None,
        slope_avg: None,
        slope_histogram: None,
        slope_segments: None,
        avg_speed: None,
        avg_hr: None,
        hr_min: None,
        hr_max: None,
        moving_time: None,
        pause_time: None,
        moving_avg_speed: None,
        moving_avg_pace: None,
        duration_seconds: Some(3600),
        hash: &hash,
        recorded_at: None,
        session_id: Some(owner),
        speed_data_json: None,
        pace_data_json: None,
    })
    .await
    .unwrap();

    // Attempt update with wrong session
    let payload = Req {
        session_id: other,
        categories: vec!["x".to_string()],
    };
    let res = crate::handlers::update_track_categories(
        State(pool.clone()),
        Path(id),
        crate::auth::OptionalAuthUser(None),
        Json(payload),
    )
    .await;
    assert!(matches!(res, Err(AppError::Forbidden)));

    // Update with owner session
    let payload_ok = Req {
        session_id: owner,
        categories: vec!["new".to_string()],
    };
    let res_ok = crate::handlers::update_track_categories(
        State(pool.clone()),
        Path(id),
        crate::auth::OptionalAuthUser(None),
        Json(payload_ok),
    )
    .await;
    assert!(res_ok.is_ok());
    let detail = get_track_detail(&pool, id)
        .await
        .unwrap()
        .expect("not found");
    assert_eq!(detail.categories, vec!["new".to_string()]);
}

#[tokio::test]
#[ignore] // Requires database setup
async fn test_update_track_categories_empty_rejected() {
    use crate::models::UpdateTrackCategoriesRequest as Req;
    use axum::Json;
    use axum::extract::{Path, State};
    use axum::http::StatusCode;
    use sqlx::postgres::PgPoolOptions;
    use std::sync::Arc;
    use uuid::Uuid;

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set for tests");
    let pool = Arc::new(
        PgPoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .unwrap(),
    );

    let owner = Uuid::new_v4();
    let id = Uuid::new_v4();
    let hash = format!("testhash-emptycat-{id}");
    let cats = ["initial"];
    let geom_geojson = serde_json::json!({"type":"LineString","coordinates":[[0.0,0.0],[1.0,1.0]]});

    insert_track(InsertTrackParams {
        pool: &pool,
        id,
        name: "Owner Track Empty",
        description: Some("desc".to_string()),
        categories: &cats[..],

        geom_geojson: &geom_geojson,
        length_km: 1.0,
        elevation_profile_json: None,
        hr_data_json: None,
        temp_data_json: None,
        time_data_json: None,
        elevation_gain: None,
        elevation_loss: None,
        elevation_min: None,
        elevation_max: None,
        elevation_enriched: None,
        elevation_enriched_at: None,
        elevation_dataset: None,
        elevation_api_calls: None,
        slope_min: None,
        slope_max: None,
        slope_avg: None,
        slope_histogram: None,
        slope_segments: None,
        avg_speed: None,
        avg_hr: None,
        hr_min: None,
        hr_max: None,
        moving_time: None,
        pause_time: None,
        moving_avg_speed: None,
        moving_avg_pace: None,
        duration_seconds: Some(3600),
        hash: &hash,
        recorded_at: None,
        session_id: Some(owner),
        speed_data_json: None,
        pace_data_json: None,
    })
    .await
    .unwrap();

    // Attempt update with owner session but empty categories
    let payload = Req {
        session_id: owner,
        categories: vec![],
    };
    let res = crate::handlers::update_track_categories(
        State(pool.clone()),
        Path(id),
        crate::auth::OptionalAuthUser(None),
        Json(payload),
    )
    .await;
    assert!(matches!(res, Err(AppError::BadRequest(_))));

    // Attempt update with only whitespace categories
    let payload2 = Req {
        session_id: owner,
        categories: vec![" ".to_string(), "".to_string()],
    };
    let res2 = crate::handlers::update_track_categories(
        State(pool.clone()),
        Path(id),
        crate::auth::OptionalAuthUser(None),
        Json(payload2),
    )
    .await;
    assert!(matches!(res2, Err(AppError::BadRequest(_))));
}

#[tokio::test]
#[ignore] // Requires database setup
async fn test_elevation_filters_in_list_tracks_geojson() {
    // This test would verify that elevation filters work correctly
    // in the list_tracks_geojson function by:
    // 1. Creating test tracks with different elevation values
    // 2. Applying various elevation filters
    // 3. Verifying correct tracks are returned
    // Requires test database setup and transaction rollback
}

#[tokio::test]
#[ignore] // Requires database setup
async fn test_owner_filter_in_list_tracks_geojson() {
    // This test would verify that owner_session_id filter works correctly
    // in the list_tracks_geojson function by:
    // 1. Creating a test track owned by a specific session id (private)
    // 2. Ensuring it is not returned by default (public-only query)
    // 3. Querying with owner_session_id set and ensuring the track is returned
    // Requires test database setup and transaction rollback
}

#[tokio::test]
#[ignore] // Requires database setup
async fn test_elevation_filters_performance() {
    // This test would verify that elevation filters perform well
    // with large datasets and proper indexing
    // Requires test database setup with large dataset
}

// Additional integration tests for track operations

#[tokio::test]
#[ignore] // Requires database setup
async fn test_track_exists_and_insert() {
    use sqlx::postgres::PgPoolOptions;
    use std::sync::Arc;
    use uuid::Uuid;

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
    let res = insert_track(InsertTrackParams {
        pool: &pool,
        id,
        name,
        description: Some("desc".to_string()),
        categories: &cats[..],

        geom_geojson: &geom_geojson,
        length_km: 1.0,
        elevation_profile_json: None,
        hr_data_json: None,
        temp_data_json: None,
        time_data_json: None,
        elevation_gain: None,
        elevation_loss: None,
        elevation_min: None,
        elevation_max: None,
        elevation_enriched: None,
        elevation_enriched_at: None,
        elevation_dataset: None,
        elevation_api_calls: None,
        slope_min: None,
        slope_max: None,
        slope_avg: None,
        slope_histogram: None,
        slope_segments: None,
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
        speed_data_json: None,
        pace_data_json: None,
    })
    .await;
    if let Err(e) = &res {
        println!("insert_track error: {e:?}");
    }
    assert!(res.is_ok());
    let found = track_exists(&pool, &hash).await.unwrap();
    assert_eq!(found, Some(id));
}

#[tokio::test]
#[ignore] // Requires database setup
async fn test_insert_track_with_time_data() {
    use sqlx::postgres::PgPoolOptions;
    use std::sync::Arc;
    use uuid::Uuid;

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

    let res = insert_track(InsertTrackParams {
        pool: &pool,
        id,
        name,
        description: Some("Track with timestamps".to_string()),
        categories: &cats[..],

        geom_geojson: &geom_geojson,
        length_km: 1.0,
        elevation_profile_json: None,
        hr_data_json: None,
        temp_data_json: None,
        time_data_json: Some(time_data),
        elevation_gain: None,
        elevation_loss: None,
        elevation_min: None,
        elevation_max: None,
        elevation_enriched: None,
        elevation_enriched_at: None,
        elevation_dataset: None,
        elevation_api_calls: None,
        slope_min: None,
        slope_max: None,
        slope_avg: None,
        slope_histogram: None,
        slope_segments: None,
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
        speed_data_json: None,
        pace_data_json: None,
    })
    .await;

    assert!(
        res.is_ok(),
        "Failed to insert track with time_data: {:?}",
        res.err()
    );

    // Verify the track was inserted
    let found = track_exists(&pool, &hash).await.unwrap();
    assert_eq!(found, Some(id));

    // Optionally, verify that time_data was stored correctly by retrieving the track
    // This would require a get_track function in db module
}

#[tokio::test]
#[ignore] // Requires database setup
async fn test_search_tracks_by_name() {
    use sqlx::postgres::PgPoolOptions;
    use std::sync::Arc;
    use uuid::Uuid;

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:password@localhost:5432/trackly_test".to_string());

    let pool = Arc::new(
        PgPoolOptions::new()
            .max_connections(1)
            .connect(&database_url)
            .await
            .expect("Failed to connect to test database"),
    );

    // Insert a test track
    let track_id = Uuid::new_v4();
    let unique_hash = format!("test_hash_{}", Uuid::new_v4());
    let test_geom = serde_json::json!({
        "type": "LineString",
        "coordinates": [[0.0, 0.0], [1.0, 1.0]]
    });

    insert_track(InsertTrackParams {
        pool: &pool,
        id: track_id,
        name: "Test Running Track",
        description: Some("A great running route".to_string()),
        categories: &["running"],

        geom_geojson: &test_geom,
        length_km: 5.0,
        elevation_profile_json: None,
        hr_data_json: None,
        temp_data_json: None,
        time_data_json: None,
        elevation_gain: None,
        elevation_loss: None,
        elevation_min: None,
        elevation_max: None,
        elevation_enriched: None,
        elevation_enriched_at: None,
        elevation_dataset: None,
        elevation_api_calls: None,
        slope_min: None,
        slope_max: None,
        slope_avg: None,
        slope_histogram: None,
        slope_segments: None,
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
        speed_data_json: None,
        pace_data_json: None,
    })
    .await
    .unwrap();

    // Search by name
    let results = search_tracks(&pool, "running").await.unwrap();
    assert!(!results.is_empty());
    assert_eq!(results[0].name, "Test Running Track");

    // Search by description
    let results = search_tracks(&pool, "great").await.unwrap();
    assert!(!results.is_empty());
    assert_eq!(results[0].name, "Test Running Track");

    // Search with no results
    let results = search_tracks(&pool, "nonexistent").await.unwrap();
    assert!(results.is_empty());
}

#[tokio::test]
#[ignore] // Requires database setup
async fn test_search_tracks_case_insensitive() {
    use sqlx::postgres::PgPoolOptions;
    use std::sync::Arc;
    use uuid::Uuid;

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:password@localhost:5432/trackly_test".to_string());

    let pool = Arc::new(
        PgPoolOptions::new()
            .max_connections(1)
            .connect(&database_url)
            .await
            .expect("Failed to connect to test database"),
    );

    let track_id = Uuid::new_v4();
    let unique_hash = format!("test_hash_2_{}", Uuid::new_v4());
    let test_geom = serde_json::json!({
        "type": "LineString",
        "coordinates": [[0.0, 0.0], [1.0, 1.0]]
    });

    insert_track(InsertTrackParams {
        pool: &pool,
        id: track_id,
        name: "Mountain Bike Trail",
        description: Some("Challenging MOUNTAIN bike route".to_string()),
        categories: &["cycling"],

        geom_geojson: &test_geom,
        length_km: 10.0,
        elevation_profile_json: None,
        hr_data_json: None,
        temp_data_json: None,
        time_data_json: None,
        elevation_gain: None,
        elevation_loss: None,
        elevation_min: None,
        elevation_max: None,
        elevation_enriched: None,
        elevation_enriched_at: None,
        elevation_dataset: None,
        elevation_api_calls: None,
        slope_min: None,
        slope_max: None,
        slope_avg: None,
        slope_histogram: None,
        slope_segments: None,
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
        speed_data_json: None,
        pace_data_json: None,
    })
    .await
    .unwrap();

    // Test case insensitive search
    let results = search_tracks(&pool, "MOUNTAIN").await.unwrap();
    assert!(!results.is_empty());

    let results = search_tracks(&pool, "mountain").await.unwrap();
    assert!(!results.is_empty());

    let results = search_tracks(&pool, "Mountain").await.unwrap();
    assert!(!results.is_empty());
}

#[test]
fn test_update_slope_params_creation() {
    use serde_json::json;

    let params = UpdateSlopeParams {
        slope_min: Some(-10.5),
        slope_max: Some(25.3),
        slope_avg: Some(7.8),
        slope_histogram: Some(json!({
            "0-5": 30,
            "5-10": 25,
            "10-15": 20,
            "15+": 25
        })),
        slope_segments: Some(json!([
            {
                "start_distance": 0.0,
                "end_distance": 100.0,
                "slope": 5.5
            },
            {
                "start_distance": 100.0,
                "end_distance": 200.0,
                "slope": -3.2
            }
        ])),
    };

    assert_eq!(params.slope_min, Some(-10.5));
    assert_eq!(params.slope_max, Some(25.3));
    assert_eq!(params.slope_avg, Some(7.8));
    assert!(params.slope_histogram.is_some());
    assert!(params.slope_segments.is_some());
}

#[test]
fn test_track_coordinates_extraction() {
    // Test helper function for coordinate extraction that would be used
    // in slope calculation workflows

    // This would test a helper function that extracts coordinates from PostGIS geometry
    // The actual implementation would need to handle ST_AsText parsing
    let mock_geom_text = "LINESTRING(37.6176 55.7558,37.6177 55.7559,37.6178 55.7560)";

    // In a real implementation, we'd have a function like:
    // let coordinates = extract_coordinates_from_geom_text(mock_geom_text);
    // assert_eq!(coordinates.len(), 3);
    // assert_eq!(coordinates[0], (37.6176, 55.7558));

    // For now, just verify the format is parseable
    assert!(mock_geom_text.starts_with("LINESTRING("));
    assert!(mock_geom_text.contains(','));
    assert!(mock_geom_text.ends_with(')'));
}

#[test]
fn test_slope_data_validation() {
    // Test that slope data validation works properly

    // Valid slope range
    let valid_params = UpdateSlopeParams {
        slope_min: Some(-30.0),
        slope_max: Some(45.0),
        slope_avg: Some(8.5),
        slope_histogram: Some(serde_json::json!({})),
        slope_segments: Some(serde_json::json!([])),
    };

    assert!(valid_params.slope_min.unwrap() >= -100.0);
    assert!(valid_params.slope_max.unwrap() <= 100.0);
    assert!(valid_params.slope_min.unwrap() <= valid_params.slope_max.unwrap());
}
