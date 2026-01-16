/// Adaptive pace filtering module for trackly
/// Filters pace spikes and anomalies based on track activity type and context
use crate::track_classifier::TrackClassification;
use tracing::debug;

/// Configuration for pace filtering parameters
#[derive(Debug, Clone)]
pub struct PaceFilterConfig {
    pub spike_multiplier: f64,
    pub max_pace: f64,     // min/km
    pub min_pace: f64,     // min/km
    pub max_time_gap: u32, // seconds
    pub smoothing_window: usize,
    pub outlier_std_dev_threshold: f64,
    pub min_speed_threshold: f64, // km/h
}

impl Default for PaceFilterConfig {
    fn default() -> Self {
        Self {
            spike_multiplier: get_env_f64("PACE_SPIKE_MULTIPLIER_DEFAULT", 3.0),
            max_pace: get_env_f64("PACE_MAX_DEFAULT", 20.0),
            min_pace: get_env_f64("PACE_MIN_DEFAULT", 1.0),
            max_time_gap: get_env_u32("PACE_MAX_TIME_GAP_DEFAULT", 60),
            smoothing_window: get_env_usize("PACE_SMOOTHING_WINDOW_SIZE", 5),
            outlier_std_dev_threshold: get_env_f64("PACE_OUTLIER_STD_DEV_THRESHOLD", 2.5),
            min_speed_threshold: get_env_f64("PACE_MIN_SPEED_THRESHOLD", 1.0),
        }
    }
}

/// Get activity-specific pace filter configuration
pub fn get_pace_filter_config(classifications: &[TrackClassification]) -> PaceFilterConfig {
    // Use the first classification to determine configuration
    if let Some(classification) = classifications.first() {
        match classification {
            TrackClassification::Hiking => PaceFilterConfig {
                spike_multiplier: get_env_f64("PACE_SPIKE_MULTIPLIER_HIKING", 2.5),
                max_pace: get_env_f64("PACE_MAX_HIKING", 30.0),
                min_pace: get_env_f64("PACE_MIN_HIKING", 3.0),
                max_time_gap: get_env_u32("PACE_MAX_TIME_GAP_HIKING", 120),
                ..Default::default()
            },
            TrackClassification::Walk => PaceFilterConfig {
                spike_multiplier: get_env_f64("PACE_SPIKE_MULTIPLIER_WALKING", 2.0),
                max_pace: get_env_f64("PACE_MAX_WALKING", 20.0),
                min_pace: get_env_f64("PACE_MIN_WALKING", 5.0),
                max_time_gap: get_env_u32("PACE_MAX_TIME_GAP_WALKING", 60),
                ..Default::default()
            },
            TrackClassification::Trail
            | TrackClassification::Marathon
            | TrackClassification::HalfMarathon
            | TrackClassification::LongRun
            | TrackClassification::Interval
            | TrackClassification::Fartlek
            | TrackClassification::TempoRun
            | TrackClassification::AerobicRun
            | TrackClassification::RecoveryRun => PaceFilterConfig {
                spike_multiplier: get_env_f64("PACE_SPIKE_MULTIPLIER_RUNNING", 3.0),
                max_pace: get_env_f64("PACE_MAX_RUNNING", 15.0),
                min_pace: get_env_f64("PACE_MIN_RUNNING", 2.0),
                max_time_gap: get_env_u32("PACE_MAX_TIME_GAP_RUNNING", 30),
                ..Default::default()
            },
        }
    } else {
        PaceFilterConfig::default()
    }
}

