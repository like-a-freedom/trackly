/// Elevation metrics calculated from track data
#[derive(Debug, Clone, Default)]
pub struct ElevationMetrics {
    pub elevation_gain: Option<f32>,
    pub elevation_loss: Option<f32>,
    pub elevation_min: Option<f32>,
    pub elevation_max: Option<f32>,
}

impl ElevationMetrics {
    pub fn elevation_range(&self) -> Option<f32> {
        match (self.elevation_min, self.elevation_max) {
            (Some(min), Some(max)) => Some(max - min),
            _ => None,
        }
    }
}

/// Calculate elevation metrics from a series of elevation points
///
/// # Arguments
/// * `elevations` - Vector of elevation values in meters
///
/// # Returns
/// * `ElevationMetrics` - Calculated metrics or None values if insufficient data
pub fn calculate_elevation_metrics(elevations: &[f64]) -> ElevationMetrics {
    if elevations.is_empty() {
        return ElevationMetrics::default();
    }

    // Filter out invalid elevations (NaN, infinite values)
    let valid_elevations: Vec<f64> = elevations
        .iter()
        .copied()
        .filter(|e| e.is_finite())
        .collect();

    if valid_elevations.is_empty() {
        return ElevationMetrics::default();
    }

    // Calculate min/max
    let elevation_min = valid_elevations
        .iter()
        .copied()
        .fold(f64::INFINITY, f64::min);
    let elevation_max = valid_elevations
        .iter()
        .copied()
        .fold(f64::NEG_INFINITY, f64::max);

    // Calculate cumulative gain and loss
    let mut elevation_gain = 0.0;
    let mut elevation_loss = 0.0;

    for window in valid_elevations.windows(2) {
        let diff = window[1] - window[0];
        if diff > 0.0 {
            elevation_gain += diff;
        } else if diff < 0.0 {
            elevation_loss += diff.abs();
        }
    }

    ElevationMetrics {
        elevation_gain: Some(elevation_gain as f32),
        elevation_loss: Some(elevation_loss as f32),
        elevation_min: Some(elevation_min as f32),
        elevation_max: Some(elevation_max as f32),
    }
}

/// Extract elevation data from GPX track points
///
/// # Arguments
/// * `track_points` - Vector of track points containing lat, lon, and optional elevation
///
/// # Returns
/// * `Vec<f64>` - Vector of elevation values in meters
pub fn extract_elevations_from_track_points(track_points: &[(f64, f64, Option<f64>)]) -> Vec<f64> {
    track_points
        .iter()
        .filter_map(|(_, _, elevation)| *elevation)
        .collect()
}

/// Check if track has any elevation data
///
/// # Arguments
/// * `track_points` - Vector of track points
///
/// # Returns
/// * `bool` - True if at least one point has elevation data
pub fn has_elevation_data(track_points: &[(f64, f64, Option<f64>)]) -> bool {
    track_points
        .iter()
        .any(|(_, _, elevation)| elevation.is_some())
}

/// Smooth elevation data to reduce noise
/// Uses a simple moving average filter
///
/// # Arguments
/// * `elevations` - Raw elevation data
/// * `window_size` - Size of smoothing window (default: 3)
///
/// # Returns
/// * `Vec<f64>` - Smoothed elevation data
pub fn smooth_elevation_data(elevations: &[f64], window_size: usize) -> Vec<f64> {
    if elevations.len() < window_size || window_size == 0 {
        return elevations.to_vec();
    }

    let half_window = window_size / 2;
    let mut smoothed = Vec::with_capacity(elevations.len());

    for i in 0..elevations.len() {
        let start = i.saturating_sub(half_window);
        let end = (i + half_window + 1).min(elevations.len());

        let sum: f64 = elevations[start..end].iter().sum();
        let count = end - start;
        smoothed.push(sum / count as f64);
    }

    smoothed
}

#[cfg(test)]
mod tests {
    use super::*;
    use assert_approx_eq::assert_approx_eq;

