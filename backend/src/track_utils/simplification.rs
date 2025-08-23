// Track simplification utilities for trackly
// Implements Douglas-Peucker algorithm for line simplification

use crate::track_utils::geometry::haversine_distance;

/// Simplify a track using Douglas-Peucker algorithm
/// Returns simplified track with fewer points while preserving shape
pub fn simplify_track(points: &[(f64, f64)], tolerance_m: f64) -> Vec<(f64, f64)> {
    if points.len() <= 2 {
        return points.to_vec();
    }
    
    douglas_peucker(points, tolerance_m)
}

/// Douglas-Peucker line simplification algorithm
/// tolerance_m: maximum distance in meters from original line
fn douglas_peucker(points: &[(f64, f64)], tolerance: f64) -> Vec<(f64, f64)> {
    if points.len() <= 2 {
        return points.to_vec();
    }
    
    let mut result = Vec::new();
    let start = points[0];
    let end = points[points.len() - 1];
    
    // Find the point with the maximum distance from line segment
    let mut max_distance = 0.0;
    let mut max_index = 0;
    
    for (i, &point) in points[1..points.len() - 1].iter().enumerate() {
        let distance = perpendicular_distance(point, start, end);
        if distance > max_distance {
            max_distance = distance;
            max_index = i + 1; // +1 because we started from index 1
        }
    }
    
    // If max distance is greater than tolerance, recursively simplify
    if max_distance > tolerance {
        // Recursively simplify the two parts
        let left_part = douglas_peucker(&points[0..=max_index], tolerance);
        let right_part = douglas_peucker(&points[max_index..], tolerance);
        
        // Combine results (remove duplicate point at junction)
        result.extend_from_slice(&left_part[..left_part.len() - 1]);
        result.extend_from_slice(&right_part);
    } else {
        // All points can be represented by a straight line
        result.push(start);
        result.push(end);
    }
    
    result
}

/// Calculate perpendicular distance from point to line segment
/// Uses great circle distance for accuracy with GPS coordinates
fn perpendicular_distance(point: (f64, f64), line_start: (f64, f64), line_end: (f64, f64)) -> f64 {
    // Special case: if line start and end are the same point
    if (line_start.0 - line_end.0).abs() < 1e-10 && (line_start.1 - line_end.1).abs() < 1e-10 {
        return haversine_distance(point, line_start);
    }
    
    // Calculate cross-track distance using spherical trigonometry
    // This is more accurate for GPS coordinates than Euclidean distance
    let d13 = haversine_distance(line_start, point) / 6371000.0; // Convert to radians
    let bearing13 = bearing(line_start, point);
    let bearing12 = bearing(line_start, line_end);
    
    let cross_track_distance = (d13 * (bearing13 - bearing12).sin()).abs() * 6371000.0;
    
    // Ensure the perpendicular point is within the line segment
    let along_track_distance = d13 * (bearing13 - bearing12).cos() * 6371000.0;
    let line_length = haversine_distance(line_start, line_end);
    
    if along_track_distance < 0.0 {
        // Point is before line start
        haversine_distance(point, line_start)
    } else if along_track_distance > line_length {
        // Point is after line end
        haversine_distance(point, line_end)
    } else {
        // Point is perpendicular to line segment
        cross_track_distance
    }
}

/// Calculate bearing from point A to point B in radians
fn bearing(from: (f64, f64), to: (f64, f64)) -> f64 {
    let (lat1, lon1) = (from.0.to_radians(), from.1.to_radians());
    let (lat2, lon2) = (to.0.to_radians(), to.1.to_radians());
    
    let delta_lon = lon2 - lon1;
    let y = delta_lon.sin() * lat2.cos();
    let x = lat1.cos() * lat2.sin() - lat1.sin() * lat2.cos() * delta_lon.cos();
    
    y.atan2(x)
}

/// Get adaptive simplification tolerance based on zoom level
/// Higher zoom = lower tolerance (more detail)
/// Lower zoom = higher tolerance (less detail)
pub fn get_tolerance_for_zoom(zoom: f64) -> f64 {
    match zoom as u8 {
        0..=5 => 1000.0,   // 1km tolerance for world view
        6..=8 => 500.0,    // 500m for country/region view
        9..=11 => 100.0,   // 100m for city view
        12..=14 => 50.0,   // 50m for detailed view
        15..=17 => 10.0,   // 10m for street level
        _ => 5.0,          // 5m for maximum detail
    }
}

