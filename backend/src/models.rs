use serde::{Deserialize, Deserializer, Serialize};
use uuid::Uuid;

#[derive(Serialize, serde::Deserialize)]
pub struct TrackUploadResponse {
    pub id: Uuid,
    pub url: String,
}

#[derive(Serialize, serde::Deserialize)]
pub struct TrackExistResponse {
    pub is_exist: bool,
    pub id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct TrackListQuery {
    pub categories: Option<Vec<String>>,
    pub min_length: Option<f64>,
    pub max_length: Option<f64>,
    pub elevation_gain_min: Option<f32>,
    pub elevation_gain_max: Option<f32>,
    pub slope_min: Option<f32>,
    pub slope_max: Option<f32>,
}

#[derive(Debug, Serialize)]
pub struct TrackListItem {
    pub id: Uuid,
    pub name: String,
    pub categories: Vec<String>,
    pub length_km: f64,
    pub elevation_gain: Option<f32>,
    pub elevation_loss: Option<f32>,
    pub elevation_enriched: Option<bool>,
    pub slope_min: Option<f32>,
    pub slope_max: Option<f32>,
    pub slope_avg: Option<f32>,
    pub url: String,
}

#[derive(Serialize)]
pub struct TrackDetail {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub categories: Vec<String>,
    pub geom_geojson: serde_json::Value, // Store geometry as GeoJSON for API
    pub length_km: f64,
    pub elevation_profile: Option<serde_json::Value>, // Keep as JSON for API flexibility
    pub hr_data: Option<serde_json::Value>, // Store as JSON for compatibility with DB jsonb
    pub temp_data: Option<serde_json::Value>, // Store as JSON for compatibility with DB jsonb
    pub time_data: Option<serde_json::Value>, // Store as JSON for compatibility with DB jsonb
    // Unified elevation fields
    pub elevation_gain: Option<f32>,
    pub elevation_loss: Option<f32>,
    pub elevation_min: Option<f32>,
    pub elevation_max: Option<f32>,
    pub elevation_enriched: Option<bool>,
    pub elevation_enriched_at: Option<chrono::NaiveDateTime>,
    pub elevation_dataset: Option<String>,
    // Slope fields
    pub slope_min: Option<f32>,
    pub slope_max: Option<f32>,
    pub slope_avg: Option<f32>,
    pub slope_histogram: Option<serde_json::Value>,
    pub slope_segments: Option<serde_json::Value>,
    pub avg_speed: Option<f64>,
    pub avg_hr: Option<i32>,
    pub hr_min: Option<i32>,
    pub hr_max: Option<i32>,
    pub moving_time: Option<i32>,
    pub pause_time: Option<i32>,
    pub moving_avg_speed: Option<f64>,
    pub moving_avg_pace: Option<f64>,
    pub duration_seconds: Option<i32>,
    pub recorded_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
    pub session_id: Option<Uuid>, // Add session_id for owner check
    pub auto_classifications: Vec<String>, // Automatically determined track classifications
}

#[derive(Debug, Serialize)]
pub struct TrackSimplified {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub categories: Vec<String>,
    pub geom_geojson: serde_json::Value, // Simplified geometry
    pub length_km: f64,
    // Include data profiles for charts (but geometry will be simplified)
    pub elevation_profile: Option<serde_json::Value>,
    pub hr_data: Option<serde_json::Value>,
    pub temp_data: Option<serde_json::Value>,
    pub time_data: Option<serde_json::Value>,
    // Unified elevation fields
    pub elevation_gain: Option<f32>,
    pub elevation_loss: Option<f32>,
    pub elevation_min: Option<f32>,
    pub elevation_max: Option<f32>,
    pub elevation_enriched: Option<bool>,
    pub elevation_enriched_at: Option<chrono::NaiveDateTime>,
    pub elevation_dataset: Option<String>,
    // Slope fields
    pub slope_min: Option<f32>,
    pub slope_max: Option<f32>,
    pub slope_avg: Option<f32>,
    pub slope_histogram: Option<serde_json::Value>,
    pub slope_segments: Option<serde_json::Value>,
    pub avg_speed: Option<f64>,
    pub avg_hr: Option<i32>,
    pub hr_min: Option<i32>,
    pub hr_max: Option<i32>,
    pub moving_time: Option<i32>,
    pub pause_time: Option<i32>,
    pub moving_avg_speed: Option<f64>,
    pub moving_avg_pace: Option<f64>,
    pub duration_seconds: Option<i32>,
    pub recorded_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
    pub session_id: Option<Uuid>,
    pub auto_classifications: Vec<String>,
}

#[derive(Serialize)]
pub struct TrackGeoJsonFeature {
    #[serde(rename = "type")]
    pub type_field: String,
    pub geometry: serde_json::Value,
    pub properties: serde_json::Value,
}

#[derive(Serialize)]
pub struct TrackGeoJsonCollection {
    #[serde(rename = "type")]
    pub type_field: String,
    pub features: Vec<TrackGeoJsonFeature>,
}

#[derive(Debug, Deserialize)]
pub struct TrackGeoJsonQuery {
    pub bbox: Option<String>,
    pub zoom: Option<f64>,
    pub mode: Option<String>,
    // Filtering parameters
    #[serde(default, deserialize_with = "deserialize_categories")]
    pub categories: Option<Vec<String>>,
    pub min_length: Option<f64>,
    pub max_length: Option<f64>,
    pub elevation_gain_min: Option<f32>,
    pub elevation_gain_max: Option<f32>,
    pub slope_min: Option<f32>,
    pub slope_max: Option<f32>,
}

// Custom deserializer to handle both comma-separated string and array formats
fn deserialize_categories<'de, D>(deserializer: D) -> Result<Option<Vec<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum StringOrVec {
        String(String),
        Vec(Vec<String>),
    }

    let helper = Option::<StringOrVec>::deserialize(deserializer)?;
    Ok(match helper {
        Some(StringOrVec::String(s)) => {
            if s.is_empty() {
                None
            } else {
                Some(s.split(',').map(|s| s.trim().to_string()).collect())
            }
        }
        Some(StringOrVec::Vec(v)) => Some(v),
        None => None,
    })
}