    #[test]
    fn test_calculate_elevation_metrics_empty() {
        let elevations = vec![];
        let metrics = calculate_elevation_metrics(&elevations);
        assert!(metrics.elevation_gain.is_none());
        assert!(metrics.elevation_loss.is_none());
        assert!(metrics.elevation_min.is_none());
        assert!(metrics.elevation_max.is_none());
    }

    #[test]
    fn test_calculate_elevation_metrics_single_point() {
        let elevations = vec![100.0];
        let metrics = calculate_elevation_metrics(&elevations);
        assert_approx_eq!(metrics.elevation_gain.unwrap(), 0.0, 1e-6);
        assert_approx_eq!(metrics.elevation_loss.unwrap(), 0.0, 1e-6);
        assert_approx_eq!(metrics.elevation_min.unwrap(), 100.0, 1e-6);
        assert_approx_eq!(metrics.elevation_max.unwrap(), 100.0, 1e-6);
    }

    #[test]
    fn test_calculate_elevation_metrics_uphill() {
        let elevations = vec![100.0, 120.0, 150.0, 180.0];
        let metrics = calculate_elevation_metrics(&elevations);
        assert_approx_eq!(metrics.elevation_gain.unwrap(), 80.0, 1e-6);
        assert_approx_eq!(metrics.elevation_loss.unwrap(), 0.0, 1e-6);
        assert_approx_eq!(metrics.elevation_min.unwrap(), 100.0, 1e-6);
        assert_approx_eq!(metrics.elevation_max.unwrap(), 180.0, 1e-6);
    }

    #[test]
    fn test_calculate_elevation_metrics_downhill() {
        let elevations = vec![200.0, 180.0, 150.0, 120.0];
        let metrics = calculate_elevation_metrics(&elevations);
        assert_approx_eq!(metrics.elevation_gain.unwrap(), 0.0, 1e-6);
        assert_approx_eq!(metrics.elevation_loss.unwrap(), 80.0, 1e-6);
        assert_approx_eq!(metrics.elevation_min.unwrap(), 120.0, 1e-6);
        assert_approx_eq!(metrics.elevation_max.unwrap(), 200.0, 1e-6);
    }

    #[test]
    fn test_calculate_elevation_metrics_mixed() {
        let elevations = vec![100.0, 120.0, 110.0, 130.0, 90.0];
        let metrics = calculate_elevation_metrics(&elevations);
        // Gain: (120-100) + (130-110) = 20 + 20 = 40
        // Loss: (120-110) + (130-90) = 10 + 40 = 50
        assert_approx_eq!(metrics.elevation_gain.unwrap(), 40.0, 1e-6);
        assert_approx_eq!(metrics.elevation_loss.unwrap(), 50.0, 1e-6);
        assert_approx_eq!(metrics.elevation_min.unwrap(), 90.0, 1e-6);
        assert_approx_eq!(metrics.elevation_max.unwrap(), 130.0, 1e-6);
    }

    #[test]
    fn test_extract_elevations_from_track_points() {
        let track_points = vec![
            (55.0, 37.0, Some(100.0)),
            (55.1, 37.1, None),
            (55.2, 37.2, Some(120.0)),
            (55.3, 37.3, Some(110.0)),
        ];
        let elevations = extract_elevations_from_track_points(&track_points);
        assert_eq!(elevations, vec![100.0, 120.0, 110.0]);
    }

    #[test]
    fn test_has_elevation_data() {
        let track_points_with_elevation = vec![(55.0, 37.0, None), (55.1, 37.1, Some(100.0))];
        assert!(has_elevation_data(&track_points_with_elevation));

        let track_points_without_elevation = vec![(55.0, 37.0, None), (55.1, 37.1, None)];
        assert!(!has_elevation_data(&track_points_without_elevation));
    }