/// Detect if track might be cycling based on speed patterns and return appropriate config
pub fn detect_cycling_and_get_config(speed_data: &[Option<f64>]) -> Option<PaceFilterConfig> {
    let valid_speeds: Vec<f64> = speed_data.iter().filter_map(|&s| s).collect();

    if valid_speeds.len() < 3 {
        return None; // Not enough data to determine
    }

    let avg_speed = valid_speeds.iter().sum::<f64>() / valid_speeds.len() as f64;
    let max_speed = valid_speeds.iter().fold(0.0_f64, |a, &b| a.max(b));

    // Cycling detection heuristics:
    // - Average speed > 15 km/h (typically cycling territory)
    // - Max speed > 30 km/h (unlikely for running/walking)
    // - Speed variation suggests cycling patterns
    if avg_speed > 15.0 || max_speed > 30.0 {
        Some(PaceFilterConfig {
            spike_multiplier: get_env_f64("PACE_SPIKE_MULTIPLIER_CYCLING", 5.0),
            max_pace: get_env_f64("PACE_MAX_CYCLING", 5.0),
            min_pace: get_env_f64("PACE_MIN_CYCLING", 0.5),
            max_time_gap: get_env_u32("PACE_MAX_TIME_GAP_CYCLING", 60),
            ..Default::default()
        })
    } else {
        None
    }
}

/// Filter pace data using adaptive algorithms based on track context
pub fn filter_pace_data(
    pace_data: &[Option<f64>],
    speed_data: &[Option<f64>],
    time_diffs: &[Option<f64>], // time differences in seconds
    classifications: &[TrackClassification],
) -> Vec<Option<f64>> {
    if pace_data.is_empty() {
        return Vec::new();
    }

    // First try to get config from explicit classifications
    let mut config = get_pace_filter_config(classifications);

    // If no specific classification matched, try cycling detection based on speed patterns
    if (classifications.is_empty()
        || config.spike_multiplier == get_env_f64("PACE_SPIKE_MULTIPLIER_DEFAULT", 3.0))
        && let Some(cycling_config) = detect_cycling_and_get_config(speed_data)
    {
        config = cycling_config;
        debug!("Detected cycling activity based on speed patterns");
    }

    debug!(
        "Filtering pace data with config: spike_multiplier={}, max_pace={}, min_pace={}",
        config.spike_multiplier, config.max_pace, config.min_pace
    );

    // Step 1: Basic range filtering
    let mut filtered_data = apply_range_filter(pace_data, speed_data, &config);

    // Step 2: Time gap filtering
    filtered_data = apply_time_gap_filter(&filtered_data, time_diffs, &config);

    // Step 3: Statistical outlier detection
    filtered_data = apply_statistical_filter(&filtered_data, &config);

    // Step 4: Spike detection using local averages
    filtered_data = apply_spike_filter(&filtered_data, &config);

    // Step 5: Smoothing (optional, for very noisy data)
    if needs_smoothing(&filtered_data, &config) {
        filtered_data = apply_smoothing(&filtered_data, &config);
    }

    debug!(
        "Pace filtering complete: {} -> {} valid points",
        pace_data.iter().filter(|p| p.is_some()).count(),
        filtered_data.iter().filter(|p| p.is_some()).count()
    );

    filtered_data
}

/// Apply basic range filtering based on activity-specific limits
fn apply_range_filter(
    pace_data: &[Option<f64>],
    speed_data: &[Option<f64>],
    config: &PaceFilterConfig,
) -> Vec<Option<f64>> {
    pace_data
        .iter()
        .zip(speed_data.iter())
        .map(|(pace, speed)| {
            if let (Some(p), Some(s)) = (pace, speed) {
                // Filter by pace range
                if *p < config.min_pace || *p > config.max_pace {
                    return None;
                }
                // Filter by minimum speed threshold
                if *s < config.min_speed_threshold {
                    return None;
                }
                Some(*p)
            } else {
                None
            }
        })
        .collect()
}

/// Filter out pace values that occur after large time gaps (likely stops/pauses)
fn apply_time_gap_filter(
    pace_data: &[Option<f64>],
    time_diffs: &[Option<f64>],
    config: &PaceFilterConfig,
) -> Vec<Option<f64>> {
    pace_data
        .iter()
        .zip(time_diffs.iter())
        .map(|(pace, time_diff)| {
            if let (Some(p), Some(td)) = (pace, time_diff) {
                if *td > config.max_time_gap as f64 {
                    None // Filter out pace after long time gaps
                } else {
                    Some(*p)
                }
            } else {
                *pace
            }
        })
        .collect()
}

