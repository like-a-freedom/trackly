#[cfg(test)]
mod tests {
    use super::*;
    use crate::track_utils::zoom_adaptation::{get_simplification_params, tolerance_for_zoom};
    use crate::models::TrackMode;

    #[test]
    fn test_tolerance_for_zoom_function() {
        // Test zoom tolerance calculation
        assert_eq!(tolerance_for_zoom(5.0), 100.0); // World view
        assert_eq!(tolerance_for_zoom(10.0), 50.0); // Regional
        assert_eq!(tolerance_for_zoom(12.0), 25.0); // City
        assert_eq!(tolerance_for_zoom(15.0), 5.0);  // Street
        assert_eq!(tolerance_for_zoom(20.0), 2.0);  // Very detailed
    }

    #[test]
    fn test_overview_mode_simplification() {
        let params = get_simplification_params(TrackMode::Overview, Some(12.0), 5000);
        
        // Overview mode should apply simplification for medium-sized tracks
        assert!(params.tolerance_meters > 0.0);
        assert!(params.max_points <= 2000); // Limited points for overview
        assert_eq!(params.min_points, 50);
    }

    #[test]
    fn test_detail_mode_preserves_quality() {
        let params = get_simplification_params(TrackMode::Detail, Some(12.0), 5000);
        
        // Detail mode should not simplify normal-sized tracks
        assert_eq!(params.tolerance_meters, 0.0);
        assert!(params.max_points >= 5000); // Allow more points for detail
        assert_eq!(params.min_points, 100);
    }

    #[test]
    fn test_huge_track_gets_simplified() {
        let params = get_simplification_params(TrackMode::Overview, Some(12.0), 25000);
        
        // Even overview mode should simplify huge tracks aggressively
        assert!(params.tolerance_meters > 25.0); // More than base tolerance
        assert!(params.should_simplify(25000));
    }

    #[test]
    fn test_small_track_no_simplification() {
        let params = get_simplification_params(TrackMode::Overview, Some(12.0), 500);
        
        // Small tracks should not be simplified even in overview mode
        assert_eq!(params.tolerance_meters, 0.0);
        assert!(!params.should_simplify(500));
    }

    #[test]
    fn test_effective_tolerance_calculation() {
        let params = get_simplification_params(TrackMode::Detail, Some(15.0), 50000);
        
        // Test that effective tolerance is calculated for huge tracks
        let effective = params.effective_tolerance(50000);
        assert!(effective > 0.0);
    }

    #[test]
    fn test_track_mode_enum() {
        assert!(TrackMode::from_string("detail").is_detail());
        assert!(!TrackMode::from_string("detail").is_overview());
        
        assert!(TrackMode::from_string("overview").is_overview());
        assert!(!TrackMode::from_string("overview").is_detail());
        
        // Test default behavior
        assert!(TrackMode::from_string("unknown").is_overview());
        assert!(TrackMode::from_string("").is_overview());
    }

    #[test]
    fn test_simplification_params_should_simplify() {
        let params = SimplificationParams {
            tolerance_meters: 10.0,
            max_points: 1000,
            min_points: 50,
        };
        
        // Should simplify if tolerance > 0 OR points > max
        assert!(params.should_simplify(1500)); // Too many points
        assert!(!params.should_simplify(500));  // Within limits and has tolerance
        
        let params_no_tolerance = SimplificationParams {
            tolerance_meters: 0.0,
            max_points: 1000,
            min_points: 50,
        };
        
        assert!(params_no_tolerance.should_simplify(1500)); // Too many points
        assert!(!params_no_tolerance.should_simplify(500)); // Within limits, no tolerance
    }
}
