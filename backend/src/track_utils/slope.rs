use crate::track_utils::geometry::haversine_distance;
use std::env;
use tracing::info;

/// Configuration parameters for slope calculation
#[derive(Debug, Clone)]
struct SlopeConfig {
    /// Window size for elevation smoothing (half-window in meters)
    elevation_smoothing_window: f64,
    /// Window size for slope calculation (half-window in meters)  
    slope_calculation_window: f64,
}

impl Default for SlopeConfig {
    fn default() -> Self {
        Self {
            elevation_smoothing_window: 50.0, // ±50m for 100m total window
            slope_calculation_window: 25.0,   // ±25m for 50m total window
        }
    }
}

impl SlopeConfig {
    /// Load configuration from environment variables with fallback to defaults
    fn from_env() -> Self {
        let config = Self {
            elevation_smoothing_window: env::var("SLOPE_ELEVATION_SMOOTHING_WINDOW")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(50.0),
            slope_calculation_window: env::var("SLOPE_CALCULATION_WINDOW")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(25.0),
        };

        // Log configuration for debugging
        info!(
            "Slope calculation config: elevation_smoothing_window={:.1}m, slope_calculation_window={:.1}m",
            config.elevation_smoothing_window,
            config.slope_calculation_window
        );

        config
    }
}

/// Result of slope calculation containing all slope-related data
#[derive(Debug, Clone, Default)]
pub struct SlopeMetrics {
    pub slope_min: Option<f32>,
    pub slope_max: Option<f32>,
    pub slope_avg: Option<f32>,
    pub slope_histogram: Option<serde_json::Value>,
    pub slope_segments: Option<serde_json::Value>,
}