    #[test]
    fn test_smooth_elevation_data() {
        let elevations = vec![100.0, 110.0, 90.0, 120.0, 80.0];
        let smoothed = smooth_elevation_data(&elevations, 3);

        // First point: (100 + 110) / 2 = 105
        // Second point: (100 + 110 + 90) / 3 = 100
        // Third point: (110 + 90 + 120) / 3 = 106.67
        // Fourth point: (90 + 120 + 80) / 3 = 96.67
        // Fifth point: (120 + 80) / 2 = 100

        assert_approx_eq!(smoothed[0], 105.0, 1e-6);
        assert_approx_eq!(smoothed[1], 100.0, 1e-6);
        assert_approx_eq!(smoothed[2], 106.67, 0.01);
        assert_approx_eq!(smoothed[3], 96.67, 0.01);
        assert_approx_eq!(smoothed[4], 100.0, 1e-6);
    }

    #[test]
    fn test_elevation_range() {
        let metrics = ElevationMetrics {
            elevation_gain: Some(100.0),
            elevation_loss: Some(50.0),
            elevation_min: Some(80.0),
            elevation_max: Some(200.0),
        };
        assert_approx_eq!(metrics.elevation_range().unwrap(), 120.0, 1e-6);
    }

    #[test]
    fn test_calculate_elevation_metrics_edge_cases() {
        // Test with negative elevations
        let negative_elevations = vec![-100.0, -50.0, -80.0, -30.0];
        let metrics = calculate_elevation_metrics(&negative_elevations);
        assert!(metrics.elevation_gain.unwrap() > 0.0);
        assert!(metrics.elevation_loss.unwrap() > 0.0);
        assert_approx_eq!(metrics.elevation_min.unwrap(), -100.0, 1e-6);
        assert_approx_eq!(metrics.elevation_max.unwrap(), -30.0, 1e-6);

        // Test with very small elevation changes (should handle precision)
        let small_changes = vec![1000.001, 1000.002, 1000.001, 1000.003];
        let metrics = calculate_elevation_metrics(&small_changes);
        assert!(metrics.elevation_gain.is_some());
        assert!(metrics.elevation_loss.is_some());
        assert!(metrics.elevation_gain.unwrap() >= 0.0);
        assert!(metrics.elevation_loss.unwrap() >= 0.0);

        // Test with large dataset
        let large_dataset: Vec<f64> = (0..10000).map(|i| (i as f64) * 0.1).collect();
        let metrics = calculate_elevation_metrics(&large_dataset);
        assert!(metrics.elevation_gain.unwrap() > 0.0);
        assert_approx_eq!(metrics.elevation_loss.unwrap(), 0.0, 1e-6); // Monotonic increase
        assert_approx_eq!(metrics.elevation_min.unwrap(), 0.0, 1e-6);
        assert_approx_eq!(metrics.elevation_max.unwrap(), 999.9, 1e-6);
    }

    #[test]
    fn test_extract_elevations_edge_cases() {
        // Test with all None elevations
        let track_points_no_elevation =
            vec![(55.0, 37.0, None), (55.1, 37.1, None), (55.2, 37.2, None)];
        let elevations = extract_elevations_from_track_points(&track_points_no_elevation);
        assert!(elevations.is_empty());

        // Test with mixed valid and invalid elevations
        // Note: extract_elevations_from_track_points only filters None values,
        // it doesn't handle NaN or infinity - that's handled at a different level
        let track_points_mixed = vec![
            (55.0, 37.0, None),
            (55.1, 37.1, Some(100.0)),
            (55.2, 37.2, None),
            (55.3, 37.3, Some(120.0)),
            (55.4, 37.4, None),
        ];
        let elevations = extract_elevations_from_track_points(&track_points_mixed);
        // Should only include Some values
        assert_eq!(elevations.len(), 2);
        assert!(elevations.contains(&100.0));
        assert!(elevations.contains(&120.0));
    }

