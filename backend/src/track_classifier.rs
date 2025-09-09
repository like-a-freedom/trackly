/// Track classification types based on analysis of track metrics
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TrackClassification {
    // Distance-based classifications
    Marathon,     // ~42.2km ± 2km
    HalfMarathon, // ~21.1km ± 1km
    LongRun,      // >15km

    // Intensity-based classifications
    Interval,    // High speed variation, short high-intensity segments
    Fartlek,     // Medium speed variation, random accelerations
    TempoRun,    // Stable high speed
    AerobicRun,  // Stable medium speed
    RecoveryRun, // Stable low speed

    // Activity type classifications
    Trail,  // High elevation gain + running speed
    Hiking, // Low speed + elevation gain
    Walk,   // Very low speed
}

use std::fmt;

impl fmt::Display for TrackClassification {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            TrackClassification::Marathon => "marathon",
            TrackClassification::HalfMarathon => "half_marathon",
            TrackClassification::LongRun => "long_run",
            TrackClassification::Interval => "interval",
            TrackClassification::Fartlek => "fartlek",
            TrackClassification::TempoRun => "tempo_run",
            TrackClassification::AerobicRun => "aerobic_run",
            TrackClassification::RecoveryRun => "recovery_run",
            TrackClassification::Trail => "trail",
            TrackClassification::Hiking => "hiking",
            TrackClassification::Walk => "walk",
        };
        write!(f, "{s}")
    }
}

/// Track metrics used for classification analysis
#[derive(Debug, Clone)]
pub struct TrackMetrics {
    pub length_km: f64,
    pub avg_speed: Option<f64>,        // km/h
    pub moving_avg_speed: Option<f64>, // km/h
    pub elevation_gain: Option<f64>,   // meters (unified field)
    pub elevation_loss: Option<f64>,   // meters (unified field)
    pub moving_time: Option<i32>,      // seconds
    pub duration_seconds: Option<i32>, // total seconds
}

/// Track classifier that analyzes metrics and determines classifications
pub struct TrackClassifier;

impl TrackClassifier {
    /// Analyze track metrics and return all applicable classifications
    pub fn classify(metrics: &TrackMetrics) -> Vec<TrackClassification> {
        let mut classifications = Vec::new();

        // Distance-based classifications
        classifications.extend(Self::classify_by_distance(metrics));

        // Speed/intensity-based classifications
        classifications.extend(Self::classify_by_speed(metrics));

        // Activity type classifications
        classifications.extend(Self::classify_by_activity_type(metrics));

        classifications
    }

    /// Classify track based on distance
    fn classify_by_distance(metrics: &TrackMetrics) -> Vec<TrackClassification> {
        let mut classifications = Vec::new();

        // Marathon: 42.195km ± 2km (40.2 - 44.2km)
        if metrics.length_km >= 40.2 && metrics.length_km <= 44.2 {
            classifications.push(TrackClassification::Marathon);
        }

        // Half Marathon: 21.1km ± 1km (20.1 - 22.1km)
        if metrics.length_km >= 20.1 && metrics.length_km <= 22.1 {
            classifications.push(TrackClassification::HalfMarathon);
        }

        // Long run: >15km
        if metrics.length_km > 15.0 {
            classifications.push(TrackClassification::LongRun);
        }

        classifications
    }

    /// Classify track based on speed patterns
    fn classify_by_speed(metrics: &TrackMetrics) -> Vec<TrackClassification> {
        let mut classifications = Vec::new();

        if let Some(avg_speed) = metrics.moving_avg_speed {
            // Recovery run: very low speed (< 8 km/h)
            if avg_speed < 8.0 {
                classifications.push(TrackClassification::RecoveryRun);
            }
            // Aerobic run: moderate speed (8-12 km/h)
            else if (8.0..=12.0).contains(&avg_speed) {
                classifications.push(TrackClassification::AerobicRun);
            }
            // Tempo run: high speed (> 12 km/h)
            else if avg_speed > 12.0 {
                classifications.push(TrackClassification::TempoRun);
            }
        }

        classifications
    }

    /// Classify track based on activity type (elevation + speed)
    fn classify_by_activity_type(metrics: &TrackMetrics) -> Vec<TrackClassification> {
        let mut classifications = Vec::new();

        let elevation_gain = metrics.elevation_gain.unwrap_or(0.0);
        let avg_speed = metrics.moving_avg_speed.unwrap_or(0.0);

        // Walk: very low speed (< 5 km/h)
        if avg_speed < 5.0 {
            classifications.push(TrackClassification::Walk);
        }

        // Hiking: low speed + elevation gain
        if (3.0..8.0).contains(&avg_speed) && elevation_gain > 200.0 {
            classifications.push(TrackClassification::Hiking);
        }

        // Trail: running speed + significant elevation gain
        if avg_speed >= 8.0 && elevation_gain > 500.0 {
            classifications.push(TrackClassification::Trail);
        }

        classifications
    }
}

