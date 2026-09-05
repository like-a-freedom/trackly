//! GeoJSON export service.
//!
//! Generates GeoJSON FeatureCollection from track data.

use crate::models::TrackDetail;

/// Generate GeoJSON content from track data.
pub fn generate_geojson(track: &TrackDetail) -> String {
    let mut properties = serde_json::Map::new();
    properties.insert("id".to_string(), serde_json::json!(track.id));
    properties.insert("name".to_string(), serde_json::json!(&track.name));
    properties.insert("length_km".to_string(), serde_json::json!(track.length_km));

    if let Some(desc) = &track.description {
        properties.insert("description".to_string(), serde_json::json!(desc));
    }
    if !track.categories.is_empty() {
        properties.insert(
            "categories".to_string(),
            serde_json::json!(&track.categories),
        );
    }
    if let Some(gain) = track.elevation_gain {
        properties.insert("elevation_gain".to_string(), serde_json::json!(gain));
    }
    if let Some(loss) = track.elevation_loss {
        properties.insert("elevation_loss".to_string(), serde_json::json!(loss));
    }
    if let Some(avg_speed) = track.avg_speed {
        properties.insert("avg_speed".to_string(), serde_json::json!(avg_speed));
    }
    if let Some(duration) = track.duration_seconds {
        properties.insert("duration_seconds".to_string(), serde_json::json!(duration));
    }
    if let Some(avg_hr) = track.avg_hr {
        properties.insert("avg_hr".to_string(), serde_json::json!(avg_hr));
    }

    // Build the feature
    let geometry = track.geom_geojson.clone();

    let feature = serde_json::json!({
        "type": "Feature",
        "geometry": geometry,
        "properties": properties
    });

    let feature_collection = serde_json::json!({
        "type": "FeatureCollection",
        "features": [feature]
    });

    serde_json::to_string_pretty(&feature_collection).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_geojson_contains_track_data() {
        let track = TrackDetail {
            id: uuid::Uuid::new_v4(),
            name: "Test Track".to_string(),
            description: Some("A test track".to_string()),
            categories: vec!["hiking".to_string()],
            distance_markers_enabled: None,
            geom_geojson: serde_json::json!({
                "type": "MultiLineString",
                "coordinates": [[[37.61, 55.75], [37.62, 55.76]]]
            }),
            segment_meta: None,
            segment_gaps: None,
            pause_gaps: None,
            length_km: 1.5,
            elevation_profile: None,
            hr_data: None,
            temp_data: None,
            time_data: None,
            elevation_gain: Some(100.0),
            elevation_loss: Some(50.0),
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
            avg_speed: Some(5.5),
            avg_hr: Some(140),
            hr_min: None,
            hr_max: None,
            moving_time: None,
            pause_time: None,
            moving_avg_speed: None,
            moving_avg_pace: None,
            duration_seconds: Some(3600),
            recorded_at: None,
            created_at: None,
            updated_at: None,
            session_id: None,
            user_id: None,
            speed_data: None,
            pace_data: None,
        };

        let geojson_str = generate_geojson(&track);
        let geojson: serde_json::Value = serde_json::from_str(&geojson_str).unwrap();

        assert_eq!(geojson["type"], "FeatureCollection");
        assert_eq!(geojson["features"][0]["properties"]["name"], "Test Track");
        assert_eq!(geojson["features"][0]["properties"]["length_km"], 1.5);
        assert_eq!(
            geojson["features"][0]["geometry"]["type"],
            "MultiLineString"
        );
    }
}