    #[test]
    fn test_has_elevation_data_edge_cases() {
        // Test with empty track points
        let empty_track_points: Vec<(f64, f64, Option<f64>)> = vec![];
        assert!(!has_elevation_data(&empty_track_points));

        // Test with single point with elevation
        let single_point_with_elevation = vec![(55.0, 37.0, Some(100.0))];
        assert!(has_elevation_data(&single_point_with_elevation));

        // Test with single point without elevation
        let single_point_no_elevation = vec![(55.0, 37.0, None)];
        assert!(!has_elevation_data(&single_point_no_elevation));

        // Test with NaN elevation (current implementation treats Some(NaN) as having elevation)
        let track_points_with_nan = vec![(55.0, 37.0, Some(f64::NAN)), (55.1, 37.1, None)];
        // has_elevation_data only checks if Some() exists, not if the value is valid
        assert!(has_elevation_data(&track_points_with_nan));
    }

    #[test]
    fn test_smooth_elevation_data_edge_cases() {
        // Test with empty elevations
        let empty_elevations: Vec<f64> = vec![];
        let smoothed = smooth_elevation_data(&empty_elevations, 3);
        assert!(smoothed.is_empty());

        // Test with single elevation
        let single_elevation = vec![100.0];
        let smoothed = smooth_elevation_data(&single_elevation, 3);
        assert_eq!(smoothed.len(), 1);
        assert_approx_eq!(smoothed[0], 100.0, 1e-6);

        // Test with window size larger than data (should return original data)
        let small_data = vec![100.0, 110.0];
        let smoothed = smooth_elevation_data(&small_data, 5);
        assert_eq!(smoothed.len(), 2);
        // When window_size (5) > data.len() (2), function returns original data
        assert_approx_eq!(smoothed[0], 100.0, 1e-6);
        assert_approx_eq!(smoothed[1], 110.0, 1e-6);

        // Test with window size 1 (each point averages just itself since half_window=0)
        let original_data = vec![100.0, 110.0, 90.0];
        let smoothed = smooth_elevation_data(&original_data, 1);
        assert_eq!(smoothed, original_data);

        // Test with negative elevations
        let negative_data = vec![-100.0, -110.0, -90.0, -120.0];
        let smoothed = smooth_elevation_data(&negative_data, 3);
        assert_eq!(smoothed.len(), 4);
        // With window=3, half_window=1
        // Point 0: start=0, end=2 -> (-100 + -110) / 2 = -105.0
        // Point 1: start=0, end=3 -> (-100 + -110 + -90) / 3 = -100.0
        assert_approx_eq!(smoothed[0], -105.0, 1e-6);
        assert_approx_eq!(smoothed[1], -100.0, 1e-6);
    }

    #[test]
    fn test_elevation_metrics_none_values() {
        // Test ElevationMetrics with None values
        let metrics = ElevationMetrics {
            elevation_gain: None,
            elevation_loss: None,
            elevation_min: None,
            elevation_max: None,
        };
        assert!(metrics.elevation_range().is_none());

        // Test with partial None values
        let partial_metrics = ElevationMetrics {
            elevation_gain: Some(100.0),
            elevation_loss: Some(50.0),
            elevation_min: None,
            elevation_max: Some(200.0),
        };
        assert!(partial_metrics.elevation_range().is_none());
    }

    #[test]
    fn test_elevation_metrics_extreme_values() {
        // Test with extreme positive values
        let extreme_high = ElevationMetrics {
            elevation_gain: Some(8848.0), // Mount Everest height
            elevation_loss: Some(4000.0),
            elevation_min: Some(0.0),
            elevation_max: Some(8848.0),
        };
        assert_approx_eq!(extreme_high.elevation_range().unwrap(), 8848.0, 1e-6);

        // Test with extreme negative values (Death Valley)
        let extreme_low = ElevationMetrics {
            elevation_gain: Some(100.0),
            elevation_loss: Some(200.0),
            elevation_min: Some(-86.0), // Death Valley
            elevation_max: Some(50.0),
        };
        assert_approx_eq!(extreme_low.elevation_range().unwrap(), 136.0, 1e-6);

        // Test with zero range
        let zero_range = ElevationMetrics {
            elevation_gain: Some(0.0),
            elevation_loss: Some(0.0),
            elevation_min: Some(1000.0),
            elevation_max: Some(1000.0),
        };
        assert_approx_eq!(zero_range.elevation_range().unwrap(), 0.0, 1e-6);
    }
}