/// Apply statistical outlier detection using standard deviation
fn apply_statistical_filter(
    pace_data: &[Option<f64>],
    config: &PaceFilterConfig,
) -> Vec<Option<f64>> {
    let valid_paces: Vec<f64> = pace_data.iter().filter_map(|&p| p).collect();

    if valid_paces.len() < 3 {
        return pace_data.to_vec(); // Not enough data for statistical analysis
    }

    let mean = valid_paces.iter().sum::<f64>() / valid_paces.len() as f64;
    let variance =
        valid_paces.iter().map(|p| (p - mean).powi(2)).sum::<f64>() / valid_paces.len() as f64;
    let std_dev = variance.sqrt();

    let threshold = config.outlier_std_dev_threshold * std_dev;

    pace_data
        .iter()
        .map(|pace| {
            if let Some(p) = pace {
                if (p - mean).abs() > threshold {
                    None // Filter out statistical outliers
                } else {
                    Some(*p)
                }
            } else {
                None
            }
        })
        .collect()
}

/// Apply spike detection using local moving averages
fn apply_spike_filter(pace_data: &[Option<f64>], config: &PaceFilterConfig) -> Vec<Option<f64>> {
    let window_size = config.smoothing_window.min(pace_data.len() / 4).max(3);
    let mut filtered_data = pace_data.to_vec();

    for i in 0..pace_data.len() {
        if let Some(current_pace) = pace_data[i] {
            // Calculate local average around this point
            let start = i.saturating_sub(window_size / 2);
            let end = (i + window_size / 2 + 1).min(pace_data.len());

            let local_paces: Vec<f64> = pace_data[start..end]
                .iter()
                .enumerate()
                .filter_map(|(idx, p)| {
                    // Exclude current point from local average
                    if start + idx != i { *p } else { None }
                })
                .collect();

            if !local_paces.is_empty() {
                let local_avg = local_paces.iter().sum::<f64>() / local_paces.len() as f64;

                // Check if current pace is a spike
                if current_pace > local_avg * config.spike_multiplier {
                    filtered_data[i] = None;
                    debug!(
                        "Filtered pace spike at index {}: {} min/km (local avg: {} min/km)",
                        i, current_pace, local_avg
                    );
                }
            }
        }
    }

    filtered_data
}

/// Check if smoothing is needed based on data quality
fn needs_smoothing(pace_data: &[Option<f64>], _config: &PaceFilterConfig) -> bool {
    let valid_paces: Vec<f64> = pace_data.iter().filter_map(|&p| p).collect();

    if valid_paces.len() < 10 {
        return false; // Not enough data for meaningful smoothing
    }

    // Calculate coefficient of variation
    let mean = valid_paces.iter().sum::<f64>() / valid_paces.len() as f64;
    let variance =
        valid_paces.iter().map(|p| (p - mean).powi(2)).sum::<f64>() / valid_paces.len() as f64;
    let std_dev = variance.sqrt();
    let cv = std_dev / mean;

    // Apply smoothing if data is very noisy (CV > 0.3)
    cv > 0.3
}

/// Apply moving median smoothing to reduce noise
fn apply_smoothing(pace_data: &[Option<f64>], config: &PaceFilterConfig) -> Vec<Option<f64>> {
    let window_size = config.smoothing_window;
    let mut smoothed_data = pace_data.to_vec();

    for i in 0..pace_data.len() {
        if pace_data[i].is_some() {
            let start = i.saturating_sub(window_size / 2);
            let end = (i + window_size / 2 + 1).min(pace_data.len());

            let mut window_values: Vec<f64> =
                pace_data[start..end].iter().filter_map(|&p| p).collect();

            if !window_values.is_empty() {
                window_values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                let median = if window_values.len().is_multiple_of(2) {
                    (window_values[window_values.len() / 2 - 1]
                        + window_values[window_values.len() / 2])
                        / 2.0
                } else {
                    window_values[window_values.len() / 2]
                };
                smoothed_data[i] = Some(median);
            }
        }
    }

    smoothed_data
}