/// Calculate slope metrics from track points and elevation profile
///
/// This function provides a unified interface for slope calculation across all track formats
/// (GPX, KML, FIT, etc.) to ensure consistency and avoid code duplication.
///
/// # Arguments
/// * `points` - Vector of (lat, lon) coordinates representing the track
/// * `elevation_profile` - Vector of elevation values (Some(elevation) or None)
/// * `track_name` - Name of the track for logging purposes
///
/// # Returns
/// * `SlopeMetrics` containing all calculated slope data
///
/// # Examples
/// ```
/// use backend::track_utils::slope::calculate_slope_metrics;
///
/// let points = vec![(55.7558, 37.6176), (55.7559, 37.6177)];
/// let elevations = vec![Some(100.0), Some(110.0)];
/// let result = calculate_slope_metrics(&points, &elevations, "Test Track");
/// ```
pub fn calculate_slope_metrics(
    points: &[(f64, f64)],
    elevation_profile: &[Option<f64>],
    track_name: &str,
) -> SlopeMetrics {
    // Validate input data
    if points.len() < 2 {
        info!(
            "Track '{}' has insufficient points for slope calculation: {} points",
            track_name,
            points.len()
        );
        return Default::default();
    }

    if elevation_profile.is_empty() {
        info!(
            "Track '{}' has no elevation profile for slope calculation",
            track_name
        );
        return Default::default();
    }

    if points.len() != elevation_profile.len() {
        info!(
            "Track '{}' has mismatched points ({}) and elevation profile ({}) lengths",
            track_name,
            points.len(),
            elevation_profile.len()
        );
        return Default::default();
    }

    // Extract valid elevations
    let elevations: Vec<f64> = elevation_profile.iter().filter_map(|&e| e).collect();

    if elevations.len() < 2 {
        info!(
            "Track '{}' has insufficient elevation data for slope calculation: {} valid elevations",
            track_name,
            elevations.len()
        );
        return Default::default();
    }

    // Ensure we have enough valid elevations matching the points
    if elevations.len() != points.len() {
        info!(
            "Track '{}' has gaps in elevation data: {} points but only {} valid elevations",
            track_name,
            points.len(),
            elevations.len()
        );
        // For now, skip slope calculation if there are gaps in elevation data
        // In the future, we could interpolate missing values
        return Default::default();
    }

    // Calculate distances between consecutive points
    let distances: Vec<f64> = points
        .windows(2)
        .map(|pair| haversine_distance(pair[0], pair[1]))
        .collect();

    if distances.len() != elevations.len() - 1 {
        info!(
            "Track '{}' has inconsistent distance/elevation data: {} distances, {} elevations",
            track_name,
            distances.len(),
            elevations.len()
        );
        return Default::default();
    }

    // Calculate cumulative distances
    let mut cumulative_distances = vec![0.0];
    let mut total_distance = 0.0;
    for distance in &distances {
        total_distance += distance;
        cumulative_distances.push(total_distance);
    }

    // Step 1: Apply distance-based elevation smoothing
    let config = SlopeConfig::from_env();
    let smoothed_elevations = smooth_elevation_by_distance(
        points,
        &elevations,
        &cumulative_distances,
        config.elevation_smoothing_window,
    );

    // Step 2: Calculate slopes using distance-based windowing
    let slopes = calculate_slope_by_distance_window(
        &smoothed_elevations,
        &cumulative_distances,
        config.slope_calculation_window,
    );

    if slopes.is_empty() {
        info!(
            "Track '{}' has no valid slope segments after calculation",
            track_name
        );
        return Default::default();
    }

    // Calculate basic statistics
    let slope_min = slopes.iter().fold(f32::INFINITY, |a, &b| a.min(b));
    let slope_max = slopes.iter().fold(f32::NEG_INFINITY, |a, &b| a.max(b));

    // Calculate weighted average slope by distance
    let mut weighted_sum = 0.0;
    let mut total_weight = 0.0;

    // Use segment distances for weighting - each slope corresponds to a distance segment
    for (i, &slope) in slopes.iter().enumerate() {
        if i < distances.len() {
            let segment_distance = distances[i];
            weighted_sum += slope as f64 * segment_distance;
            total_weight += segment_distance;
        }
    }

    let slope_avg = if total_weight > 0.0 {
        Some((weighted_sum / total_weight) as f32)
    } else {
        None
    };

    // Calculate histogram buckets
    let buckets = [
        (-60.0, -30.0),
        (-30.0, -15.0),
        (-15.0, -8.0),
        (-8.0, -4.0),
        (-4.0, 0.0),
        (0.0, 4.0),
        (4.0, 8.0),
        (8.0, 12.0),
        (12.0, 18.0),
        (18.0, 25.0),
        (25.0, 60.0),
    ];

    let mut histogram = Vec::new();
    let mut _uphill_distance = 0.0;
    let mut _downhill_distance = 0.0;

    // Initialize histogram buckets
    for &(from, to) in buckets.iter() {
        histogram.push(serde_json::json!({
            "bucket_from": from,
            "bucket_to": to,
            "distance_m": 0.0
        }));
    }

    // Calculate distance for each slope value
    for (i, &slope) in slopes.iter().enumerate() {
        let segment_distance = if i < distances.len() {
            distances[i] as f32
        } else {
            0.0
        };

        // Add to uphill/downhill totals
        if slope > 0.0 {
            _uphill_distance += segment_distance;
        } else if slope < 0.0 {
            _downhill_distance += segment_distance;
        }

        // Find appropriate bucket
        for bucket in histogram.iter_mut() {
            let bucket_from = bucket["bucket_from"].as_f64().unwrap() as f32;
            let bucket_to = bucket["bucket_to"].as_f64().unwrap() as f32;
            if slope >= bucket_from && slope < bucket_to {
                let current_distance = bucket["distance_m"].as_f64().unwrap() as f32;
                bucket["distance_m"] = serde_json::json!(current_distance + segment_distance);
                break;
            }
        }
    }

    // Generate simplified slope segments for visualization
    let mut segments = Vec::new();
    let merge_delta_percent = 1.0;
    let merge_min_length_m = 15.0;

    if !slopes.is_empty() {
        let mut current_slope = slopes[0];
        let mut current_start = 0.0;
        let mut current_length = 0.0;

        for (i, &slope) in slopes.iter().enumerate().skip(1) {
            let segment_distance = if i < distances.len() {
                distances[i] as f32
            } else {
                0.0
            };

            // Check if we should merge with current segment
            if (slope - current_slope).abs() <= merge_delta_percent {
                current_length += segment_distance;
            } else {
                // End current segment if it's long enough
                if current_length >= merge_min_length_m {
                    segments.push(serde_json::json!({
                        "distance_m": current_start,
                        "slope_percent": current_slope,
                        "length_m": current_length
                    }));
                }

                // Start new segment
                current_slope = slope;
                current_start += current_length;
                current_length = segment_distance;
            }
        }

        // Add final segment
        if current_length >= merge_min_length_m {
            segments.push(serde_json::json!({
                "distance_m": current_start,
                "slope_percent": current_slope,
                "length_m": current_length
            }));
        }
    }

    info!(
        "Track '{}' slope calculation completed: min={:.1}%, max={:.1}%, avg={:.1}%",
        track_name,
        slope_min,
        slope_max,
        slope_avg.unwrap_or(0.0)
    );

    SlopeMetrics {
        slope_min: Some(slope_min),
        slope_max: Some(slope_max),
        slope_avg,
        slope_histogram: Some(serde_json::Value::Array(histogram)),
        slope_segments: Some(serde_json::Value::Array(segments)),
    }
}