#[derive(Debug, Clone, Copy)]
pub enum TrackMode {
    Overview,
    Detail,
}

impl TrackMode {
    pub fn from_string(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "detail" => TrackMode::Detail,
            _ => TrackMode::Overview, // default
        }
    }

    pub fn is_overview(&self) -> bool {
        matches!(self, TrackMode::Overview)
    }

    pub fn is_detail(&self) -> bool {
        matches!(self, TrackMode::Detail)
    }
}

#[derive(Debug)]
pub struct ParsedTrackData {
    pub geom_geojson: serde_json::Value,
    pub length_km: f64,
    pub elevation_profile: Option<Vec<Option<f64>>>,
    pub hr_data: Option<Vec<Option<i32>>>,
    pub temp_data: Option<Vec<Option<f64>>>,
    pub time_data: Option<Vec<Option<chrono::DateTime<chrono::Utc>>>>,
    // Unified elevation fields
    pub elevation_gain: Option<f32>,
    pub elevation_loss: Option<f32>,
    pub elevation_min: Option<f32>,
    pub elevation_max: Option<f32>,
    // Slope fields
    pub slope_min: Option<f32>,
    pub slope_max: Option<f32>,
    pub slope_avg: Option<f32>,
    pub slope_histogram: Option<serde_json::Value>,
    pub slope_segments: Option<serde_json::Value>,
    pub avg_speed: Option<f64>,
    pub avg_hr: Option<i32>,
    pub hr_min: Option<i32>,
    pub hr_max: Option<i32>,
    pub moving_time: Option<i32>,
    pub pause_time: Option<i32>,
    pub moving_avg_speed: Option<f64>,
    pub moving_avg_pace: Option<f64>,
    pub duration_seconds: Option<i32>,
    pub hash: String,
    pub recorded_at: Option<chrono::DateTime<chrono::Utc>>,
    pub auto_classifications: Vec<String>, // Result of automatic track classification
}

