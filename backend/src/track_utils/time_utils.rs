// Time utilities for trackly
// Extracted from track_utils.rs for modularization

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use tracing::warn;

/// Try to parse GPX <time> string with multiple formats
pub fn parse_gpx_time(s: &str) -> Option<DateTime<Utc>> {
    let formats = [
        "%Y-%m-%dT%H:%M:%S%.fZ", // 2023-05-22T17:56:42.123Z
        "%Y-%m-%dT%H:%M:%SZ",    // 2023-05-22T17:56:42Z
        "%Y-%m-%dT%H:%M:%S%.f",  // 2023-05-22T17:56:42.123
        "%Y-%m-%dT%H:%M:%S",     // 2023-05-22T17:56:42
    ];
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Utc));
    }
    for fmt in formats.iter() {
        if let Ok(dt) = NaiveDateTime::parse_from_str(s, fmt) {
            return Some(Utc.from_utc_datetime(&dt));
        }
    }
    warn!("Failed to parse GPX <time>: {}", s);
    None
}

/// Calculate track duration from GPX time points
pub fn calculate_track_duration(time_points: &[Option<DateTime<Utc>>]) -> Option<i32> {
    let valid_times: Vec<DateTime<Utc>> = time_points.iter().filter_map(|&t| t).collect();
    if valid_times.len() < 2 {
        return None;
    }
    let mut sorted_times = valid_times;
    sorted_times.sort();
    let start_time = sorted_times.first()?;
    let end_time = sorted_times.last()?;
    let duration = end_time.signed_duration_since(*start_time);
    Some(duration.num_seconds() as i32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_parse_gpx_time_formats() {
        let dt = parse_gpx_time("2023-05-22T17:56:42Z").unwrap();
        // Use the actual parsed value for assertion to avoid timezone issues
        assert_eq!(dt.timestamp(), 1684778202); // 2023-05-22T17:56:42Z UTC
        let dt2 = parse_gpx_time("2023-05-22T17:56:42.123Z").unwrap();
        assert_eq!(dt2.timestamp(), 1684778202); // Ignore milliseconds for this test
        assert!(parse_gpx_time("not-a-date").is_none());
    }

    #[test]
    fn test_calculate_track_duration() {
        let t1 = chrono::Utc.with_ymd_and_hms(2023, 5, 22, 10, 0, 0).unwrap();
        let t2 = chrono::Utc
            .with_ymd_and_hms(2023, 5, 22, 10, 30, 0)
            .unwrap();
        let t3 = chrono::Utc.with_ymd_and_hms(2023, 5, 22, 11, 0, 0).unwrap();
        let times = vec![Some(t1), Some(t2), Some(t3)];
        assert_eq!(calculate_track_duration(&times), Some(3600));
        let times_short = vec![Some(t1)];
        assert_eq!(calculate_track_duration(&times_short), None);
    }
}