/// Public API: classify a track given its metrics
pub fn classify_track(metrics: &TrackMetrics) -> Vec<TrackClassification> {
    TrackClassifier::classify(metrics)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_marathon_classification() {
        let metrics = TrackMetrics {
            length_km: 42.2,
            avg_speed: Some(12.0),
            moving_avg_speed: Some(12.0),
            elevation_gain: Some(100.0),
            elevation_loss: Some(100.0),
            moving_time: Some(3600),
            duration_seconds: Some(3600),
        };

        let classifications = TrackClassifier::classify(&metrics);
        assert!(classifications.contains(&TrackClassification::Marathon));
        assert!(classifications.contains(&TrackClassification::LongRun));
    }

    #[test]
    fn test_half_marathon_classification() {
        let metrics = TrackMetrics {
            length_km: 21.1,
            avg_speed: Some(11.0),
            moving_avg_speed: Some(11.0),
            elevation_gain: Some(50.0),
            elevation_loss: Some(50.0),
            moving_time: Some(1800),
            duration_seconds: Some(1800),
        };

        let classifications = TrackClassifier::classify(&metrics);
        assert!(classifications.contains(&TrackClassification::HalfMarathon));
        assert!(classifications.contains(&TrackClassification::LongRun));
    }

    #[test]
    fn test_recovery_run_classification() {
        let metrics = TrackMetrics {
            length_km: 5.0,
            avg_speed: Some(7.0),
            moving_avg_speed: Some(7.0),
            elevation_gain: Some(20.0),
            elevation_loss: Some(20.0),
            moving_time: Some(2571), // ~43 min
            duration_seconds: Some(2571),
        };

        let classifications = TrackClassifier::classify(&metrics);
        assert!(classifications.contains(&TrackClassification::RecoveryRun));
    }

    #[test]
    fn test_trail_classification() {
        let metrics = TrackMetrics {
            length_km: 10.0,
            avg_speed: Some(9.0),
            moving_avg_speed: Some(9.0),
            elevation_gain: Some(600.0),
            elevation_loss: Some(600.0),
            moving_time: Some(4000),
            duration_seconds: Some(4000),
        };

        let classifications = TrackClassifier::classify(&metrics);
        assert!(classifications.contains(&TrackClassification::Trail));
    }

    #[test]
    fn test_hiking_classification() {
        let metrics = TrackMetrics {
            length_km: 8.0,
            avg_speed: Some(4.5),
            moving_avg_speed: Some(4.5),
            elevation_gain: Some(400.0),
            elevation_loss: Some(400.0),
            moving_time: Some(6400),
            duration_seconds: Some(6400),
        };

        let classifications = TrackClassifier::classify(&metrics);
        assert!(classifications.contains(&TrackClassification::Hiking));
    }

    #[test]
    fn test_walk_classification() {
        let metrics = TrackMetrics {
            length_km: 3.0,
            avg_speed: Some(4.0),
            moving_avg_speed: Some(4.0),
            elevation_gain: Some(10.0),
            elevation_loss: Some(10.0),
            moving_time: Some(2700),
            duration_seconds: Some(2700),
        };

        let classifications = TrackClassifier::classify(&metrics);
        assert!(classifications.contains(&TrackClassification::Walk));
    }

    #[test]
    fn test_no_classifications_for_insufficient_data() {
        let metrics = TrackMetrics {
            length_km: 2.0,
            avg_speed: None,
            moving_avg_speed: None,
            elevation_gain: None,
            elevation_loss: None,
            moving_time: None,
            duration_seconds: None,
        };

        let classifications = TrackClassifier::classify(&metrics);
        // Should have no speed-based classifications due to missing data
        assert!(!classifications.contains(&TrackClassification::RecoveryRun));
        assert!(!classifications.contains(&TrackClassification::AerobicRun));
        assert!(!classifications.contains(&TrackClassification::TempoRun));
    }

    #[test]
    fn test_classification_to_string() {
        assert_eq!(TrackClassification::Marathon.to_string(), "marathon");
        assert_eq!(
            TrackClassification::HalfMarathon.to_string(),
            "half_marathon"
        );
        assert_eq!(TrackClassification::Trail.to_string(), "trail");
        assert_eq!(TrackClassification::Hiking.to_string(), "hiking");
        assert_eq!(TrackClassification::Walk.to_string(), "walk");
    }
}
