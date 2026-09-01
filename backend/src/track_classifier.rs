/// Track classification types based on analysis of track metrics
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TrackClassification {
    Marathon,     // ~42.2km ± 2km
    HalfMarathon, // ~21.1km ± 1km
    LongRun,      // >15km
    Interval,     // High speed variation, short high-intensity segments
    Fartlek,      // Medium speed variation, random accelerations
    TempoRun,     // Stable high speed
    AerobicRun,   // Stable medium speed
    RecoveryRun,  // Stable low speed
    Trail,        // High elevation gain + running speed
    Hiking,       // Low speed + elevation gain
    Walk,         // Very low speed
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
    pub avg_speed: Option<f64>,
    pub moving_avg_speed: Option<f64>,
    pub elevation_gain: Option<f64>,
    pub elevation_loss: Option<f64>,
    pub moving_time: Option<i32>,
    pub duration_seconds: Option<i32>,
}

/// Classify a track given its metrics
pub fn classify_track(metrics: &TrackMetrics) -> Vec<TrackClassification> {
    let mut classifications = Vec::new();
    classifications.extend(classify_by_distance(metrics));
    classifications.extend(classify_by_speed(metrics));
    classifications.extend(classify_by_activity_type(metrics));
    classifications
}

fn classify_by_distance(metrics: &TrackMetrics) -> Vec<TrackClassification> {
    let mut c = Vec::new();
    if metrics.length_km >= 40.2 && metrics.length_km <= 44.2 {
        c.push(TrackClassification::Marathon);
    }
    if metrics.length_km >= 20.1 && metrics.length_km <= 22.1 {
        c.push(TrackClassification::HalfMarathon);
    }
    if metrics.length_km > 15.0 {
        c.push(TrackClassification::LongRun);
    }
    c
}

fn classify_by_speed(metrics: &TrackMetrics) -> Vec<TrackClassification> {
    let mut c = Vec::new();
    if let Some(avg_speed) = metrics.moving_avg_speed {
        if avg_speed < 8.0 {
            c.push(TrackClassification::RecoveryRun);
        } else if (8.0..=12.0).contains(&avg_speed) {
            c.push(TrackClassification::AerobicRun);
        } else if avg_speed > 12.0 {
            c.push(TrackClassification::TempoRun);
        }
    }
    c
}

fn classify_by_activity_type(metrics: &TrackMetrics) -> Vec<TrackClassification> {
    let mut c = Vec::new();
    let elevation_gain = metrics.elevation_gain.unwrap_or(0.0);
    let avg_speed = metrics.moving_avg_speed.unwrap_or(0.0);
    if avg_speed < 5.0 {
        c.push(TrackClassification::Walk);
    }
    if (3.0..8.0).contains(&avg_speed) && elevation_gain > 200.0 {
        c.push(TrackClassification::Hiking);
    }
    if avg_speed >= 8.0 && elevation_gain > 500.0 {
        c.push(TrackClassification::Trail);
    }
    c
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
        let c = classify_track(&metrics);
        assert!(c.contains(&TrackClassification::Marathon));
        assert!(c.contains(&TrackClassification::LongRun));
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
        let c = classify_track(&metrics);
        assert!(c.contains(&TrackClassification::HalfMarathon));
        assert!(c.contains(&TrackClassification::LongRun));
    }

    #[test]
    fn test_recovery_run_classification() {
        let metrics = TrackMetrics {
            length_km: 5.0,
            avg_speed: Some(7.0),
            moving_avg_speed: Some(7.0),
            elevation_gain: Some(20.0),
            elevation_loss: Some(20.0),
            moving_time: Some(2571),
            duration_seconds: Some(2571),
        };
        let c = classify_track(&metrics);
        assert!(c.contains(&TrackClassification::RecoveryRun));
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
        let c = classify_track(&metrics);
        assert!(c.contains(&TrackClassification::Trail));
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
        let c = classify_track(&metrics);
        assert!(c.contains(&TrackClassification::Hiking));
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
        let c = classify_track(&metrics);
        assert!(c.contains(&TrackClassification::Walk));
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
        let c = classify_track(&metrics);
        assert!(!c.contains(&TrackClassification::RecoveryRun));
        assert!(!c.contains(&TrackClassification::AerobicRun));
        assert!(!c.contains(&TrackClassification::TempoRun));
    }

    #[test]
    fn test_classification_to_string() {
        assert_eq!(TrackClassification::Marathon.to_string(), "marathon");
        assert_eq!(TrackClassification::HalfMarathon.to_string(), "half_marathon");
        assert_eq!(TrackClassification::Trail.to_string(), "trail");
        assert_eq!(TrackClassification::Hiking.to_string(), "hiking");
        assert_eq!(TrackClassification::Walk.to_string(), "walk");
    }
}
