use crate::models::TrackDetail;
use chrono::Utc;

/// Service for exporting tracks to GPX format
#[derive(Default)]
pub struct GpxExportService;

impl GpxExportService {
    pub fn new() -> Self {
        Self::default()
    }

    /// Generate GPX XML from track data
    pub fn generate_gpx(&self, track: &TrackDetail) -> String {
        let created_at = track
            .created_at
            .unwrap_or(Utc::now())
            .format("%Y-%m-%dT%H:%M:%SZ");

        // Extract coordinates from GeoJSON
        let coordinates = self.extract_coordinates(&track.geom_geojson);

        // Generate track points with elevation data if available
        let track_points = self.generate_track_points(&coordinates, track);

        let track_name = xml_escape(&track.name);
        let track_description = track
            .description
            .as_ref()
            .map(|d| xml_escape(d))
            .unwrap_or_default();

        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Trackly" 
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>{track_name}</name>
    <desc>{track_description}</desc>
    <time>{created_at}</time>
  </metadata>
  <trk>
    <name>{track_name}</name>
    <desc>{track_description}</desc>
    <trkseg>
{track_points}    </trkseg>
  </trk>
</gpx>"#
        )
    }

    /// Sanitize filename for safe file system usage
    pub fn sanitize_filename(&self, name: &str) -> String {
        name.chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                    c
                } else {
                    '_'
                }
            })
            .collect::<String>()
            .trim()
            .to_string()
            .replace(' ', "_")
    }

    fn extract_coordinates(&self, geom_geojson: &serde_json::Value) -> Vec<(f64, f64)> {
        if let Some(coords) = geom_geojson.get("coordinates") {
            if let Some(coord_array) = coords.as_array() {
                return coord_array
                    .iter()
                    .filter_map(|coord| {
                        if let Some(pair) = coord.as_array() {
                            if pair.len() >= 2 {
                                let lon = pair[0].as_f64()?;
                                let lat = pair[1].as_f64()?;
                                Some((lat, lon))
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    })
                    .collect();
            }
        }
        Vec::new()
    }

    fn generate_track_points(&self, coordinates: &[(f64, f64)], track: &TrackDetail) -> String {
        let mut track_points = String::new();
        for (i, (lat, lon)) in coordinates.iter().enumerate() {
            let elevation = self.get_elevation_xml(track, i);
            let hr_data = self.get_hr_xml(track, i);
            let time_data = self.get_time_xml(track, i);

            track_points.push_str(&format!(
                "      <trkpt lat=\"{lat:.7}\" lon=\"{lon:.7}\">{elevation}{time_data}{hr_data}</trkpt>\n"
            ));
        }
        track_points
    }

    fn get_elevation_xml(&self, track: &TrackDetail, index: usize) -> String {
        if let Some(elevation_profile) = &track.elevation_profile {
            if let Some(elevation_array) = elevation_profile.as_array() {
                if index < elevation_array.len() {
                    if let Some(ele_val) = elevation_array[index].as_f64() {
                        return format!("<ele>{ele_val:.1}</ele>");
                    }
                }
            }
        }
        String::new()
    }

    fn get_hr_xml(&self, track: &TrackDetail, index: usize) -> String {
        if let Some(hr_data) = &track.hr_data {
            if let Some(hr_array) = hr_data.as_array() {
                if index < hr_array.len() {
                    if let Some(hr_val) = hr_array[index].as_i64() {
                        return format!(
                            "<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>{hr_val}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>"
                        );
                    }
                }
            }
        }
        String::new()
    }

    fn get_time_xml(&self, track: &TrackDetail, index: usize) -> String {
        if let Some(time_data) = &track.time_data {
            if let Some(time_array) = time_data.as_array() {
                if index < time_array.len() {
                    if let Some(time_str) = time_array[index].as_str() {
                        return format!("<time>{}</time>", xml_escape(time_str));
                    }
                }
            }
        }
        String::new()
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
    use serde_json::json;
    use uuid::Uuid;

    #[test]
    fn test_sanitize_filename() {
        let service = GpxExportService::new();
        assert_eq!(service.sanitize_filename("My Track"), "My_Track");
        assert_eq!(service.sanitize_filename("Track/Name"), "Track_Name");
        assert_eq!(service.sanitize_filename("Track<>Name"), "Track__Name");
        assert_eq!(service.sanitize_filename("  Track  "), "Track");
    }

    #[test]
    fn test_xml_escape() {
        assert_eq!(xml_escape("Test & Track"), "Test &amp; Track");
        assert_eq!(xml_escape("Track <name>"), "Track &lt;name&gt;");
        assert_eq!(xml_escape("Track \"quoted\""), "Track &quot;quoted&quot;");
    }

    #[test]
    fn test_generate_gpx_from_track() {
        let service = GpxExportService::new();
        let track = TrackDetail {
            id: Uuid::new_v4(),
            name: "Test Track".to_string(),
            description: Some("Test Description".to_string()),
            categories: vec!["running".to_string()],
            auto_classifications: vec![],
            geom_geojson: json!({
                "type": "LineString",
                "coordinates": [[37.6176, 55.7558], [37.6177, 55.7559]]
            }),
            length_km: 0.1,
            elevation_profile: Some(json!([200.0, 210.0])),
            hr_data: Some(json!([120, 125])),
            temp_data: None,
            time_data: None,
            elevation_gain: Some(10.0),
            elevation_loss: Some(0.0),
            elevation_min: Some(200.0),
            elevation_max: Some(210.0),
            elevation_enriched: Some(false),
            elevation_enriched_at: None,
            elevation_dataset: None,
            slope_min: None,
            slope_max: None,
            slope_avg: None,
            slope_histogram: None,
            slope_segments: None,
            avg_speed: None,
            avg_hr: Some(122),
            hr_min: Some(120),
            hr_max: Some(125),
            moving_time: None,
            pause_time: None,
            moving_avg_speed: None,
            moving_avg_pace: None,
            duration_seconds: None,
            created_at: Some(Utc::now()),
            updated_at: Some(Utc::now()),
            recorded_at: None,
            session_id: None,
            speed_data: None,
            pace_data: None,
        };

        let gpx = service.generate_gpx(&track);
        assert!(gpx.contains("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        assert!(gpx.contains("<name>Test Track</name>"));
        assert!(gpx.contains("<desc>Test Description</desc>"));
        assert!(gpx.contains("lat=\"55.7558000\" lon=\"37.6176000\""));
        assert!(gpx.contains("<ele>200.0</ele>"));
        assert!(gpx.contains("<gpxtpx:hr>120</gpxtpx:hr>"));
    }
}
