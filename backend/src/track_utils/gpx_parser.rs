// GPX parser module for trackly
// TODO: maybe switch to https://github.com/georust/gpx

use crate::models::ParsedTrackData;
use crate::track_utils::elevation::{
    calculate_elevation_metrics, extract_elevations_from_track_points, has_elevation_data,
};
use crate::track_utils::geometry::haversine_distance;
use crate::track_utils::time_utils::parse_gpx_time;
use quick_xml::events::Event;
use quick_xml::Reader;
use sha2::{Digest, Sha256};
use tracing::{debug, info};

/// Parses GPX file, returns ParsedTrackData
pub fn parse_gpx(bytes: &[u8]) -> Result<ParsedTrackData, String> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();

    let mut points = Vec::new();
    let mut elevation_profile_data = Vec::new();
    let mut hr_data_points = Vec::new();
    let mut temp_data_points = Vec::new();
    let mut time_points = Vec::new(); // Add time points collection
    let mut total_elevation_gain = 0.0;
    let mut total_elevation_loss = 0.0;
    let mut last_elevation: Option<f64> = None;

    // State variables
    let mut in_trkpt = false;
    let mut in_rtept = false;
    let mut in_extensions = false;
    let mut in_trackpoint_extension = false;
    let mut lat: Option<f64> = None;
    let mut lon: Option<f64> = None;
    let mut ele: Option<f64> = None;
    let mut hr: Option<i32> = None;
    let mut temp: Option<f64> = None;
    let mut point_time: Option<String> = None; // Time for current point
    let mut recorded_at: Option<String> = None;
    let mut element_stack: Vec<String> = Vec::new();
    let mut capture_text = false;
    let mut text_target: Option<String> = None;
    let mut found_metadata_time = false; // For fallback: store points from rtept if no trkpt found
    let mut rte_points = Vec::new();
    let mut rte_elevation_profile_data = Vec::new();
    let mut rte_hr_data_points = Vec::new();
    let mut rte_temp_data_points = Vec::new();
    let mut rte_time_points = Vec::new(); // Add route time points collection
    let mut rte_total_elevation_gain = 0.0;
    let mut rte_total_elevation_loss = 0.0;
    let mut rte_last_elevation: Option<f64> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let tag_stripped = tag.split(':').next_back().unwrap_or(&tag);
                element_stack.push(tag_stripped.to_string());
                match tag_stripped {
                    "metadata" => {}
                    "trkpt" => {
                        in_trkpt = true;
                        lat = e.attributes().find_map(|a| {
                            a.ok().and_then(|attr| {
                                if attr.key.as_ref() == b"lat" {
                                    std::str::from_utf8(&attr.value).ok()?.parse::<f64>().ok()
                                } else {
                                    None
                                }
                            })
                        });
                        lon = e.attributes().find_map(|a| {
                            a.ok().and_then(|attr| {
                                if attr.key.as_ref() == b"lon" {
                                    std::str::from_utf8(&attr.value).ok()?.parse::<f64>().ok()
                                } else {
                                    None
                                }
                            })
                        });
                        ele = None;
                        hr = None;
                        temp = None;
                    }
                    "rtept" => {
                        in_rtept = true;
                        lat = e.attributes().find_map(|a| {
                            a.ok().and_then(|attr| {
                                if attr.key.as_ref() == b"lat" {
                                    std::str::from_utf8(&attr.value).ok()?.parse::<f64>().ok()
                                } else {
                                    None
                                }
                            })
                        });
                        lon = e.attributes().find_map(|a| {
                            a.ok().and_then(|attr| {
                                if attr.key.as_ref() == b"lon" {
                                    std::str::from_utf8(&attr.value).ok()?.parse::<f64>().ok()
                                } else {
                                    None
                                }
                            })
                        });
                        ele = None;
                        hr = None;
                        temp = None;
                    }
                    "ele" => {
                        if in_trkpt || in_rtept {
                            capture_text = true;
                            text_target = Some("ele".to_string());
                        }
                    }
                    "extensions" => {
                        if in_trkpt || in_rtept {
                            in_extensions = true;
                        }
                    }
                    "TrackPointExtension" => {
                        if in_extensions {
                            in_trackpoint_extension = true;
                        }
                    }
                    "hr" | "heartrate" => {
                        if (!in_extensions || in_trackpoint_extension) && (in_rtept || in_trkpt) {
                            capture_text = true;
                            text_target = Some("hr".to_string());
                        }
                    }
                    "atemp" | "temp" | "temperature" => {
                        if (!in_extensions || in_trackpoint_extension) && (in_rtept || in_trkpt) {
                            capture_text = true;
                            text_target = Some("temp".to_string());
                        }
                    }
                    "time" => {
                        // If inside <metadata>, prefer this as recorded_at
                        if element_stack.len() >= 2
                            && element_stack[element_stack.len() - 2] == "metadata"
                            && !found_metadata_time
                        {
                            capture_text = true;
                            text_target = Some("metadata_time".to_string());
                        } else if in_trkpt || in_rtept {
                            // Capture time for individual track/route points
                            capture_text = true;
                            text_target = Some("point_time".to_string());

                            // Also use as fallback recorded_at if not found in metadata
                            if recorded_at.is_none() && !found_metadata_time {
                                text_target = Some("trkpt_time".to_string());
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                if capture_text {
                    if let Some(target) = &text_target {
                        match target.as_str() {
                            "ele" => {
                                let text = std::str::from_utf8(&e).unwrap_or_default();
                                ele = text.parse::<f64>().ok();
                            }
                            "hr" => {
                                let text = std::str::from_utf8(&e).unwrap_or_default();
                                hr = text.parse::<i32>().ok();
                            }
                            "temp" => {
                                let text = std::str::from_utf8(&e).unwrap_or_default();
                                temp = text.parse::<f64>().ok();
                            }
                            "metadata_time" => {
                                if !found_metadata_time {
                                    let text = std::str::from_utf8(&e).unwrap_or_default();
                                    recorded_at = Some(text.to_string());
                                    found_metadata_time = true;
                                }
                            }
                            "point_time" => {
                                // Capture time for individual points
                                let text = std::str::from_utf8(&e).unwrap_or_default();
                                point_time = Some(text.to_string());
                            }
                            "trkpt_time" => {
                                // Use as both point time and fallback recorded_at
                                let text = std::str::from_utf8(&e).unwrap_or_default();
                                let time_str = text.to_string();
                                point_time = Some(time_str.clone());
                                if recorded_at.is_none() && !found_metadata_time {
                                    recorded_at = Some(time_str);
                                }
                            }
                            _ => {}
                        }
                    }
                    capture_text = false;
                    text_target = None;
                }
            }
            Ok(Event::End(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let tag_stripped = tag.split(':').next_back().unwrap_or(&tag);
                if let Some(last) = element_stack.pop() {
                    // Defensive: ensure stack matches
                    if last != tag_stripped {
                        // Mismatched tag, ignore
                    }
                }
                match tag_stripped {
                    "trkpt" => {
                        if let (Some(lat), Some(lon)) = (lat, lon) {
                            points.push((lat, lon));
                            elevation_profile_data.push(ele);
                            hr_data_points.push(hr);
                            temp_data_points.push(temp);
                            // Parse and add point time
                            let parsed_time = point_time.as_ref().and_then(|t| parse_gpx_time(t));
                            time_points.push(parsed_time);
                            if let (Some(last_ele), Some(curr_ele)) = (last_elevation, ele) {
                                let diff = curr_ele - last_ele;
                                if diff > 0.0 {
                                    total_elevation_gain += diff;
                                } else {
                                    total_elevation_loss += diff.abs();
                                }
                            }
                            last_elevation = ele;
                        }
                        in_trkpt = false;
                        lat = None;
                        lon = None;
                        ele = None;
                        hr = None;
                        temp = None;
                        point_time = None; // Reset point time
                        in_extensions = false;
                        in_trackpoint_extension = false;
                    }
                    "rtept" => {
                        if let (Some(lat), Some(lon)) = (lat, lon) {
                            rte_points.push((lat, lon));
                            rte_elevation_profile_data.push(ele);
                            rte_hr_data_points.push(hr);
                            rte_temp_data_points.push(temp);
                            // Parse and add route point time
                            let parsed_time = point_time.as_ref().and_then(|t| parse_gpx_time(t));
                            rte_time_points.push(parsed_time);
                            if let (Some(last_ele), Some(curr_ele)) = (rte_last_elevation, ele) {
                                let diff = curr_ele - last_ele;
                                if diff > 0.0 {
                                    rte_total_elevation_gain += diff;
                                } else {
                                    rte_total_elevation_loss += diff.abs();
                                }
                            }
                            rte_last_elevation = ele;
                        }
                        in_rtept = false;
                        lat = None;
                        lon = None;
                        ele = None;
                        hr = None;
                        temp = None;
                        point_time = None; // Reset point time
                        in_extensions = false;
                        in_trackpoint_extension = false;
                    }
                    "extensions" => {
                        in_extensions = false;
                        in_trackpoint_extension = false;
                    }
                    "TrackPointExtension" => {
                        in_trackpoint_extension = false;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("Error parsing GPX: {e}")),
            _ => {}
        }
        buf.clear();
    }

    // If no track points, but route points exist, use them
    let (
        points,
        elevation_profile_data,
        hr_data_points,
        temp_data_points,
        time_points,
        total_elevation_gain,
        total_elevation_loss,
    ) = if points.is_empty() && !rte_points.is_empty() {
        (
            rte_points,
            rte_elevation_profile_data,
            rte_hr_data_points,
            rte_temp_data_points,
            rte_time_points,
            rte_total_elevation_gain,
            rte_total_elevation_loss,
        )
    } else {
        (
            points,
            elevation_profile_data,
            hr_data_points,
            temp_data_points,
            time_points,
            total_elevation_gain,
            total_elevation_loss,
        )
    };

    if points.is_empty() {
        return Err("No points in GPX".to_string());
    }

    fn points_to_geojson(points: &[(f64, f64)]) -> serde_json::Value {
        serde_json::json!({
            "type": "LineString",
            "coordinates": points.iter().map(|(lat, lon)| vec![*lon, *lat]).collect::<Vec<_>>()
        })
    }

    let geom_geojson = points_to_geojson(&points);

    let mut length_km = 0.0;
    for w in points.windows(2) {
        length_km += haversine_distance(w[0], w[1]);
    }
    length_km /= 1000.0;

    let hash = {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        format!("{:x}", hasher.finalize())
    };

    let recorded_at = if let Some(time_str) = recorded_at {
        parse_gpx_time(&time_str)
    } else {
        None
    };

    let final_elevation_gain = if !points.is_empty() {
        let gain = if total_elevation_gain > 0.0 {
            total_elevation_gain
        } else {
            0.0
        };
        info!(
            "GPX parsed elevation_gain: {:.1}m from {} elevation points",
            gain,
            elevation_profile_data
                .iter()
                .filter(|e| e.is_some())
                .count()
        );
        Some(gain)
    } else {
        info!("GPX has no elevation data - no points found");
        None
    };
    let final_elevation_loss = if !points.is_empty() {
        let loss = if total_elevation_loss > 0.0 {
            total_elevation_loss
        } else {
            0.0
        };
        info!("GPX parsed elevation_loss: {:.1}m", loss);
        Some(loss)
    } else {
        None
    };
    let final_elevation_profile = if elevation_profile_data.iter().any(|e| e.is_some()) {
        Some(elevation_profile_data.clone())
    } else {
        None
    };

    let final_hr_data = if hr_data_points.iter().any(|hr| hr.is_some()) {
        Some(hr_data_points)
    } else {
        None
    };

    // Calculate moving/pause time and moving speed/pace
    // Also calculate point-by-point speed and pace data
    let mut total_moving_secs: f64 = 0.0;
    let mut total_pause_secs: f64 = 0.0;
    let mut moving_distance: f64 = 0.0;
    let mut speed_data_points: Vec<Option<f64>> = Vec::new();
    let mut pace_data_points: Vec<Option<f64>> = Vec::new();
    let mut time_diff_data: Vec<Option<f64>> = Vec::new();

    if points.len() > 1 && time_points.len() == points.len() {
        // First point has no speed/pace since we need two points to calculate
        speed_data_points.push(None);
        pace_data_points.push(None);
        time_diff_data.push(None);
        
        for i in 1..points.len() {
            if let (Some(time1), Some(time2)) = (&time_points[i - 1], &time_points[i]) {
                let time_diff_secs = (time2.timestamp() - time1.timestamp()) as f64;
                time_diff_data.push(Some(time_diff_secs));
                
                if time_diff_secs > 0.0 && time_diff_secs < 3600.0 {
                    // Sanity check: < 1 hour between points
                    let dist_m = haversine_distance(
                        (points[i - 1].0, points[i - 1].1), // (lat1, lon1)
                        (points[i].0, points[i].1),         // (lat2, lon2)
                    );
                    let speed_kmh = (dist_m / 1000.0) / (time_diff_secs / 3600.0);

                    // Store speed and calculate pace (basic filtering still applied)
                    if speed_kmh > 0.0 && speed_kmh < 200.0 {
                        // Sanity check: reasonable speed range
                        speed_data_points.push(Some(speed_kmh));
                        pace_data_points.push(Some(60.0 / speed_kmh)); // min/km
                    } else {
                        speed_data_points.push(None);
                        pace_data_points.push(None);
                    }

                    // Consider moving if speed > 1 km/h
                    if speed_kmh > 1.0 {
                        total_moving_secs += time_diff_secs;
                        moving_distance += dist_m;
                    } else {
                        total_pause_secs += time_diff_secs;
                    }
                } else {
                    speed_data_points.push(None);
                    pace_data_points.push(None);
                }
            } else {
                speed_data_points.push(None);
                pace_data_points.push(None);
                time_diff_data.push(None);
            }
        }
    }

    // Calculate duration_seconds (total duration) before moving time_points
    let duration_seconds = crate::track_utils::time_utils::calculate_track_duration(&time_points);

    let final_time_data = if time_points.iter().any(|t| t.is_some()) {
        Some(time_points)
    } else {
        None
    };

    let avg_hr_value = if let Some(hr_values) = &final_hr_data {
        let valid_hrs: Vec<i32> = hr_values.iter().filter_map(|&hr| hr).collect();
        if !valid_hrs.is_empty() {
            Some((valid_hrs.iter().sum::<i32>() as f64 / valid_hrs.len() as f64) as i32)
        } else {
            None
        }
    } else {
        None
    };

    // --- Moving time, pause time, moving speed/pace ---
    let mut moving_time: Option<i32> = None;
    let mut pause_time: Option<i32> = None;
    let mut moving_avg_speed: Option<f64> = None;
    let mut moving_avg_pace: Option<f64> = None;
    let mut hr_min: Option<i32> = None;
    let mut hr_max: Option<i32> = None;

    // Calculate HR min/max
    if let Some(hr_values) = &final_hr_data {
        let valid_hrs: Vec<i32> = hr_values.iter().filter_map(|&hr| hr).collect();
        if !valid_hrs.is_empty() {
            hr_min = Some(*valid_hrs.iter().min().unwrap());
            hr_max = Some(*valid_hrs.iter().max().unwrap());
        }
    }

    if total_moving_secs > 0.0 {
        moving_time = Some(total_moving_secs.round() as i32);
        moving_avg_speed = Some((moving_distance / 1000.0) / (total_moving_secs / 3600.0)); // km/h
        moving_avg_pace = Some(if moving_avg_speed.unwrap() > 0.0 {
            60.0 / moving_avg_speed.unwrap() // min/km
        } else {
            0.0
        });
    }
    if total_pause_secs > 0.0 {
        pause_time = Some(total_pause_secs.round() as i32);
    }

    // Calculate avg_speed (average speed over total duration)
    let avg_speed = crate::track_utils::metrics::avg_speed_kmh(length_km, duration_seconds);

    // Perform automatic track classification
    use crate::track_classifier::{classify_track, TrackMetrics};
    let metrics = TrackMetrics {
        length_km,
        avg_speed,
        moving_avg_speed,
        elevation_gain: final_elevation_gain,
        elevation_loss: final_elevation_loss,
        moving_time,
        duration_seconds,
    };
    let classifications = classify_track(&metrics);
    let auto_classifications: Vec<String> = classifications.iter().map(|c| c.to_string()).collect();

    // Calculate new elevation metrics using the elevation module
    let track_points_with_elevation: Vec<(f64, f64, Option<f64>)> = points
        .iter()
        .zip(elevation_profile_data.iter())
        .map(|((lat, lon), elevation)| (*lat, *lon, *elevation))
        .collect();

    let elevation_metrics = if has_elevation_data(&track_points_with_elevation) {
        let elevations = extract_elevations_from_track_points(&track_points_with_elevation);
        calculate_elevation_metrics(&elevations)
    } else {
        Default::default()
    };

    // Calculate slope metrics if elevation data is available
    let slope_result = if let Some(elevation_profile) = &final_elevation_profile {
        use crate::track_utils::slope::calculate_slope_metrics;

        calculate_slope_metrics(&points, elevation_profile, "GPX Track")
    } else {
        Default::default()
    };

    // Apply adaptive pace filtering based on track classification
    let filtered_pace_data = if !pace_data_points.is_empty() && pace_data_points.iter().any(|p| p.is_some()) {
        use crate::track_utils::pace_filter::filter_pace_data;
        debug!("Applying adaptive pace filtering with {} classifications", classifications.len());
        filter_pace_data(&pace_data_points, &speed_data_points, &time_diff_data, &classifications)
    } else {
        pace_data_points
    };

    // Create final speed and pace data arrays if we have time data
    let final_speed_data = if !speed_data_points.is_empty() && speed_data_points.iter().any(|s| s.is_some()) {
        Some(speed_data_points)
    } else {
        None
    };
    
    let final_pace_data = if !filtered_pace_data.is_empty() && filtered_pace_data.iter().any(|p| p.is_some()) {
        Some(filtered_pace_data)
    } else {
        None
    };

    Ok(ParsedTrackData {
        geom_geojson,
        length_km,
        elevation_profile: final_elevation_profile,
        hr_data: final_hr_data, // Store raw HR data points
        temp_data: if temp_data_points.is_empty() || temp_data_points.iter().all(|&t| t.is_none()) {
            None
        } else {
            Some(temp_data_points)
        },
        time_data: final_time_data, // Store raw time data points
        // New elevation fields from elevation module
        elevation_gain: elevation_metrics.elevation_gain,
        elevation_loss: elevation_metrics.elevation_loss,
        elevation_min: elevation_metrics.elevation_min,
        elevation_max: elevation_metrics.elevation_max,
        // Slope fields from universal calculator
        slope_min: slope_result.slope_min,
        slope_max: slope_result.slope_max,
        slope_avg: slope_result.slope_avg,
        slope_histogram: slope_result.slope_histogram,
        slope_segments: slope_result.slope_segments,
        avg_speed,            // Calculated average speed
        avg_hr: avg_hr_value, // Calculated average HR
        hr_min,
        hr_max,
        moving_time,
        pause_time,
        moving_avg_speed,
        moving_avg_pace,
        duration_seconds, // Calculated duration
        hash,
        recorded_at,
        auto_classifications, // Add automatic classifications
        speed_data: final_speed_data, // Add calculated speed data
        pace_data: final_pace_data, // Add calculated pace data
    })
}