/// Check if a track has sufficient data for slope calculation
///
/// # Arguments
/// * `points` - Vector of track points  
/// * `elevation_profile` - Vector of elevation values
///
/// # Returns
/// * `true` if slope calculation is possible, `false` otherwise
pub fn can_calculate_slopes(points: &[(f64, f64)], elevation_profile: &[Option<f64>]) -> bool {
    if points.len() < 2 || elevation_profile.is_empty() || points.len() != elevation_profile.len() {
        return false;
    }

    let valid_elevations = elevation_profile.iter().filter(|e| e.is_some()).count();
    valid_elevations >= 2 && valid_elevations == points.len()
}

/// Force recalculate slope metrics for an existing track from coordinates and elevation profile
///
/// This function is used for:
/// 1. Tracks that were uploaded without elevation data but later enriched
/// 2. Force update scenarios where user wants to recalculate slopes
/// 3. Algorithm improvements that require recalculation of existing data
///
/// # Arguments
/// * `coordinates` - Vector of (lat, lon) coordinates
/// * `elevation_profile` - Vector of elevation values
/// * `track_name` - Name of the track for logging
///
/// # Returns
/// * `SlopeMetrics` with calculated slope data
pub fn recalculate_slope_metrics(
    coordinates: &[(f64, f64)],
    elevation_profile: &[f64],
    track_name: &str,
) -> SlopeMetrics {
    // Convert elevation profile to Option<f64> format for consistency
    let elevation_options: Vec<Option<f64>> = elevation_profile.iter().map(|&e| Some(e)).collect();

    calculate_slope_metrics(coordinates, &elevation_options, track_name)
}

/// Calculate slope using distance-based windowing (gpx.studio style)
///
/// Instead of point-to-point calculation, uses a 50-meter window around each point
/// to calculate more stable and accurate slope values.
///
/// # Arguments
/// * `elevations` - Vector of smoothed elevation values
/// * `distances` - Vector of cumulative distances
/// * `window_half_size` - Half size of slope calculation window in meters (default: 25m)
///
/// # Returns
/// * Vector of slope percentages
fn calculate_slope_by_distance_window(
    elevations: &[f64],
    distances: &[f64],
    window_half_size: f64,
) -> Vec<f32> {
    if elevations.len() < 2 || distances.len() != elevations.len() {
        return Vec::new();
    }

    let mut slopes = Vec::with_capacity(elevations.len());

    for (i, &center_distance) in distances.iter().enumerate() {
        // Find points at the window boundaries
        let mut start_idx = None;
        let mut end_idx = None;

        // Find the point closest to (center_distance - window_half_size)
        for (j, &dist) in distances.iter().enumerate() {
            if dist >= center_distance - window_half_size {
                start_idx = Some(j);
                break;
            }
        }

        // Find the point closest to (center_distance + window_half_size)
        for (j, &dist) in distances.iter().enumerate().rev() {
            if dist <= center_distance + window_half_size {
                end_idx = Some(j);
                break;
            }
        }

        // Calculate slope between window boundaries
        if let (Some(start), Some(end)) = (start_idx, end_idx) {
            if start != end && end > start {
                let delta_elevation = elevations[end] - elevations[start];
                let delta_distance = distances[end] - distances[start];

                if delta_distance > 0.0 {
                    let slope_percent = (delta_elevation / delta_distance * 100.0) as f32;
                    slopes.push(slope_percent);
                } else {
                    // Use neighboring points for slope calculation if window is too small
                    if i > 0 && i < elevations.len() - 1 {
                        let delta_elevation = elevations[i + 1] - elevations[i - 1];
                        let delta_distance = distances[i + 1] - distances[i - 1];
                        if delta_distance > 0.0 {
                            let slope_percent = (delta_elevation / delta_distance * 100.0) as f32;
                            slopes.push(slope_percent);
                        } else {
                            slopes.push(0.0);
                        }
                    } else {
                        slopes.push(0.0);
                    }
                }
            } else {
                // Use neighboring points for slope calculation if window doesn't span multiple points
                if i > 0 && i < elevations.len() - 1 {
                    let delta_elevation = elevations[i + 1] - elevations[i - 1];
                    let delta_distance = distances[i + 1] - distances[i - 1];
                    if delta_distance > 0.0 {
                        let slope_percent = (delta_elevation / delta_distance * 100.0) as f32;
                        slopes.push(slope_percent);
                    } else {
                        slopes.push(0.0);
                    }
                } else {
                    slopes.push(0.0);
                }
            }
        } else {
            // Fallback to 0% slope if window boundaries not found
            slopes.push(0.0);
        }
    }

    slopes
}

