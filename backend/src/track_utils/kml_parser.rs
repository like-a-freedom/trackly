// KML parser module for trackly
// Extracted from track_utils.rs for modularization
// TODO: switch to https://github.com/georust/kml

use crate::models::ParsedTrackData;
use crate::track_utils::elevation::{
    calculate_elevation_metrics, extract_elevations_from_track_points, has_elevation_data,
};
use crate::track_utils::geometry::haversine_distance;
use chrono::{DateTime, Utc};
use kml::types::{Element, Geometry, Kml};
use sha2::Digest;

/// Parses a KML file, returns ParsedTrackData
pub fn parse_kml(bytes: &[u8]) -> Result<ParsedTrackData, String> {
    let s = std::str::from_utf8(bytes).map_err(|e| format!("utf8 error: {e}"))?;
    let kml_doc: Kml = s.parse().map_err(|e| format!("kml parse error: {e}"))?;

    let mut points = Vec::new();
    let mut elevation_profile_data = Vec::new();
    let mut time_data = Vec::new();
    let mut total_elevation_gain = 0.0;
    let mut total_elevation_loss = 0.0;
    let mut last_elevation: Option<f64> = None;

    fn update_elevation_stats(
        current_elevation: Option<f64>,
        last_elevation: &mut Option<f64>,
        total_elevation_gain: &mut f64,
        total_elevation_loss: &mut f64,
    ) {
        if let (Some(last_ele), Some(curr_ele)) = (*last_elevation, current_elevation) {
            let diff = curr_ele - last_ele;
            if diff > 0.0 {
                *total_elevation_gain += diff;
            } else {
                *total_elevation_loss += diff.abs();
            }
        }
        *last_elevation = current_elevation;
    }

    fn extract_coordinates_from_geometry(
        geom: &Geometry,
        points: &mut Vec<(f64, f64)>,
        elevations: &mut Vec<Option<f64>>,
        last_elevation: &mut Option<f64>,
        total_elevation_gain: &mut f64,
        total_elevation_loss: &mut f64,
    ) {
        match geom {
            Geometry::Point(p) => {
                let coord = &p.coord;
                points.push((coord.y, coord.x));
                elevations.push(coord.z);
                update_elevation_stats(
                    coord.z,
                    last_elevation,
                    total_elevation_gain,
                    total_elevation_loss,
                );
            }
            Geometry::LineString(ls) => {
                for coord in &ls.coords {
                    points.push((coord.y, coord.x));
                    elevations.push(coord.z);
                    update_elevation_stats(
                        coord.z,
                        last_elevation,
                        total_elevation_gain,
                        total_elevation_loss,
                    );
                }
            }
            Geometry::LinearRing(lr) => {
                for coord in &lr.coords {
                    points.push((coord.y, coord.x));
                    elevations.push(coord.z);
                    update_elevation_stats(
                        coord.z,
                        last_elevation,
                        total_elevation_gain,
                        total_elevation_loss,
                    );
                }
            }
            Geometry::Polygon(poly) => {
                let outer_ring = &poly.outer;
                for coord in &outer_ring.coords {
                    points.push((coord.y, coord.x));
                    elevations.push(coord.z);
                    update_elevation_stats(
                        coord.z,
                        last_elevation,
                        total_elevation_gain,
                        total_elevation_loss,
                    );
                }
                // Optionally process inner as well
            }
            Geometry::MultiGeometry(mg) => {
                for g in &mg.geometries {
                    extract_coordinates_from_geometry(
                        g,
                        points,
                        elevations,
                        last_elevation,
                        total_elevation_gain,
                        total_elevation_loss,
                    );
                }
            }
            _ => {}
        }
    }

    fn extract_track_data(
        element: &Element,
        points: &mut Vec<(f64, f64)>,
        elevations: &mut Vec<Option<f64>>,
        time_data: &mut Vec<Option<DateTime<Utc>>>,
        last_elevation: &mut Option<f64>,
        total_elevation_gain: &mut f64,
        total_elevation_loss: &mut f64,
    ) {
        let mut whens = Vec::new();
        let mut coords = Vec::new();

        for child in &element.children {
            match child.name.as_str() {
                "when" => {
                    if let Some(content) = &child.content {
                        if let Ok(dt) = DateTime::parse_from_rfc3339(content) {
                            whens.push(Some(dt.with_timezone(&Utc)));
                        } else {
                            whens.push(None);
                        }
                    }
                }
                "coord" | "gx:coord" => {
                    if let Some(content) = &child.content {
                        let parts: Vec<&str> = content.split_whitespace().collect();
                        if parts.len() >= 2 {
                            if let (Ok(lon), Ok(lat)) =
                                (parts[0].parse::<f64>(), parts[1].parse::<f64>())
                            {
                                let elevation = if parts.len() >= 3 {
                                    parts[2].parse::<f64>().ok()
                                } else {
                                    None
                                };
                                coords.push((lat, lon, elevation));
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        // Assume whens and coords are in order
        let len = whens.len().max(coords.len());
        for i in 0..len {
            let time = whens.get(i).cloned().flatten();
            let coord = coords.get(i);

            if let Some((lat, lon, elevation)) = coord {
                points.push((*lat, *lon));
                elevations.push(*elevation);
                time_data.push(time);
                update_elevation_stats(
                    *elevation,
                    last_elevation,
                    total_elevation_gain,
                    total_elevation_loss,
                );
            } else {
                time_data.push(time);
            }
        }
    }

    fn extract_kml_elements(
        kml_element: &Kml,
        points: &mut Vec<(f64, f64)>,
        elevations: &mut Vec<Option<f64>>,
        time_data: &mut Vec<Option<DateTime<Utc>>>,
        last_elevation: &mut Option<f64>,
        total_elevation_gain: &mut f64,
        total_elevation_loss: &mut f64,
    ) {
        match kml_element {
            Kml::Placemark(pm) => {
                if let Some(geom) = &pm.geometry {
                    extract_coordinates_from_geometry(
                        geom,
                        points,
                        elevations,
                        last_elevation,
                        total_elevation_gain,
                        total_elevation_loss,
                    );
                }
                // Also process any children inside Placemark (e.g., Track)
                for child in &pm.children {
                    if child.name == "Track" {
                        extract_track_data(
                            child,
                            points,
                            elevations,
                            time_data,
                            last_elevation,
                            total_elevation_gain,
                            total_elevation_loss,
                        );
                    }
                }
            }
            Kml::Document { elements, .. } => {
                for el in elements {
                    extract_kml_elements(
                        el,
                        points,
                        elevations,
                        time_data,
                        last_elevation,
                        total_elevation_gain,
                        total_elevation_loss,
                    );
                }
            }
            Kml::Folder(folder) => {
                for el in &folder.elements {
                    extract_kml_elements(
                        el,
                        points,
                        elevations,
                        time_data,
                        last_elevation,
                        total_elevation_gain,
                        total_elevation_loss,
                    );
                }
            }
            Kml::Element(element) => {
                if element.name == "Track" {
                    extract_track_data(
                        element,
                        points,
                        elevations,
                        time_data,
                        last_elevation,
                        total_elevation_gain,
                        total_elevation_loss,
                    );
                }
                // For other elements, recursively process children if they are known KML elements
                // But since Element is for unknown, we skip for now
            }
            _ => {}
        }
    }

    // Handle KmlDocument wrapper
    match &kml_doc {
        Kml::KmlDocument(doc) => {
            for element in &doc.elements {
                extract_kml_elements(
                    element,
                    &mut points,
                    &mut elevation_profile_data,
                    &mut time_data,
                    &mut last_elevation,
                    &mut total_elevation_gain,
                    &mut total_elevation_loss,
                );
            }
        }
        _ => {
            extract_kml_elements(
                &kml_doc,
                &mut points,
                &mut elevation_profile_data,
                &mut time_data,
                &mut last_elevation,
                &mut total_elevation_gain,
                &mut total_elevation_loss,
            );
        }
    }

    if points.is_empty() {
        return Err("No points in KML".to_string());
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
        let mut hasher = sha2::Sha256::new();
        hasher.update(bytes);
        format!("{:x}", hasher.finalize())
    };

    let final_elevation_gain = if !points.is_empty() {
        Some(total_elevation_gain)
    } else {
        None
    };
    let final_elevation_loss = if !points.is_empty() {
        Some(total_elevation_loss)
    } else {
        None
    };
    let final_elevation_profile = if elevation_profile_data.iter().any(|e| e.is_some()) {
        Some(elevation_profile_data.clone())
    } else {
        None
    };

    let final_time_data = if time_data.iter().any(|t| t.is_some()) {
        Some(time_data)
    } else {
        None
    };

    // Perform automatic track classification
    use crate::track_classifier::{classify_track, TrackMetrics};
    let metrics = TrackMetrics {
        length_km,
        avg_speed: None,
        moving_avg_speed: None,
        elevation_gain: final_elevation_gain,
        elevation_loss: final_elevation_loss,
        moving_time: None,
        duration_seconds: None,
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

        calculate_slope_metrics(&points, elevation_profile, "KML Track")
    } else {
        Default::default()
    };

    Ok(ParsedTrackData {
        geom_geojson,
        length_km,
        elevation_profile: final_elevation_profile,
        hr_data: None,   // KML does not typically contain HR data
        temp_data: None, // KML does not typically contain temperature data
        time_data: final_time_data,
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
        avg_speed: None,
        avg_hr: None, // KML does not typically contain HR data
        hr_min: None,
        hr_max: None,
        moving_time: None,
        pause_time: None,
        moving_avg_speed: None,
        moving_avg_pace: None,
        duration_seconds: None,
        hash,
        recorded_at: None,
        auto_classifications,  // Add automatic classifications
        speed_data: None,      // KML typically doesn't contain speed data
        pace_data: None,       // KML typically doesn't contain pace data
        waypoints: Vec::new(), // KML waypoints support can be added later
    })
}