/// Determine adaptive tolerance scaling factor based on original point count.
/// Small tracks are left untouched to preserve fidelity.
/// Buckets:
/// - 0..=1000: no simplification (return original geometry & profiles)
/// - 1001..=5000: mild (scale 0.5 * base tolerance)
/// - 5001..=20000: base (scale 1.0) BUT guarded: ensure >= ~33% points retained
/// - 20001..=50000: strong (1.5x)
/// - >50000: aggressive (2.5x)
/// Rationale: frontend must remain responsive; small tracks deserve full detail; huge tracks need payload reduction.
/// The retention guard for moderate tracks avoids Douglas-Peucker over-collapsing nearly-linear segments.
fn adaptive_tolerance_scale(point_count: usize) -> Option<f64> {
    match point_count {
        0..=1000 => None,                 // No simplification
        1001..=5000 => Some(0.5),          // Mild
        5001..=20000 => Some(1.0),         // Base
        20001..=50000 => Some(1.5),        // Strong
        _ => Some(2.5),                    // Aggressive
    }
}

/// Adaptive wrapper: given raw points & zoom, decide whether and how strongly to simplify.
pub fn simplify_track_for_zoom(points: &[(f64, f64)], zoom: f64) -> Vec<(f64, f64)> {
    let base_tolerance = get_tolerance_for_zoom(zoom);
    if let Some(scale) = adaptive_tolerance_scale(points.len()) {
        let tol = base_tolerance * scale;
        let mut simplified = simplify_track(points, tol);
        // Prevent over-aggressive collapse for moderate-size tracks where user still expects detail.
        if (5001..=20000).contains(&points.len()) {
            let min_points = points.len() / 3 + 1; // ensure strictly greater than one third when possible
            if simplified.len() < min_points && min_points >= 3 { // only enforce if meaningful
                simplified = sample_uniform_points(points, min_points.max(3));
            }
        }
        simplified
    } else {
        // Return original for tiny tracks
        points.to_vec()
    }
}

/// Simplify profile data (elevation, heart rate, temperature) arrays
/// by taking every nth element to match simplified track points
pub fn simplify_profile_data(
    original_data: &[f64],
    original_track_length: usize,
    simplified_track_length: usize,
) -> Vec<f64> {
    if original_data.is_empty() || simplified_track_length == 0 {
        return Vec::new();
    }
    
    if original_data.len() != original_track_length {
        // If data length doesn't match track length, just sample uniformly
        return sample_uniform(original_data, simplified_track_length);
    }
    
    let mut simplified_data = Vec::with_capacity(simplified_track_length);
    
    for i in 0..simplified_track_length {
        let original_index = (i * (original_track_length - 1)) / (simplified_track_length - 1);
        let original_index = original_index.min(original_data.len() - 1);
        simplified_data.push(original_data[original_index]);
    }
    
    simplified_data
}

/// Simplify JSON array of numbers to match simplified track points
pub fn simplify_json_array(
    json_value: &serde_json::Value,
    original_track_length: usize,
    simplified_track_length: usize,
) -> Option<serde_json::Value> {
    if let Some(array) = json_value.as_array() {
        let numbers: Vec<f64> = array
            .iter()
            .filter_map(|v| v.as_f64())
            .collect();
        
        if numbers.is_empty() {
            return None;
        }
        
        let simplified_numbers = simplify_profile_data(&numbers, original_track_length, simplified_track_length);
        let simplified_json: Vec<serde_json::Value> = simplified_numbers
            .into_iter()
            .map(|n| serde_json::Value::Number(serde_json::Number::from_f64(n).unwrap_or_else(|| serde_json::Number::from(0))))
            .collect();
        
        Some(serde_json::Value::Array(simplified_json))
    } else {
        None
    }
}

/// Sample data uniformly across the array
fn sample_uniform(data: &[f64], target_length: usize) -> Vec<f64> {
    if data.is_empty() || target_length == 0 {
        return Vec::new();
    }
    
    if data.len() <= target_length {
        return data.to_vec();
    }
    
    let mut result = Vec::with_capacity(target_length);
    let step = data.len() as f64 / target_length as f64;
    
    for i in 0..target_length {
        let index = (i as f64 * step) as usize;
        let index = index.min(data.len() - 1);
        result.push(data[index]);
    }
    
    result
}