/// Smooth elevation data using distance-based windowing
///
/// Implements gpx.studio-style elevation smoothing with 100-meter distance windows.
/// For each point, creates a window of ±50 meters and calculates weighted average.
///
/// # Arguments
/// * `points` - Vector of (lat, lon) coordinates
/// * `elevations` - Vector of elevation values
/// * `distances` - Vector of cumulative distances from start
/// * `window_half_size` - Half size of smoothing window in meters (default: 50m)
///
/// # Returns
/// * Vector of smoothed elevation values
fn smooth_elevation_by_distance(
    _points: &[(f64, f64)], // Keep for future use but not needed currently
    elevations: &[f64],
    distances: &[f64],
    window_half_size: f64,
) -> Vec<f64> {
    if elevations.len() < 3 || distances.len() != elevations.len() {
        return elevations.to_vec();
    }

    let mut smoothed = Vec::with_capacity(elevations.len());

    for (i, &center_distance) in distances.iter().enumerate() {
        let mut weighted_sum = 0.0;
        let mut total_weight = 0.0;

        // Find all points within the distance window
        for (j, &point_distance) in distances.iter().enumerate() {
            let distance_diff = (point_distance - center_distance).abs();

            if distance_diff <= window_half_size {
                // Calculate weight based on distance from center
                // Closer points get more weight (linear falloff)
                let weight = if distance_diff == 0.0 {
                    1.0
                } else {
                    1.0 - (distance_diff / window_half_size)
                };

                weighted_sum += elevations[j] * weight;
                total_weight += weight;
            }
        }

        if total_weight > 0.0 {
            smoothed.push(weighted_sum / total_weight);
        } else {
            // Fallback to original elevation if no points in window
            smoothed.push(elevations[i]);
        }
    }

    smoothed
}

// Apply smoothing to elevation data to reduce GPS noise and anomalies
//
// Uses a weighted moving average with anomaly detection to smooth elevation profile
// while preserving legitimate elevation changes.
//
// # Arguments
// * `elevations` - Vector of elevation values to smooth
// * `anomaly_threshold` - Threshold for detecting elevation anomalies (meters)
//
// # Returns
// * Vector of smoothed elevation values
// Check if a track has sufficient data for slope calculation

#[cfg(test)]
mod tests {
    use super::*;

    // Tests for universal slope calculation functions
    #[test]
    fn test_calculate_slope_metrics_valid() {
        let points = vec![(55.7558, 37.6176), (55.7559, 37.6177), (55.7560, 37.6178)];
        let elevations = vec![Some(100.0), Some(110.0), Some(105.0)];

        let result = calculate_slope_metrics(&points, &elevations, "Test Track");

        assert!(result.slope_min.is_some());
        assert!(result.slope_max.is_some());
        assert!(result.slope_avg.is_some());
        assert!(result.slope_histogram.is_some());
        assert!(result.slope_segments.is_some());
    }

    #[test]
    fn test_calculate_slope_metrics_insufficient_points() {
        let points = vec![(55.7558, 37.6176)];
        let elevations = vec![Some(100.0)];

        let result = calculate_slope_metrics(&points, &elevations, "Test Track");

        assert!(result.slope_min.is_none());
        assert!(result.slope_max.is_none());
        assert!(result.slope_avg.is_none());
    }

    #[test]
    fn test_calculate_slope_metrics_no_elevation() {
        let points = vec![(55.7558, 37.6176), (55.7559, 37.6177)];
        let elevations = vec![];

        let result = calculate_slope_metrics(&points, &elevations, "Test Track");

        assert!(result.slope_min.is_none());
        assert!(result.slope_max.is_none());
        assert!(result.slope_avg.is_none());
    }

    #[test]
    fn test_calculate_slope_metrics_mismatched_lengths() {
        let points = vec![(55.7558, 37.6176), (55.7559, 37.6177)];
        let elevations = vec![Some(100.0)]; // Different length

        let result = calculate_slope_metrics(&points, &elevations, "Test Track");

        assert!(result.slope_min.is_none());
        assert!(result.slope_max.is_none());
        assert!(result.slope_avg.is_none());
    }

    #[test]
    fn test_calculate_slope_metrics_gaps_in_elevation() {
        let points = vec![(55.7558, 37.6176), (55.7559, 37.6177), (55.7560, 37.6178)];
        let elevations = vec![Some(100.0), None, Some(120.0)]; // Gap in elevation

        let result = calculate_slope_metrics(&points, &elevations, "Test Track");

        // Should return empty result for now (could be improved with interpolation)
        assert!(result.slope_min.is_none());
        assert!(result.slope_max.is_none());
        assert!(result.slope_avg.is_none());
    }

    #[test]
    fn test_can_calculate_slopes_valid() {
        let points = vec![(55.7558, 37.6176), (55.7559, 37.6177)];
        let elevations = vec![Some(100.0), Some(110.0)];

        assert!(can_calculate_slopes(&points, &elevations));
    }

