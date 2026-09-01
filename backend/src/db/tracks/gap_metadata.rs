use crate::models::*;
use crate::track_utils::haversine_distance;
use chrono::{DateTime, Utc};

/// Helper function to simplify chart data (elevation, HR, temp) based on mode
pub fn simplify_chart_data(
    data: Option<serde_json::Value>,
    mode: TrackMode,
    _zoom: f64,
) -> Option<serde_json::Value> {
    match data {
        Some(json_data) => {
            if let Some(array) = json_data.as_array() {
                let max_points = match mode {
                    TrackMode::Overview => 500, // For overview mode, limit chart data aggressively
                    TrackMode::Detail => 1500, // For detail mode, allow more points but still limit for performance
                };

                if array.len() > max_points {
                    // Simple uniform sampling for chart data
                    let step = array.len() / max_points;
                    let simplified: Vec<serde_json::Value> = array
                        .iter()
                        .step_by(step.max(1))
                        .take(max_points)
                        .cloned()
                        .collect();

                    Some(serde_json::Value::Array(simplified))
                } else {
                    Some(json_data)
                }
            } else {
                Some(json_data)
            }
        }
        None => None,
    }
}

const PAUSE_GAP_THRESHOLD_SECS: i64 = 180; // 3 minutes without samples marks a pause gap

pub fn parse_time_points(time_data: &serde_json::Value) -> Vec<Option<DateTime<Utc>>> {
    let mut result = Vec::new();
    let array = match time_data.as_array() {
        Some(arr) => arr,
        None => return result,
    };

    for value in array {
        if value.is_null() {
            result.push(None);
            continue;
        }

        if let Some(s) = value.as_str()
            && let Ok(dt) = DateTime::parse_from_rfc3339(s)
        {
            result.push(Some(dt.with_timezone(&Utc)));
            continue;
        }

        result.push(None);
    }

    result
}

pub fn compute_gap_metadata(
    segments_opt: Option<&[Vec<(f64, f64)>]>,
    time_data_raw: Option<&serde_json::Value>,
) -> (Option<Vec<GapInfo>>, Option<Vec<GapInfo>>) {
    let mut segment_gaps: Vec<GapInfo> = Vec::new();
    let mut pause_gaps: Vec<GapInfo> = Vec::new();

    if let Some(segments) = segments_opt {
        if segments.len() > 1 {
            for (idx, window) in segments.windows(2).enumerate() {
                let from = window[0].last().copied();
                let to = window[1].first().copied();
                if let (Some(from_pt), Some(to_pt)) = (from, to) {
                    let distance_m = haversine_distance(from_pt, to_pt);
                    segment_gaps.push(GapInfo {
                        kind: "segment".to_string(),
                        from: GapEndpoint {
                            lat: from_pt.0,
                            lon: from_pt.1,
                            segment_index: idx,
                            point_index: window[0].len().saturating_sub(1),
                        },
                        to: GapEndpoint {
                            lat: to_pt.0,
                            lon: to_pt.1,
                            segment_index: idx + 1,
                            point_index: 0,
                        },
                        distance_m,
                        duration_seconds: None,
                    });
                }
            }
        }

        if segments.len() == 1
            && let Some(time_json) = time_data_raw
        {
            let times = parse_time_points(time_json);
            let coords = &segments[0];
            if coords.len() == times.len() && coords.len() > 1 {
                for i in 1..coords.len() {
                    if let (Some(t1), Some(t2)) = (times[i - 1], times[i]) {
                        let delta = (t2 - t1).num_seconds();
                        if delta >= PAUSE_GAP_THRESHOLD_SECS {
                            let distance_m = haversine_distance(coords[i - 1], coords[i]);
                            pause_gaps.push(GapInfo {
                                kind: "pause".to_string(),
                                from: GapEndpoint {
                                    lat: coords[i - 1].0,
                                    lon: coords[i - 1].1,
                                    segment_index: 0,
                                    point_index: i - 1,
                                },
                                to: GapEndpoint {
                                    lat: coords[i].0,
                                    lon: coords[i].1,
                                    segment_index: 0,
                                    point_index: i,
                                },
                                distance_m,
                                duration_seconds: Some(delta),
                            });
                        }
                    }
                }
            }
        }
    }

    (
        if segment_gaps.is_empty() {
            None
        } else {
            Some(segment_gaps)
        },
        if pause_gaps.is_empty() {
            None
        } else {
            Some(pause_gaps)
        },
    )
}