/// Uniformly sample point geometry to desired target length preserving endpoints.
fn sample_uniform_points(points: &[(f64, f64)], target_len: usize) -> Vec<(f64, f64)> {
    if target_len == 0 { return Vec::new(); }
    if target_len >= points.len() { return points.to_vec(); }
    if points.len() <= 2 { return points.to_vec(); }
    let mut result = Vec::with_capacity(target_len);
    let step = (points.len() - 1) as f64 / (target_len - 1) as f64;
    for i in 0..target_len {
        let idx = (i as f64 * step).round() as usize;
        result.push(points[idx]);
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    use assert_approx_eq::assert_approx_eq;

    #[test]
    fn test_simplify_straight_line() {
        // Points on a relatively straight line should be significantly reduced
        let points = vec![
            (55.0, 37.0),
            (55.01, 37.01), // Very close points
            (55.02, 37.02),
            (55.03, 37.03),
        ];
        
        let simplified = simplify_track(&points, 1000.0); // 1km tolerance - should simplify aggressively
        // Should reduce to fewer points, though may not be exactly 2 due to Earth curvature
        assert!(simplified.len() <= points.len());
        assert!(simplified.len() >= 2); // At minimum start and end
        assert_eq!(simplified[0], points[0]); // First point preserved
        assert_eq!(simplified[simplified.len() - 1], points[points.len() - 1]); // Last point preserved
    }

    #[test]
    fn test_simplify_complex_shape() {
        // L-shaped path should keep the corner
        let points = vec![
            (55.0, 37.0),   // Start
            (55.1, 37.0),   // Straight segment
            (55.2, 37.0),   // Corner approach
            (55.2, 37.1),   // Corner
            (55.2, 37.2),   // End
        ];
        
        let simplified = simplify_track(&points, 100.0); // 100m tolerance
        // Should keep at least start, corner, and end
        assert!(simplified.len() >= 3);
    }

    #[test]
    fn test_empty_and_small_tracks() {
        assert_eq!(simplify_track(&[], 10.0), vec![]);
        assert_eq!(simplify_track(&[(55.0, 37.0)], 10.0), vec![(55.0, 37.0)]);
        
        let two_points = vec![(55.0, 37.0), (55.1, 37.1)];
        assert_eq!(simplify_track(&two_points, 10.0), two_points);
    }

    #[test]
    fn test_tolerance_for_zoom() {
        assert_eq!(get_tolerance_for_zoom(3.0), 1000.0);
        assert_eq!(get_tolerance_for_zoom(10.0), 100.0);
        assert_eq!(get_tolerance_for_zoom(15.0), 10.0);
        assert_eq!(get_tolerance_for_zoom(20.0), 5.0);
    }

    #[test]
    fn test_perpendicular_distance() {
        let start = (55.0, 37.0);
        let end = (55.1, 37.0);
        let point_on_line = (55.05, 37.0);
        let point_off_line = (55.05, 37.1);
        
        // Point on line should have near-zero distance
        let dist_on = perpendicular_distance(point_on_line, start, end);
        assert!(dist_on < 10.0); // Less than 10 meters
        
        // Point off line should have measurable distance
        let dist_off = perpendicular_distance(point_off_line, start, end);
        assert!(dist_off > 1000.0); // More than 1 km
    }

    #[test]
    fn test_simplification_stats() {
        let original = vec![(55.0, 37.0), (55.1, 37.1), (55.2, 37.2), (55.3, 37.3)];
        let simplified = vec![(55.0, 37.0), (55.3, 37.3)];
        
        let stats = get_simplification_stats(&original, &simplified, 100.0);
        assert_eq!(stats.original_points, 4);
        assert_eq!(stats.simplified_points, 2);
        assert_approx_eq!(stats.compression_ratio, 0.5, 0.001);
        assert_eq!(stats.tolerance_used, 100.0);
    }

    #[test]
    fn test_bearing_calculation() {
        let north = bearing((55.0, 37.0), (56.0, 37.0));
        let east = bearing((55.0, 37.0), (55.0, 38.0));
        
        // North bearing should be close to 0 radians
        assert!(north.abs() < 0.1);
        
        // East bearing should be close to π/2 radians
        assert!((east - std::f64::consts::PI / 2.0).abs() < 0.1);
    }

    #[test]
    fn test_adaptive_scale_thresholds() {
        assert_eq!(adaptive_tolerance_scale(500), None);
        assert_eq!(adaptive_tolerance_scale(1500), Some(0.5));
        assert_eq!(adaptive_tolerance_scale(8000), Some(1.0));
        assert_eq!(adaptive_tolerance_scale(30000), Some(1.5));
        assert_eq!(adaptive_tolerance_scale(120000), Some(2.5));
    }

    #[test]
    fn test_adaptive_no_simplification_small_track() {
        let points: Vec<(f64,f64)> = (0..500).map(|i| (55.0 + i as f64 * 0.0001, 37.0 + i as f64 * 0.0001)).collect();
        let simplified = simplify_track_for_zoom(&points, 14.0);
        assert_eq!(simplified.len(), points.len());
    }

    #[test]
    fn test_adaptive_moderate_large_track() {
        let points: Vec<(f64,f64)> = (0..6000).map(|i| (55.0 + i as f64 * 0.00001, 37.0 + i as f64 * 0.00001)).collect();
        let simplified = simplify_track_for_zoom(&points, 14.0);
        assert!(simplified.len() < points.len());
        assert!(simplified.len() > points.len() / 3); // Not too aggressive at this size
    }

    #[test]
    fn test_adaptive_aggressive_huge_track() {
        let points: Vec<(f64,f64)> = (0..120000).map(|i| (55.0 + i as f64 * 0.000001, 37.0 + i as f64 * 0.000001)).collect();
        let simplified = simplify_track_for_zoom(&points, 10.0); // base tol higher at lower zoom
        assert!(simplified.len() < points.len() / 2); // Should compress strongly
    }

    #[test]
    fn test_adaptive_profile_small_track_untouched() {
        let points: Vec<(f64,f64)> = (0..800).map(|i| (55.0 + i as f64 * 0.00005, 37.0 + i as f64 * 0.00005)).collect();
        let elevation: Vec<f64> = (0..points.len()).map(|i| i as f64).collect();
        let elevation_json = serde_json::json!(elevation);
        let simplified_points = simplify_track_for_zoom(&points, 14.0);
        // No simplification expected for geometry
        assert_eq!(simplified_points.len(), points.len());
        let simplified_profile = simplify_profile_array_adaptive(&elevation_json, points.len(), simplified_points.len()).unwrap();
        assert_eq!(simplified_profile.as_array().unwrap().len(), elevation.len());
    }

    #[test]
    fn test_adaptive_profile_moderate_track_reduced() {
        let points: Vec<(f64,f64)> = (0..7000).map(|i| (55.0 + i as f64 * 0.00001, 37.0 + i as f64 * 0.00001)).collect();
        let hr: Vec<f64> = (0..points.len()).map(|i| (60 + (i % 100) as i32) as f64).collect();
        let hr_json = serde_json::json!(hr);
        let simplified_points = simplify_track_for_zoom(&points, 14.0);
        assert!(simplified_points.len() < points.len());
        // Geometry should retain > 1/3 due to retention guard
        assert!(simplified_points.len() > points.len() / 3);
        let simplified_profile = simplify_profile_array_adaptive(&hr_json, points.len(), simplified_points.len()).unwrap();
        let simplified_len = simplified_profile.as_array().unwrap().len();
        assert_eq!(simplified_len, simplified_points.len());
        assert!(simplified_len < hr.len());
    }
}

/// Calculate simplification statistics
pub struct SimplificationStats {
    pub original_points: usize,
    pub simplified_points: usize,
    pub compression_ratio: f64,
    pub tolerance_used: f64,
}

pub fn get_simplification_stats(
    original: &[(f64, f64)],
    simplified: &[(f64, f64)],
    tolerance: f64,
) -> SimplificationStats {
    let compression_ratio = if !original.is_empty() {
        simplified.len() as f64 / original.len() as f64
    } else {
        0.0
    };
    SimplificationStats {
        original_points: original.len(),
        simplified_points: simplified.len(),
        compression_ratio,
        tolerance_used: tolerance,
    }
}

/// Adaptive simplification for profile arrays (elevation, hr, temp, time)
/// Keeps arrays untouched for small tracks and samples proportionally otherwise.
pub fn simplify_profile_array_adaptive(
    json_value: &serde_json::Value,
    original_track_length: usize,
    simplified_track_length: usize,
) -> Option<serde_json::Value> {
    // If no geometry simplification happened (lengths equal) OR small track: return original
    if original_track_length <= 1000 || original_track_length == simplified_track_length {
        return json_value.clone().into();
    }
    simplify_json_array(json_value, original_track_length, simplified_track_length)
}