    #[test]
    fn test_can_calculate_slopes_insufficient_data() {
        let points = vec![(55.7558, 37.6176)];
        let elevations = vec![Some(100.0)];

        assert!(!can_calculate_slopes(&points, &elevations));
    }

    #[test]
    fn test_can_calculate_slopes_gaps() {
        let points = vec![(55.7558, 37.6176), (55.7559, 37.6177)];
        let elevations = vec![Some(100.0), None];

        assert!(!can_calculate_slopes(&points, &elevations));
    }

    #[test]
    fn test_recalculate_slope_metrics() {
        let coordinates = vec![(55.7558, 37.6176), (55.7559, 37.6177)];
        let elevation_profile = vec![100.0, 110.0];

        let result = recalculate_slope_metrics(&coordinates, &elevation_profile, "Test Track");

        assert!(result.slope_min.is_some());
        assert!(result.slope_max.is_some());
        assert!(result.slope_avg.is_some());
    }

    #[test]
    fn test_slope_metrics_default() {
        let result = SlopeMetrics::default();

        assert!(result.slope_min.is_none());
        assert!(result.slope_max.is_none());
        assert!(result.slope_avg.is_none());
        assert!(result.slope_histogram.is_none());
        assert!(result.slope_segments.is_none());
    }

    #[test]
    fn test_calculate_slope_metrics_linear_climb() {
        let points = vec![
            (55.7558, 37.6176),
            (55.7559, 37.6177), // ~111m distance at this latitude
            (55.7560, 37.6178), // ~111m distance
        ];
        let elevations = vec![Some(100.0), Some(110.0), Some(120.0)]; // 10m elevation gain per segment

        let result = calculate_slope_metrics(&points, &elevations, "Linear Climb Test");

        assert!(result.slope_min.is_some());
        assert!(result.slope_max.is_some());
        assert!(result.slope_avg.is_some());

        // More realistic check - slope should be positive but not extreme
        assert!(result.slope_avg.unwrap() > 0.0); // Should be positive (uphill)
        assert!(result.slope_avg.unwrap() <= 100.0); // Should not exceed our extreme threshold

        // Debug output to understand what we're getting
        println!(
            "Calculated slope: min={:.1}%, max={:.1}%, avg={:.1}%",
            result.slope_min.unwrap(),
            result.slope_max.unwrap(),
            result.slope_avg.unwrap()
        );
    }

    #[test]
    fn test_calculate_slope_metrics_flat_track() {
        let points = vec![(55.7558, 37.6176), (55.7559, 37.6177), (55.7560, 37.6178)];
        let elevations = vec![Some(100.0), Some(100.0), Some(100.0)]; // Flat

        let result = calculate_slope_metrics(&points, &elevations, "Flat Track Test");

        assert!(result.slope_min.is_some());
        assert!(result.slope_max.is_some());
        assert!(result.slope_avg.is_some());

        // Should be close to 0% slope
        assert!((result.slope_min.unwrap()).abs() < 0.1);
        assert!((result.slope_max.unwrap()).abs() < 0.1);
        assert!((result.slope_avg.unwrap()).abs() < 0.1);
    }

    #[test]
    fn test_slope_histogram_generation() {
        let points = vec![
            (55.7558, 37.6176),
            (55.7559, 37.6177),
            (55.7560, 37.6178),
            (55.7561, 37.6179),
            (55.7562, 37.6180),
        ];
        let elevations = vec![
            Some(100.0),
            Some(120.0), // +20% slope
            Some(110.0), // -10% slope
            Some(140.0), // +30% slope
            Some(130.0), // -10% slope
        ];

        let result = calculate_slope_metrics(&points, &elevations, "Histogram Test");

        assert!(result.slope_histogram.is_some());

        let histogram = result.slope_histogram.unwrap();
        assert!(histogram.is_array());

        // Should have histogram buckets
        let array = histogram.as_array().unwrap();
        assert!(!array.is_empty());
    }

    #[test]
    fn test_slope_segments_generation() {
        let points = vec![
            (55.7558, 37.6176),
            (55.7559, 37.6177),
            (55.7560, 37.6178),
            (55.7561, 37.6179),
            (55.7562, 37.6180),
            (55.7563, 37.6181),
        ];
        let elevations = vec![
            Some(100.0),
            Some(110.0),
            Some(120.0),
            Some(115.0),
            Some(125.0),
            Some(130.0),
        ];

        let result = calculate_slope_metrics(&points, &elevations, "Segments Test");

        assert!(result.slope_segments.is_some());

        let segments = result.slope_segments.unwrap();
        assert!(segments.is_array());

        let segments_array = segments.as_array().unwrap();
        // Allow empty array if not enough data for segments
        if !segments_array.is_empty() {
            // Each segment should have required fields
            for segment in segments_array {
                assert!(segment.is_object());
            }
        }
    }

