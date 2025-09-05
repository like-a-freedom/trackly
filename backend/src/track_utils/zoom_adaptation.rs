// Zoom-based track adaptation utilities for optimal performance
use crate::models::TrackMode;

/// Calculate tolerance in meters based on zoom level for track simplification
/// Lower zoom = broader view = higher tolerance (more simplification)
/// Higher zoom = detailed view = lower tolerance (less simplification)
pub fn tolerance_for_zoom(zoom: f64) -> f64 {
    match zoom as i32 {
        z if z <= 8 => 100.0, // ~100m tolerance for world/country view
        z if z <= 10 => 50.0, // ~50m for regional view
        z if z <= 12 => 25.0, // ~25m for city view
        z if z <= 14 => 10.0, // ~10m for neighborhood view
        z if z <= 16 => 5.0,  // ~5m for street view
        _ => 2.0,             // ~2m for very detailed view
    }
}

/// Determine appropriate simplification based on track mode and zoom
pub fn get_simplification_params(
    mode: TrackMode,
    zoom: Option<f64>,
    original_points: usize,
) -> SimplificationParams {
    let zoom_level = zoom.unwrap_or(12.0); // Default zoom
    let base_tolerance = tolerance_for_zoom(zoom_level);

    match mode {
        TrackMode::Overview => {
            // For overview mode, apply aggressive simplification
            let tolerance = if original_points > 20000 {
                base_tolerance * 2.0 // Extra aggressive for huge tracks
            } else if original_points > 5000 {
                base_tolerance * 1.5 // Moderate for large tracks
            } else if original_points > 1000 {
                base_tolerance // Normal simplification
            } else {
                0.0 // No simplification for small tracks
            };

            SimplificationParams {
                tolerance_meters: tolerance,
                max_points: calculate_max_points_for_zoom(zoom_level, true),
                min_points: 50, // Always keep minimum 50 points for shape
            }
        }
        TrackMode::Detail => {
            // For detail mode, preserve quality but still optimize huge tracks
            let tolerance = if original_points > 50000 {
                base_tolerance * 0.5 // Light simplification for massive tracks
            } else {
                0.0 // No simplification for reasonable tracks
            };

            SimplificationParams {
                tolerance_meters: tolerance,
                max_points: 10000, // Allow up to 10k points for detail view
                min_points: 100,   // Higher minimum for detail
            }
        }
    }
}

/// Calculate maximum points to return based on zoom level
/// Lower zoom = fewer points needed for smooth display
/// Higher zoom = more points needed for detail
fn calculate_max_points_for_zoom(zoom: f64, is_overview: bool) -> usize {
    if is_overview {
        match zoom as i32 {
            z if z <= 8 => 200,   // Very few points for world view
            z if z <= 10 => 500,  // Moderate for regional
            z if z <= 12 => 1000, // Standard for city view
            z if z <= 14 => 2000, // More detail for neighborhoods
            _ => 3000,            // High detail for street level
        }
    } else {
        // Detail mode allows more points at all zoom levels
        match zoom as i32 {
            z if z <= 8 => 1000,
            z if z <= 10 => 2000,
            z if z <= 12 => 5000,
            z if z <= 14 => 7500,
            _ => 10000,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SimplificationParams {
    pub tolerance_meters: f64,
    pub max_points: usize,
    pub min_points: usize,
}

impl SimplificationParams {
    /// Check if simplification should be applied
    pub fn should_simplify(&self, original_points: usize) -> bool {
        self.tolerance_meters > 0.0 || original_points > self.max_points
    }

    /// Get effective tolerance, adjusting for point count if needed
    pub fn effective_tolerance(&self, original_points: usize) -> f64 {
        if original_points > self.max_points && self.tolerance_meters == 0.0 {
            // If we have no base tolerance but too many points,
            // calculate minimum tolerance needed
            let ratio = original_points as f64 / self.max_points as f64;
            5.0 * ratio.ln() // Logarithmic scaling
        } else {
            self.tolerance_meters
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tolerance_for_zoom() {
        assert_eq!(tolerance_for_zoom(5.0), 100.0);
        assert_eq!(tolerance_for_zoom(10.0), 50.0);
        assert_eq!(tolerance_for_zoom(15.0), 5.0);
        assert_eq!(tolerance_for_zoom(20.0), 2.0);
    }

    #[test]
    fn test_overview_mode_params() {
        let params = get_simplification_params(TrackMode::Overview, Some(12.0), 5000);
        assert_eq!(params.tolerance_meters, 25.0);
        assert!(params.max_points >= 1000);
    }

    #[test]
    fn test_detail_mode_preserves_quality() {
        let params = get_simplification_params(TrackMode::Detail, Some(12.0), 5000);
        assert_eq!(params.tolerance_meters, 0.0); // No simplification for normal tracks
        assert!(params.max_points >= 5000);
    }

    #[test]
    fn test_huge_track_gets_simplified() {
        let params = get_simplification_params(TrackMode::Overview, Some(12.0), 25000);
        assert!(params.tolerance_meters > 25.0); // More aggressive for huge tracks
    }

    #[test]
    fn test_track_mode_conversions() {
        assert!(TrackMode::from_string("detail").is_detail());
        assert!(TrackMode::from_string("overview").is_overview());
        assert!(TrackMode::from_string("unknown").is_overview()); // Default
    }
}
