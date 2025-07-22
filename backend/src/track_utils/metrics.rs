// Metrics utilities for trackly
// Extracted from track_utils.rs for modularization

/// Calculate average speed in km/h
pub fn avg_speed_kmh(length_km: f64, duration_seconds: Option<i32>) -> Option<f64> {
    if let Some(duration) = duration_seconds {
        if duration > 0 && length_km > 0.0 {
            Some(length_km / (duration as f64 / 3600.0))
        } else {
            None
        }
    } else {
        None
    }
}

/// Calculate average pace in min/km
pub fn avg_pace_min_per_km(length_km: f64, duration_seconds: Option<i32>) -> Option<f64> {
    if let Some(duration) = duration_seconds {
        if duration > 0 && length_km > 0.0 {
            Some((duration as f64 / 60.0) / length_km)
        } else {
            None
        }
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_avg_speed_kmh_basic() {
        assert_eq!(avg_speed_kmh(10.0, Some(3600)), Some(10.0)); // 10km in 1h = 10km/h
        assert_eq!(avg_speed_kmh(5.0, Some(1800)), Some(10.0)); // 5km in 0.5h = 10km/h
    }

    #[test]
    fn test_avg_speed_kmh_zero_length_or_time() {
        assert_eq!(avg_speed_kmh(0.0, Some(3600)), None);
        assert_eq!(avg_speed_kmh(10.0, Some(0)), None);
        assert_eq!(avg_speed_kmh(10.0, None), None);
    }

    #[test]
    fn test_avg_pace_min_per_km_basic() {
        assert_eq!(avg_pace_min_per_km(10.0, Some(3600)), Some(6.0)); // 1h for 10km = 6min/km
        assert_eq!(avg_pace_min_per_km(5.0, Some(1500)), Some(5.0)); // 25min for 5km = 5min/km
    }

    #[test]
    fn test_avg_pace_min_per_km_zero_length_or_time() {
        assert_eq!(avg_pace_min_per_km(0.0, Some(3600)), None);
        assert_eq!(avg_pace_min_per_km(10.0, Some(0)), None);
        assert_eq!(avg_pace_min_per_km(10.0, None), None);
    }
}