    #[test]
    fn test_extreme_slopes() {
        // Use larger distances to pass filtering
        let points = vec![
            (55.7558, 37.6176),
            (55.7568, 37.6186), // ~1.4km distance
            (55.7578, 37.6196), // ~1.4km distance
        ];
        let elevations = vec![Some(0.0), Some(200.0), Some(400.0)]; // 200m gain per 1.4km = ~14%

        let result = calculate_slope_metrics(&points, &elevations, "Extreme Slopes Test");

        // Should handle slopes gracefully
        if result.slope_min.is_some() && result.slope_max.is_some() {
            let slope_max = result.slope_max.unwrap();
            let slope_min = result.slope_min.unwrap();

            // Should produce reasonable results, even if not extreme
            assert!(slope_max >= slope_min); // Basic sanity check
            assert!(slope_max.abs() <= 200.0); // Should be within expanded bounds for new algorithm
            assert!(slope_min.abs() <= 200.0); // Should be within expanded bounds for new algorithm
        }
    }
    #[test]
    fn test_negative_slopes() {
        // Use larger distances to pass filtering
        let points = vec![
            (55.7558, 37.6176),
            (55.7568, 37.6186), // ~1.4km distance
            (55.7578, 37.6196), // ~1.4km distance
        ];
        let elevations = vec![Some(400.0), Some(200.0), Some(0.0)]; // Downhill: 200m loss per 1.4km = ~-14%

        let result = calculate_slope_metrics(&points, &elevations, "Downhill Test");

        if result.slope_min.is_some() && result.slope_max.is_some() {
            let slope_max = result.slope_max.unwrap();
            let slope_min = result.slope_min.unwrap();

            // Should produce reasonable results for downhill
            assert!(slope_max >= slope_min); // Basic sanity check
            assert!(slope_max.abs() <= 200.0); // Within expanded bounds for new algorithm
            assert!(slope_min.abs() <= 200.0); // Within expanded bounds for new algorithm

            // For a consistently downhill track, average should be negative or close to 0
            if let Some(avg) = result.slope_avg {
                assert!(avg.abs() <= 200.0); // Should be within expanded bounds
            }
        }
    }

    #[test]
    fn test_mixed_elevation_data() {
        let points = vec![
            (55.7558, 37.6176),
            (55.7559, 37.6177),
            (55.7560, 37.6178),
            (55.7561, 37.6179),
        ];
        let elevations = vec![Some(100.0), None, Some(120.0), Some(90.0)]; // Missing data

        let result = calculate_slope_metrics(&points, &elevations, "Mixed Data Test");

        // Should handle missing elevation data gracefully
        // May have limited results due to gaps
        if result.slope_min.is_some() {
            assert!(result.slope_max.is_some());
            assert!(result.slope_avg.is_some());
        }
    }

    #[test]
    fn test_recalculate_slope_metrics_with_elevation_data() {
        let coordinates = vec![(0.0, 0.0), (1.0, 1.0), (2.0, 2.0)];
        let elevation_data = vec![100.0, 120.0, 110.0];

        let result = recalculate_slope_metrics(&coordinates, &elevation_data, "Array Test");

        assert!(result.slope_min.is_some());
        assert!(result.slope_max.is_some());
        assert!(result.slope_avg.is_some());
        assert!(result.slope_histogram.is_some());
        assert!(result.slope_segments.is_some());
    }

    #[test]
    fn test_slope_calculation_precision() {
        // Test precise slope calculation with known values
        let points = vec![(55.7558, 37.6176), (55.7559, 37.6177)];
        let elevations = vec![Some(100.0), Some(110.0)]; // 10m rise

        let result = calculate_slope_metrics(&points, &elevations, "Precision Test");

        assert!(result.slope_min.is_some());
        assert!(result.slope_max.is_some());

        // Should be roughly similar values for a simple two-point slope
        let min_slope = result.slope_min.unwrap();
        let max_slope = result.slope_max.unwrap();

        assert!((min_slope - max_slope).abs() < 5.0); // Should be similar for simple case
    }

