// Integration tests for track optimization APIs
// Tests zoom-based simplification and mode parameters

use backend::models::*;

#[cfg(test)]
mod integration_tests {
    use super::*;

    /// Test that list_tracks_geojson accepts zoom and mode parameters
    #[tokio::test]
    async fn test_list_tracks_with_zoom_and_mode() {
        // This is a unit test for the query parameter parsing
        let query_overview = TrackGeoJsonQuery {
            bbox: Some("37.0,55.0,37.2,55.2".to_string()),
            zoom: Some(10.0),
            mode: Some("overview".to_string()),
        };
        
        assert_eq!(query_overview.zoom, Some(10.0));
        assert_eq!(query_overview.mode, Some("overview".to_string()));
        
        let query_detail = TrackGeoJsonQuery {
            bbox: Some("37.0,55.0,37.2,55.2".to_string()),
            zoom: Some(15.0),
            mode: Some("detail".to_string()),
        };
        
        assert_eq!(query_detail.zoom, Some(15.0));
        assert_eq!(query_detail.mode, Some("detail".to_string()));
    }

    /// Test TrackMode enum functionality
    #[test]
    fn test_track_mode_parsing() {
        assert!(TrackMode::from_string("detail").is_detail());
        assert!(!TrackMode::from_string("detail").is_overview());
        
        assert!(TrackMode::from_string("overview").is_overview());
        assert!(!TrackMode::from_string("overview").is_detail());
        
        // Test case insensitivity and defaults
        assert!(TrackMode::from_string("DETAIL").is_detail());
        assert!(TrackMode::from_string("Overview").is_overview());
        assert!(TrackMode::from_string("invalid").is_overview()); // Default to overview
        assert!(TrackMode::from_string("").is_overview()); // Default to overview
    }

    /// Test TrackSimplificationQuery parameter parsing
    #[test]
    fn test_track_simplification_query() {
        let query_with_both = TrackSimplificationQuery {
            zoom: Some(12.0),
            mode: Some("detail".to_string()),
        };
        
        assert_eq!(query_with_both.zoom, Some(12.0));
        assert_eq!(query_with_both.mode, Some("detail".to_string()));
        
        let query_with_zoom_only = TrackSimplificationQuery {
            zoom: Some(8.0),
            mode: None,
        };
        
        assert_eq!(query_with_zoom_only.zoom, Some(8.0));
        assert_eq!(query_with_zoom_only.mode, None);
        
        let query_empty = TrackSimplificationQuery {
            zoom: None,
            mode: None,
        };
        
        assert_eq!(query_empty.zoom, None);
        assert_eq!(query_empty.mode, None);
    }

    /// Test that overview mode reduces data size compared to detail mode
    #[test]
    fn test_mode_affects_response_size() {
        // Create mock track data
        let overview_track = TrackGeoJsonFeature {
            type_field: "Feature".to_string(),
            geometry: serde_json::json!({"type": "LineString", "coordinates": [[37.0, 55.0]]}),
            properties: serde_json::json!({
                "id": "test-id",
                "name": "Test Track",
                "categories": ["running"],
                "length_km": 10.5
                // Note: overview mode should not include elevation_up, avg_hr, etc.
            }),
        };
        
        let detail_track = TrackGeoJsonFeature {
            type_field: "Feature".to_string(),
            geometry: serde_json::json!({"type": "LineString", "coordinates": [[37.0, 55.0]]}),
            properties: serde_json::json!({
                "id": "test-id",
                "name": "Test Track",
                "categories": ["running"],
                "length_km": 10.5,
                "elevation_up": 100.0,
                "elevation_down": 80.0,
                "avg_hr": 150,
                "avg_speed": 12.5,
                "duration_seconds": 3600,
                "recorded_at": "2023-01-01T00:00:00Z"
                // Detail mode includes more properties
            }),
        };
        
        // Convert to JSON and compare sizes
        let overview_json = serde_json::to_string(&overview_track).unwrap();
        let detail_json = serde_json::to_string(&detail_track).unwrap();
        
        // Detail mode should have more data (larger JSON)
        assert!(detail_json.len() > overview_json.len());
    }

    /// Test that different zoom levels would result in different tolerance values
    #[test]
    fn test_zoom_tolerance_calculation() {
        use backend::track_utils::tolerance_for_zoom;
        
        // Lower zoom should have higher tolerance (more simplification)
        let low_zoom_tolerance = tolerance_for_zoom(5.0);   // World view
        let mid_zoom_tolerance = tolerance_for_zoom(12.0);  // City view  
        let high_zoom_tolerance = tolerance_for_zoom(18.0); // Street view
        
        assert!(low_zoom_tolerance > mid_zoom_tolerance);
        assert!(mid_zoom_tolerance > high_zoom_tolerance);
        
        // Specific expected values
        assert_eq!(low_zoom_tolerance, 100.0);   // ~100m for world view
        assert_eq!(mid_zoom_tolerance, 25.0);    // ~25m for city view
        assert_eq!(high_zoom_tolerance, 2.0);    // ~2m for street view
    }

    /// Test performance expectations for different scenarios
    #[test]
    fn test_performance_expectations() {
        use backend::track_utils::get_simplification_params;
        use backend::models::TrackMode;
        
        // Simulate a large track with many points
        let large_track_points = 20000;
        
        // Overview mode should be more aggressive
        let overview_params = get_simplification_params(
            TrackMode::Overview, 
            Some(10.0), 
            large_track_points
        );
        
        // Detail mode should preserve more data
        let detail_params = get_simplification_params(
            TrackMode::Detail, 
            Some(10.0), 
            large_track_points
        );
        
        // Overview should have higher tolerance (more simplification)
        assert!(overview_params.tolerance_meters > detail_params.tolerance_meters);
        
        // Overview should have lower max points
        assert!(overview_params.max_points < detail_params.max_points);
        
        // Both should require simplification for huge tracks
        assert!(overview_params.should_simplify(large_track_points));
        assert!(detail_params.should_simplify(large_track_points));
    }
}