/// Helper function to get environment variable as f64 with default
fn get_env_f64(key: &str, default: f64) -> f64 {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}

/// Helper function to get environment variable as u32 with default
fn get_env_u32(key: &str, default: u32) -> u32 {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}

/// Helper function to get environment variable as usize with default
fn get_env_usize(key: &str, default: usize) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_range_filter() {
        let pace_data = vec![
            Some(5.0),  // Valid
            Some(0.5),  // Too fast (below min)
            Some(25.0), // Too slow (above max)
            Some(8.0),  // Valid
            None,       // No data
        ];
        let speed_data = vec![
            Some(12.0),  // Valid speed
            Some(120.0), // Too fast, but pace filter should catch it
            Some(2.4),   // Slow speed
            Some(7.5),   // Valid speed
            None,        // No data
        ];

        let config = PaceFilterConfig {
            min_pace: 2.0,
            max_pace: 15.0,
            min_speed_threshold: 1.0,
            ..Default::default()
        };

        let filtered = apply_range_filter(&pace_data, &speed_data, &config);

        assert_eq!(filtered[0], Some(5.0));
        assert_eq!(filtered[1], None); // Filtered due to pace < min_pace
        assert_eq!(filtered[2], None); // Filtered due to pace > max_pace
        assert_eq!(filtered[3], Some(8.0));
        assert_eq!(filtered[4], None);
    }

    #[test]
    fn test_time_gap_filter() {
        let pace_data = vec![Some(5.0), Some(6.0), Some(20.0), Some(7.0)];
        let time_diffs = vec![Some(10.0), Some(15.0), Some(120.0), Some(12.0)];

        let config = PaceFilterConfig {
            max_time_gap: 60,
            ..Default::default()
        };

        let filtered = apply_time_gap_filter(&pace_data, &time_diffs, &config);

        assert_eq!(filtered[0], Some(5.0));
        assert_eq!(filtered[1], Some(6.0));
        assert_eq!(filtered[2], None); // Filtered due to long time gap
        assert_eq!(filtered[3], Some(7.0));
    }

    #[test]
    fn test_statistical_filter() {
        let pace_data = vec![
            Some(5.0),
            Some(5.2),
            Some(4.8),
            Some(5.1),
            Some(15.0), // Outlier
            Some(5.3),
            Some(4.9),
            Some(5.0),
        ];

        let config = PaceFilterConfig {
            outlier_std_dev_threshold: 2.0,
            ..Default::default()
        };

        let filtered = apply_statistical_filter(&pace_data, &config);

        // The outlier (15.0) should be filtered out
        assert!(filtered[4].is_none());
        // Other values should remain
        assert!(filtered[0].is_some());
        assert!(filtered[1].is_some());
    }

    #[test]
    fn test_spike_filter() {
        let pace_data = vec![
            Some(5.0),
            Some(5.2),
            Some(15.0), // Spike
            Some(5.1),
            Some(5.3),
        ];

        let config = PaceFilterConfig {
            spike_multiplier: 2.0,
            smoothing_window: 3,
            ..Default::default()
        };

        let filtered = apply_spike_filter(&pace_data, &config);

        // The spike should be filtered out
        assert_eq!(filtered[2], None);
        // Other values should remain
        assert!(filtered[0].is_some());
        assert!(filtered[1].is_some());
        assert!(filtered[3].is_some());
        assert!(filtered[4].is_some());
    }

    #[test]
    fn test_activity_specific_config() {
        let hiking_classifications = vec![TrackClassification::Hiking];
        let running_classifications = vec![TrackClassification::TempoRun];
        let walking_classifications = vec![TrackClassification::Walk];

        let hiking_config = get_pace_filter_config(&hiking_classifications);
        let running_config = get_pace_filter_config(&running_classifications);
        let walking_config = get_pace_filter_config(&walking_classifications);

        // Hiking should have higher max pace (slower speeds)
        assert!(hiking_config.max_pace > running_config.max_pace);
        // Walking should have higher min pace (slower speeds)
        assert!(walking_config.min_pace > running_config.min_pace);
        // Hiking should have longer max time gaps
        assert!(hiking_config.max_time_gap > running_config.max_time_gap);
    }

    #[test]
    fn test_needs_smoothing() {
        // Stable data - shouldn't need smoothing
        let stable_data = vec![
            Some(5.0),
            Some(5.1),
            Some(4.9),
            Some(5.2),
            Some(4.8),
            Some(5.0),
            Some(5.1),
            Some(4.9),
            Some(5.2),
            Some(4.8),
        ];
        let config = PaceFilterConfig::default();
        assert!(!needs_smoothing(&stable_data, &config));

        // Noisy data - should need smoothing
        let noisy_data = vec![
            Some(5.0),
            Some(8.0),
            Some(3.0),
            Some(7.0),
            Some(2.0),
            Some(6.0),
            Some(4.0),
            Some(9.0),
            Some(1.0),
            Some(5.0),
        ];
        assert!(needs_smoothing(&noisy_data, &config));
    }

    #[test]
    fn test_full_filter_pipeline() {
        // Create test data with various issues but realistic for running (avoid cycling detection)
        let pace_data = vec![
            Some(5.0),  // Valid
            Some(1.5),  // Too fast for running (below min 2.0)
            Some(5.2),  // Valid
            Some(25.0), // Too slow for running (above max 15.0)
            Some(5.1),  // Valid
            Some(4.9),  // Valid
            None,       // No data
            Some(5.3),  // Valid
        ];

        // Use realistic running speeds (max < 30 km/h to avoid cycling detection)
        let speed_data = vec![
            Some(12.0),
            Some(24.0),
            Some(11.5),
            Some(2.4),
            Some(11.8),
            Some(12.2),
            None,
            Some(11.3),
        ];

        let time_diffs = vec![
            Some(10.0),
            Some(15.0),
            Some(12.0),
            Some(11.0),
            Some(13.0),
            Some(14.0),
            Some(16.0),
            Some(11.0),
        ];

        // Force explicit running classification to avoid cycling detection
        let classifications = vec![TrackClassification::TempoRun];

        let filtered = filter_pace_data(&pace_data, &speed_data, &time_diffs, &classifications);

        println!("Original pace data: {:?}", pace_data);
        println!("Filtered pace data: {:?}", filtered);

        // Basic range filtering should work:
        // The 1.5 min/km pace should be filtered (below running min of 2.0)
        // The 25.0 min/km pace should be filtered (above running max of 15.0)
        assert!(
            filtered[1].is_none(),
            "Fast pace (1.5 min/km) should be filtered for running"
        );
        assert!(
            filtered[3].is_none(),
            "Slow pace (25.0 min/km) should be filtered for running"
        );
        assert!(filtered[6].is_none(), "No data should remain None");

        // Some valid values should remain
        let valid_count = filtered.iter().filter(|p| p.is_some()).count();
        assert!(
            valid_count >= 2,
            "At least some valid values should remain, got {}",
            valid_count
        );
    }

    #[test]
    fn test_empty_data() {
        let empty_pace: Vec<Option<f64>> = Vec::new();
        let empty_speed: Vec<Option<f64>> = Vec::new();
        let empty_time: Vec<Option<f64>> = Vec::new();
        let classifications = vec![TrackClassification::TempoRun];

        let filtered = filter_pace_data(&empty_pace, &empty_speed, &empty_time, &classifications);
        assert!(filtered.is_empty());
    }

    #[test]
    fn test_single_point() {
        let pace_data = vec![Some(5.0)];
        let speed_data = vec![Some(12.0)];
        let time_diffs = vec![Some(10.0)];
        let classifications = vec![TrackClassification::TempoRun];

        let filtered = filter_pace_data(&pace_data, &speed_data, &time_diffs, &classifications);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0], Some(5.0));
    }

    #[test]
    fn test_gpx_integration_with_pace_filtering() {
        // Test the integration of pace filtering with GPX parsing
        let gpx_with_time = r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <name>Test Track with Pace Filtering</name>
    <trkseg>
      <trkpt lat="55.0" lon="37.0">
        <ele>200.0</ele>
        <time>2024-01-01T10:00:00Z</time>
      </trkpt>
      <trkpt lat="55.001" lon="37.0">
        <ele>201.0</ele>
        <time>2024-01-01T10:00:30Z</time>
      </trkpt>
      <trkpt lat="55.002" lon="37.0">
        <ele>202.0</ele>
        <time>2024-01-01T10:01:00Z</time>
      </trkpt>
      <trkpt lat="55.003" lon="37.0">
        <ele>203.0</ele>
        <time>2024-01-01T10:01:30Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>"#;

        // Parse the GPX and check that pace filtering was applied
        let parsed_data = crate::track_utils::gpx_parser::parse_gpx(gpx_with_time.as_bytes())
            .expect("Failed to parse GPX");

        // Verify that pace data is present
        assert!(
            parsed_data.pace_data.is_some(),
            "Pace data should be present"
        );

        let pace_data = parsed_data.pace_data.unwrap();
        // Should have 4 points, but first point has no pace (need 2 points to calculate)
        assert_eq!(pace_data.len(), 4);
        assert!(pace_data[0].is_none()); // First point has no pace

        // Verify that subsequent points have reasonable pace values (should be filtered)
        for pace in pace_data.iter().skip(1).filter_map(|p| *p) {
            // Pace should be reasonable (between 1-30 min/km for walking/running)
            assert!(
                (1.0..=30.0).contains(&pace),
                "Pace {} should be within reasonable range",
                pace
            );
        }

        // Verify that speed data is also present and filtered
        assert!(
            parsed_data.speed_data.is_some(),
            "Speed data should be present"
        );
        let speed_data = parsed_data.speed_data.unwrap();
        assert_eq!(speed_data.len(), 4);

        // Verify classifications were used for filtering
        assert!(
            !parsed_data.auto_classifications.is_empty(),
            "Auto classifications should be present"
        );
    }

    #[test]
    fn test_cycling_vs_running_filtering_differences() {
        // Test that different activity types get different filtering parameters
        let pace_data = vec![
            Some(2.0),  // Very fast pace (30 km/h) - good for cycling, might be too fast for running
            Some(4.0),  // Fast running pace (15 km/h)
            Some(8.0),  // Moderate pace (7.5 km/h)
            Some(25.0), // Very slow pace (2.4 km/h) - might be filtered for running (exceeds PACE_MAX_RUNNING=15.0)
        ];

        let speed_data = vec![Some(30.0), Some(15.0), Some(7.5), Some(2.4)];

        let time_diffs = vec![Some(10.0), Some(15.0), Some(12.0), Some(10.0)];

        // Test with running classification (stricter pace limits: max=15.0, min=2.0)
        let running_classifications = vec![TrackClassification::TempoRun];
        let running_filtered = filter_pace_data(
            &pace_data,
            &speed_data,
            &time_diffs,
            &running_classifications,
        );

        // Test with hiking classification (more lenient pace limits: max=30.0, min=3.0)
        let hiking_classifications = vec![TrackClassification::Hiking];
        let hiking_filtered = filter_pace_data(
            &pace_data,
            &speed_data,
            &time_diffs,
            &hiking_classifications,
        );

        // Print results for debugging
        println!("Pace data: {:?}", pace_data);
        println!("Running filtered: {:?}", running_filtered);
        println!("Hiking filtered: {:?}", hiking_filtered);

        let running_valid_count = running_filtered.iter().filter(|p| p.is_some()).count();
        let hiking_valid_count = hiking_filtered.iter().filter(|p| p.is_some()).count();

        println!(
            "Running valid count: {}, Hiking valid count: {}",
            running_valid_count, hiking_valid_count
        );

        // For this specific test case:
        // - pace 2.0: should pass running (>= min 2.0, <= max 15.0), might fail hiking (< min 3.0)
        // - pace 4.0: should pass both
        // - pace 8.0: should pass both
        // - pace 25.0: should fail running (> max 15.0), should pass hiking (<= max 30.0)

        // So we expect hiking to have different filtering characteristics, not necessarily more
        // Let's just verify they produce different results
        assert_ne!(
            running_filtered, hiking_filtered,
            "Running and hiking should filter differently"
        );

        // Verify specific expected behaviors:
        // Running should filter out pace 25.0 (too slow for running)
        // Hiking should filter out pace 2.0 (too fast for hiking, below min 3.0)
        assert!(
            running_filtered[3].is_none(),
            "Running should filter out very slow pace (25.0)"
        );
        assert!(
            hiking_filtered[0].is_none(),
            "Hiking should filter out very fast pace (2.0)"
        );
    }

    #[test]
    fn test_cycling_detection_and_filtering() {
        // Test cycling detection based on speed patterns
        let pace_data = vec![
            Some(1.5), // Very fast pace (40 km/h) - typical cycling
            Some(2.0), // Fast pace (30 km/h) - cycling
            Some(3.0), // Moderate pace (20 km/h) - cycling
            Some(1.0), // Very fast pace (60 km/h) - potential spike
        ];

        let speed_data = vec![Some(40.0), Some(30.0), Some(20.0), Some(60.0)];

        let time_diffs = vec![Some(10.0), Some(15.0), Some(12.0), Some(8.0)];

        // Test with no explicit classifications (should detect cycling)
        let no_classifications: Vec<TrackClassification> = vec![];
        let cycling_filtered =
            filter_pace_data(&pace_data, &speed_data, &time_diffs, &no_classifications);

        // Test with explicit running classification for comparison
        let running_classifications = vec![TrackClassification::TempoRun];
        let running_filtered = filter_pace_data(
            &pace_data,
            &speed_data,
            &time_diffs,
            &running_classifications,
        );

        println!("Cycling detected filtered: {:?}", cycling_filtered);
        println!("Running filtered: {:?}", running_filtered);

        // Cycling should be more tolerant of fast paces and high speed variations
        let cycling_valid_count = cycling_filtered.iter().filter(|p| p.is_some()).count();
        let running_valid_count = running_filtered.iter().filter(|p| p.is_some()).count();

        // Cycling detection should preserve more high-speed data points
        assert!(
            cycling_valid_count >= running_valid_count,
            "Cycling detection should preserve more high-speed data: cycling={}, running={}",
            cycling_valid_count,
            running_valid_count
        );
    }

    #[test]
    fn test_cycling_detection_heuristics() {
        // Test the cycling detection logic directly
        use super::detect_cycling_and_get_config;

        // High speed data should be detected as cycling
        let cycling_speeds = vec![Some(25.0), Some(30.0), Some(35.0), Some(20.0)];
        let cycling_config = detect_cycling_and_get_config(&cycling_speeds);
        assert!(
            cycling_config.is_some(),
            "High speeds should be detected as cycling"
        );

        // Low speed data should not be detected as cycling
        let walking_speeds = vec![Some(5.0), Some(4.0), Some(6.0), Some(3.0)];
        let walking_config = detect_cycling_and_get_config(&walking_speeds);
        assert!(
            walking_config.is_none(),
            "Low speeds should not be detected as cycling"
        );

        // Mixed but predominantly fast speeds should be detected as cycling
        let mixed_speeds = vec![Some(10.0), Some(25.0), Some(8.0), Some(30.0)];
        let mixed_config = detect_cycling_and_get_config(&mixed_speeds);
        assert!(
            mixed_config.is_some(),
            "Predominantly fast speeds should be detected as cycling"
        );
    }
}