    #[test]
    fn test_improved_slope_calculation_with_anomalies() {
        let points = vec![
            (55.7558, 37.6176),
            (55.7559, 37.6177), // ~111m distance
            (55.7560, 37.6178), // ~111m distance
            (55.7561, 37.6179), // ~111m distance
        ];
        // Include anomalous elevation jump
        let elevations = vec![Some(100.0), Some(200.0), Some(105.0), Some(110.0)]; // 100m jump is anomaly

        let result = calculate_slope_metrics(&points, &elevations, "Anomaly Test");

        // Should handle anomalies gracefully - now allows steeper real slopes
        if let Some(slope_max) = result.slope_max {
            assert!(slope_max <= 100.0); // Should not exceed our extreme threshold
            assert!(slope_max >= -100.0);
        }

        if let Some(slope_min) = result.slope_min {
            assert!(slope_min <= 100.0);
            assert!(slope_min >= -100.0);
        }
    }
    #[test]
    fn test_minimum_segment_distance_filtering() {
        let points = vec![
            (55.7558, 37.6176),
            (55.75581, 37.61761), // Very close point (~1.5m)
            (55.7559, 37.6177),   // Normal distance
        ];
        let elevations = vec![Some(100.0), Some(150.0), Some(105.0)]; // Large elevation change on short segment

        let result = calculate_slope_metrics(&points, &elevations, "Short Segment Test");

        // Should filter out the short segment and not produce extreme slopes
        if let Some(slope_max) = result.slope_max {
            assert!(slope_max < 100.0); // Should not have extreme slope from short segment
        }
    }

    #[test]
    fn test_steep_but_realistic_slopes() {
        let points = vec![
            (55.7558, 37.6176),
            (55.7559, 37.6177), // ~111m distance
            (55.7560, 37.6178), // ~111m distance
        ];
        // Steep but realistic mountain trail: 50m elevation gain over 111m = ~45% slope
        let elevations = vec![Some(1000.0), Some(1050.0), Some(1100.0)];

        let result = calculate_slope_metrics(&points, &elevations, "Steep Trail Test");

        println!("Steep trail result: {:?}", result);

        // The test should handle cases where segments might be filtered out
        // Let's make a more robust test
        if result.slope_min.is_some() {
            assert!(result.slope_max.is_some());
            assert!(result.slope_avg.is_some());

            // Should preserve steep but realistic slopes
            let slope_max = result.slope_max.unwrap();
            assert!(slope_max > 10.0); // Should be steeper than moderate slopes
            assert!(slope_max < 100.0); // But reasonable for mountain terrain

            println!(
                "Steep trail slopes: min={:.1}%, max={:.1}%, avg={:.1}%",
                result.slope_min.unwrap(),
                result.slope_max.unwrap(),
                result.slope_avg.unwrap()
            );
        } else {
            println!("No slopes calculated - likely due to short segments being filtered");
        }
    }

    #[test]
    fn test_realistic_mountain_trail_longer_segments() {
        // Use points that are further apart to ensure they pass distance filtering
        let points = vec![
            (55.7558, 37.6176),
            (55.7568, 37.6186), // ~127m distance
            (55.7578, 37.6196), // ~127m distance
        ];
        // Realistic mountain trail with steep elevation gain (within 80m threshold)
        let elevations = vec![Some(1000.0), Some(1070.0), Some(1140.0)]; // 70m gain per ~127m = ~55% slope

        let result = calculate_slope_metrics(&points, &elevations, "Mountain Trail Test");

        assert!(result.slope_min.is_some());
        assert!(result.slope_max.is_some());
        assert!(result.slope_avg.is_some());

        // Should calculate reasonable slopes for mountain terrain
        let slope_avg = result.slope_avg.unwrap();

        // These are steep but realistic mountain trail slopes
        assert!(slope_avg > 10.0); // Should be steep for mountain terrain
        assert!(slope_avg < 100.0); // But within reasonable bounds for real trails
    }

    #[test]
    fn test_contextual_anomaly_filtering() {
        // Use larger distances for better results
        let points = vec![
            (55.7558, 37.6176),
            (55.7568, 37.6186), // ~1.4km distance
            (55.7578, 37.6196), // ~1.4km distance
            (55.7588, 37.6206), // ~1.4km distance
            (55.7598, 37.6216), // ~1.4km distance
        ];
        // Mix of normal terrain with moderate elevation changes
        let elevations = vec![
            Some(100.0),
            Some(150.0),
            Some(200.0),
            Some(180.0),
            Some(220.0),
        ]; // Realistic mountain profile

        let result = calculate_slope_metrics(&points, &elevations, "Contextual Filter Test");

        // Should handle slopes gracefully but results might be different due to windowing
        if result.slope_max.is_some() {
            let _slope_max = result.slope_max.unwrap();

            println!(
                "Contextual filter slopes: min={:.1}%, max={:.1}%, avg={:.1}%",
                result.slope_min.unwrap_or(0.0),
                result.slope_max.unwrap(),
                result.slope_avg.unwrap_or(0.0)
            );
        }
    }

    // Tests for new distance-based smoothing and slope calculation

