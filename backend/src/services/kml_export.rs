//! KML export service.
//!
//! Generates KML (Keyhole Markup Language) from track data for use with
//! Google Earth and other geospatial applications.

use crate::models::TrackDetail;
use crate::track_utils::extract_segments_from_geojson;

/// Generate KML content from track data.
pub fn generate_kml(track: &TrackDetail) -> String {
    let coordinates = extract_coordinates(&track.geom_geojson);
    let track_name = xml_escape(&track.name);
    let track_description = track
        .description
        .as_ref()
        .map(|d| xml_escape(d))
        .unwrap_or_default();

    let coordinates_str = coordinates
        .iter()
        .map(|(lat, lon)| format!("{lon},{lat},0"))
        .collect::<Vec<_>>()
        .join(" ");

    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>{track_name}</name>
    <description>{track_description}</description>
    <Placemark>
      <name>{track_name}</name>
      <description>{track_description}</description>
      <LineString>
        <coordinates>{coordinates_str}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>"#
    )
}

fn extract_coordinates(geom_geojson: &serde_json::Value) -> Vec<(f64, f64)> {
    match extract_segments_from_geojson(geom_geojson) {
        Ok(segments) => segments.into_iter().flatten().collect(),
        Err(_) => Vec::new(),
    }
}

fn xml_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_track(name: &str, coords: serde_json::Value) -> TrackDetail {
        TrackDetail {
            id: uuid::Uuid::new_v4(),
            name: name.to_string(),
            description: Some("A test track".to_string()),
            categories: vec!["hiking".to_string()],
            distance_markers_enabled: None,
            geom_geojson: coords,
            segment_meta: None,
            waypoints: None,
            segment_gaps: None,
            pause_gaps: None,
            length_km: 1.0,
            elevation_profile: None,
            hr_data: None,
            temp_data: None,
            time_data: None,
            elevation_gain: None,
            elevation_loss: None,
            elevation_min: None,
            elevation_max: None,
            elevation_enriched: None,
            elevation_enriched_at: None,
            elevation_dataset: None,
            slope_min: None,
            slope_max: None,
            slope_avg: None,
            slope_histogram: None,
            slope_segments: None,
            avg_speed: None,
            avg_hr: None,
            hr_min: None,
            hr_max: None,
            moving_time: None,
            pause_time: None,
            moving_avg_speed: None,
            moving_avg_pace: None,
            duration_seconds: None,
            recorded_at: None,
            created_at: None,
            updated_at: None,
            session_id: None,
            user_id: None,
            speed_data: None,
            pace_data: None,
        }
    }

    #[test]
    fn test_generate_kml_contains_name_and_geometry() {
        let track = make_test_track(
            "Test Track",
            serde_json::json!({
                "type": "MultiLineString",
                "coordinates": [[[37.61, 55.75], [37.62, 55.76], [37.63, 55.77]]]
            }),
        );

        let kml = generate_kml(&track);
        assert!(kml.contains("Test Track"));
        assert!(kml.contains("kml"));
        assert!(kml.contains("LineString"));
        assert!(kml.contains("37.61,55.75,0"));
    }

    #[test]
    fn test_generate_kml_escapes_xml() {
        let track = make_test_track(
            "Track <script> & \"test\"",
            serde_json::json!({
                "type": "MultiLineString",
                "coordinates": [[[37.61, 55.75]]]
            }),
        );

        let kml = generate_kml(&track);
        assert!(!kml.contains("<script>"));
        assert!(kml.contains("&lt;script&gt;"));
        assert!(kml.contains("&amp;"));
        assert!(kml.contains("&quot;"));
    }
}
