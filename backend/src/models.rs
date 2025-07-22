use serde::{Deserialize, Serialize};
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
}

#[derive(Debug, Serialize)]
pub struct TrackListItem {
    pub id: Uuid,
    pub name: String,
    pub categories: Vec<String>,
    pub length_km: f64,
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
    pub elevation_up: Option<f64>,
    pub elevation_down: Option<f64>,
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
}

#[derive(Debug)]
pub struct ParsedTrackData {
    pub geom_geojson: serde_json::Value,
    pub length_km: f64,
    pub elevation_profile: Option<Vec<Option<f64>>>,
    pub hr_data: Option<Vec<Option<i32>>>,
    pub temp_data: Option<Vec<Option<f64>>>,
    pub time_data: Option<Vec<Option<chrono::DateTime<chrono::Utc>>>>,
    pub elevation_up: Option<f64>,
    pub elevation_down: Option<f64>,
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

#[derive(Debug, Serialize)]
pub struct TrackSearchResult {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub categories: Vec<String>,
    pub length_km: f64,
    pub url: String,
}