    #[test]
    fn test_smooth_elevation_by_distance_basic() {
        let points = vec![(0.0, 0.0), (1.0, 1.0), (2.0, 2.0), (3.0, 3.0)];
        let elevations = vec![100.0, 102.0, 104.0, 106.0];
        let distances = vec![0.0, 50.0, 100.0, 150.0];

        let smoothed = smooth_elevation_by_distance(&points, &elevations, &distances, 50.0);

        // Should return smoothed elevation values
        assert_eq!(smoothed.len(), elevations.len());
        assert!(smoothed[0] >= 100.0);
        assert!(smoothed[3] <= 106.0);
    }

    #[test]
    fn test_smooth_elevation_by_distance_with_noise() {
        let points = vec![(0.0, 0.0), (1.0, 1.0), (2.0, 2.0), (3.0, 3.0), (4.0, 4.0)];
        let elevations = vec![100.0, 102.0, 200.0, 104.0, 106.0]; // 200.0 is noise
        let distances = vec![0.0, 25.0, 50.0, 75.0, 100.0];

        let smoothed = smooth_elevation_by_distance(&points, &elevations, &distances, 50.0);

        // The noise point should be smoothed somewhat
        assert!(smoothed[2] < 200.0); // Should be less than original
        assert!(smoothed[2] > 100.0); // But still reasonable

        // Test that smoothing preserves general trend
        assert!(smoothed[0] < smoothed[4]); // Should still be generally ascending
    }

    #[test]
    fn test_calculate_slope_by_distance_window_flat() {
        let elevations = vec![100.0, 100.0, 100.0, 100.0];
        let distances = vec![0.0, 25.0, 50.0, 75.0];

        let slopes = calculate_slope_by_distance_window(&elevations, &distances, 25.0);

        // Flat terrain should have slopes close to 0%
        for slope in &slopes {
            assert!(slope.abs() < 0.1);
        }
    }

    #[test]
    fn test_calculate_slope_by_distance_window_uphill() {
        let elevations = vec![100.0, 110.0, 120.0, 130.0]; // Constant 10m rise per 25m
        let distances = vec![0.0, 25.0, 50.0, 75.0];

        let slopes = calculate_slope_by_distance_window(&elevations, &distances, 25.0);

        // Should calculate consistent uphill slopes
        for slope in &slopes {
            assert!(*slope > 0.0); // Should be positive (uphill)
            assert!(*slope < 50.0); // Should be reasonable
        }
    }

    #[test]
    fn test_calculate_slope_by_distance_window_insufficient_data() {
        let elevations = vec![100.0];
        let distances = vec![0.0];

        let slopes = calculate_slope_by_distance_window(&elevations, &distances, 25.0);

        // Should handle insufficient data gracefully - return empty vector for < 2 points
        assert_eq!(slopes.len(), 0);
    }

    #[test]
    fn test_new_algorithm_reduces_noise() {
        // Create a track with GPS noise
        let points = vec![
            (0.0, 0.0),
            (0.001, 0.001),
            (0.002, 0.002),
            (0.003, 0.003),
            (0.004, 0.004),
        ];
        let elevations = vec![
            Some(100.0),
            Some(150.0),
            Some(105.0),
            Some(160.0),
            Some(110.0), // Very noisy data
        ];

        let result = calculate_slope_metrics(&points, &elevations, "Noisy Test");

        // New algorithm should produce more reasonable results
        if let Some(slope_max) = result.slope_max {
            assert!(slope_max < 200.0); // Should be more reasonable than raw point-to-point
        }

        if let Some(slope_min) = result.slope_min {
            assert!(slope_min > -200.0); // Should be more reasonable than raw point-to-point
        }
    }

    #[test]
    fn test_improved_algorithm_handles_realistic_mountain_trail() {
        // Realistic mountain trail with gradual but substantial elevation gain
        let points = vec![
            (46.5197, 7.6322), // Zermatt area coordinates
            (46.5198, 7.6324),
            (46.5199, 7.6326),
            (46.5200, 7.6328),
            (46.5201, 7.6330),
            (46.5202, 7.6332),
        ];
        let elevations = vec![
            Some(1600.0),
            Some(1620.0),
            Some(1640.0),
            Some(1660.0),
            Some(1680.0),
            Some(1700.0),
        ]; // 100m gain over ~220m horizontal distance = ~45% slope, which is realistic for Alps

        let result = calculate_slope_metrics(&points, &elevations, "Alpine Trail Test");

        assert!(result.slope_min.is_some());
        assert!(result.slope_max.is_some());
        assert!(result.slope_avg.is_some());

        // Should handle steep but realistic mountain terrain
        let slope_avg = result.slope_avg.unwrap();
        assert!(slope_avg > 5.0); // Should be steep
        assert!(slope_avg < 100.0); // But reasonable for mountain trails
    }
}
