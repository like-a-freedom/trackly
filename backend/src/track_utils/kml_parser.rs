// KML parser module for trackly
// Extracted from track_utils.rs for modularization

use crate::models::ParsedTrackData;
use crate::track_utils::geometry::haversine_distance;
use kml::types::{Geometry, Kml};
use sha2::Digest;
use std::str::FromStr;

/// Parses a KML file, returns ParsedTrackData
pub fn parse_kml(bytes: &[u8]) -> Result<ParsedTrackData, String> {
    let s = std::str::from_utf8(bytes).map_err(|e| format!("utf8 error: {e}"))?;
    let kml_doc = Kml::from_str(s).map_err(|e| format!("kml parse error: {e}"))?;

    let mut points = Vec::new();
    let mut elevation_profile_data = Vec::new();
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

    fn extract_kml_elements(
        kml_element: &Kml,
        points: &mut Vec<(f64, f64)>,
        elevations: &mut Vec<Option<f64>>,
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
            }
            Kml::Document { elements, .. } => {
                for el in elements {
                    extract_kml_elements(
                        el,
                        points,
                        elevations,
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
                        last_elevation,
                        total_elevation_gain,
                        total_elevation_loss,
                    );
                }
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
        Some(elevation_profile_data)
    } else {
        None
    };

    // Calculate average speed and duration using metrics/time_utils if possible (future-proofing)
    // For now, KML does not provide time/HR, so these remain None

    // Perform automatic track classification
    use crate::track_classifier::{classify_track, TrackMetrics};
    let metrics = TrackMetrics {
        length_km,
        avg_speed: None,
        moving_avg_speed: None,
        elevation_up: final_elevation_gain,
        elevation_down: final_elevation_loss,
        moving_time: None,
        duration_seconds: None,
    };
    let classifications = classify_track(&metrics);
    let auto_classifications: Vec<String> = classifications.iter().map(|c| c.to_string()).collect();

    Ok(ParsedTrackData {
        geom_geojson,
        length_km,
        elevation_profile: final_elevation_profile,
        hr_data: None,   // KML does not typically contain HR data
        temp_data: None, // KML does not typically contain temperature data
        time_data: None, // KML does not typically contain time data
        elevation_up: final_elevation_gain,
        elevation_down: final_elevation_loss,
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
        auto_classifications, // Add automatic classifications
    })
}