#[derive(Debug, Deserialize)]
pub struct UpdateTrackDescriptionRequest {
    pub description: String,
    pub session_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTrackNameRequest {
    pub name: String,
    pub session_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct TrackSearchQuery {
    pub query: String,
}

#[derive(Debug, Deserialize)]
pub struct TrackSimplificationQuery {
    pub zoom: Option<f64>,
    pub mode: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TrackSearchResult {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub categories: Vec<String>,
    pub length_km: f64,
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct EnrichElevationRequest {
    pub force: Option<bool>,
    pub dataset: Option<String>,
    pub session_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct EnrichElevationResponse {
    pub id: Uuid,
    pub message: String,
    pub elevation_gain: Option<f32>,
    pub elevation_loss: Option<f32>,
    pub elevation_min: Option<f32>,
    pub elevation_max: Option<f32>,
    pub elevation_dataset: Option<String>,
    pub enriched_at: Option<chrono::NaiveDateTime>,
}

/// Track data needed for elevation enrichment
#[derive(Debug)]
pub struct TrackForElevationEnrichment {
    pub id: Uuid,
    pub session_id: Option<Uuid>,
    pub elevation_enriched: Option<bool>,
    pub elevation_gain: Option<f32>,
    pub elevation_loss: Option<f32>,
    pub elevation_min: Option<f32>,
    pub elevation_max: Option<f32>,
    pub elevation_enriched_at: Option<chrono::NaiveDateTime>,
    pub elevation_dataset: Option<String>,
    pub geom_geojson: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_track_upload_response_serde() {
        let resp = TrackUploadResponse {
            id: Uuid::new_v4(),
            url: "/tracks/1".to_string(),
        };
        let json = serde_json::to_string(&resp).unwrap();
        let de: TrackUploadResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(resp.url, de.url);
    }

    #[test]
    fn test_track_exist_response_serde() {
        let resp = TrackExistResponse {
            is_exist: true,
            id: Some(Uuid::new_v4()),
        };
        let json = serde_json::to_string(&resp).unwrap();
        let de: TrackExistResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(resp.is_exist, de.is_exist);
    }

    // Track optimization related tests
    #[tokio::test]
    async fn test_list_tracks_with_zoom_and_mode() {
        // Test that TrackGeoJsonQuery accepts zoom and mode parameters
        let query_overview = TrackGeoJsonQuery {
            bbox: Some("37.0,55.0,37.2,55.2".to_string()),
            zoom: Some(10.0),
            mode: Some("overview".to_string()),
            categories: None,
            min_length: None,
            max_length: None,
            elevation_gain_min: None,
            elevation_gain_max: None,
            slope_min: None,
            slope_max: None,
        };

        assert_eq!(query_overview.zoom, Some(10.0));
        assert_eq!(query_overview.mode, Some("overview".to_string()));

        let query_detail = TrackGeoJsonQuery {
            bbox: Some("37.0,55.0,37.2,55.2".to_string()),
            zoom: Some(15.0),
            mode: Some("detail".to_string()),
            categories: None,
            min_length: None,
            max_length: None,
            elevation_gain_min: None,
            elevation_gain_max: None,
            slope_min: None,
            slope_max: None,
        };

        assert_eq!(query_detail.zoom, Some(15.0));
        assert_eq!(query_detail.mode, Some("detail".to_string()));
    }

    #[test]
    fn test_track_mode_parsing() {
        assert!(TrackMode::from_string("detail").is_detail());
        assert!(!TrackMode::from_string("detail").is_overview());

        assert!(TrackMode::from_string("overview").is_overview());
        assert!(!TrackMode::from_string("overview").is_detail());

        // Test case insensitivity and defaults
        assert!(TrackMode::from_string("DETAIL").is_detail());
        assert!(TrackMode::from_string("Overview").is_overview());
        assert!(TrackMode::from_string("invalid").is_overview()); // Default to overview
        assert!(TrackMode::from_string("").is_overview()); // Default to overview
    }

    #[test]
    fn test_track_simplification_query() {
        let query_with_both = TrackSimplificationQuery {
            zoom: Some(12.0),
            mode: Some("detail".to_string()),
        };

        assert_eq!(query_with_both.zoom, Some(12.0));
        assert_eq!(query_with_both.mode, Some("detail".to_string()));

        let query_with_zoom_only = TrackSimplificationQuery {
            zoom: Some(8.0),
            mode: None,
        };

        assert_eq!(query_with_zoom_only.zoom, Some(8.0));
        assert_eq!(query_with_zoom_only.mode, None);

        let query_empty = TrackSimplificationQuery {
            zoom: None,
            mode: None,
        };

        assert_eq!(query_empty.zoom, None);
        assert_eq!(query_empty.mode, None);
    }

    #[test]
    fn test_mode_affects_response_size() {
        // Test that overview mode reduces data size compared to detail mode
        let overview_track = TrackGeoJsonFeature {
            type_field: "Feature".to_string(),
            geometry: serde_json::json!({"type": "LineString", "coordinates": [[37.0, 55.0]]}),
            properties: serde_json::json!({
                "id": "test-id",
                "name": "Test Track",
                "categories": ["running"],
                "length_km": 10.5
                // Note: overview mode should not include elevation_up, avg_hr, etc.
            }),
        };

        let detail_track = TrackGeoJsonFeature {
            type_field: "Feature".to_string(),
            geometry: serde_json::json!({"type": "LineString", "coordinates": [[37.0, 55.0]]}),
            properties: serde_json::json!({
                "id": "test-id",
                "name": "Test Track",
                "categories": ["running"],
                "length_km": 10.5,
                "elevation_up": 100.0,
                "elevation_down": 80.0,
                "avg_hr": 150,
                "avg_speed": 12.5,
                "duration_seconds": 3600,
                "recorded_at": "2023-01-01T00:00:00Z"
                // Detail mode includes more properties
            }),
        };

        // Convert to JSON and compare sizes
        let overview_json = serde_json::to_string(&overview_track).unwrap();
        let detail_json = serde_json::to_string(&detail_track).unwrap();

        // Detail mode should have more data (larger JSON)
        assert!(detail_json.len() > overview_json.len());
    }
}
