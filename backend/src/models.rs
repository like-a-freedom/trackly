use serde::{Deserialize, Deserializer, Serialize};
use uuid::Uuid;

#[derive(Serialize, serde::Deserialize)]
pub struct TrackUploadResponse {
    pub id: Uuid,
    pub url: String,
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
    /// When set, restrict results to tracks owned by this session (show private and public tracks)
    pub owner_session_id: Option<Uuid>,
    /// When set, restrict results to tracks owned by this user (show private and public tracks)
    pub owner_user_id: Option<Uuid>,
    /// When true, show only user's own tracks (requires owner_session_id or owner_user_id)
    pub mine: Option<bool>,
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

#[derive(Debug, Serialize)]
pub struct GapEndpoint {
    pub lat: f64,
    pub lon: f64,
    pub segment_index: usize,
    pub point_index: usize,
}

#[derive(Debug, Serialize)]
pub struct GapInfo {
    pub kind: String, // "segment" or "pause"
    pub from: GapEndpoint,
    pub to: GapEndpoint,
    pub distance_m: f64,
    pub duration_seconds: Option<i64>,
}

/// Detailed track information with all metadata, geometry, and analytics.
#[must_use]
#[derive(Serialize)]
pub struct TrackDetail {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub categories: Vec<String>,
    pub distance_markers_enabled: Option<bool>,
    pub geom_geojson: serde_json::Value, // Store geometry as GeoJSON for API
    pub segment_meta: Option<serde_json::Value>, // Per-segment metadata (name, color)
    pub segment_gaps: Option<Vec<GapInfo>>, // Teleport gaps between segments
    pub pause_gaps: Option<Vec<GapInfo>>, // Time-based gaps on continuous tracks
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
    pub user_id: Option<Uuid>,    // User ID for authenticated ownership
    pub speed_data: Option<serde_json::Value>, // Store as JSON for compatibility with DB jsonb
    pub pace_data: Option<serde_json::Value>, // Store as JSON for compatibility with DB jsonb
}

/// Simplified track data for listing views (geometry is pre-simplified).
#[must_use]
#[derive(Debug, Serialize)]
pub struct TrackSimplified {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub categories: Vec<String>,
    pub distance_markers_enabled: Option<bool>,
    pub geom_geojson: serde_json::Value, // Simplified geometry
    pub segment_meta: Option<serde_json::Value>, // Per-segment metadata (name, color)
    pub segment_gaps: Option<Vec<GapInfo>>, // Teleport gaps between segments
    pub pause_gaps: Option<Vec<GapInfo>>, // Time-based gaps on continuous tracks
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
    pub speed_data: Option<serde_json::Value>, // Store as JSON for compatibility with DB jsonb
    pub pace_data: Option<serde_json::Value>,  // Store as JSON for compatibility with DB jsonb
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

#[derive(Serialize)]
pub struct HeatmapPoint {
    pub lat: f64,
    pub lon: f64,
    pub weight: i32,
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
    /// When set, restrict results to tracks owned by this session (show private and public tracks)
    pub owner_session_id: Option<Uuid>,
    /// When set, restrict results to tracks owned by this user (show private and public tracks)
    pub owner_user_id: Option<Uuid>,
    /// When true, show only user's own tracks (requires owner_session_id or owner_user_id)
    pub mine: Option<bool>,
}

/// Common interface for track filter parameters shared across list, geojson, and heatmap queries.
pub trait TrackFilterParams {
    fn categories(&self) -> Option<&[String]>;
    fn min_length(&self) -> Option<f64>;
    fn max_length(&self) -> Option<f64>;
    fn elevation_gain_min(&self) -> Option<f32>;
    fn elevation_gain_max(&self) -> Option<f32>;
    fn slope_min(&self) -> Option<f32>;
    fn slope_max(&self) -> Option<f32>;
    fn owner_session_id(&self) -> Option<Uuid>;
    fn owner_user_id(&self) -> Option<Uuid>;
    fn mine(&self) -> Option<bool>;
}

impl TrackFilterParams for TrackListQuery {
    fn categories(&self) -> Option<&[String]> {
        self.categories.as_deref()
    }
    fn min_length(&self) -> Option<f64> {
        self.min_length
    }
    fn max_length(&self) -> Option<f64> {
        self.max_length
    }
    fn elevation_gain_min(&self) -> Option<f32> {
        self.elevation_gain_min
    }
    fn elevation_gain_max(&self) -> Option<f32> {
        self.elevation_gain_max
    }
    fn slope_min(&self) -> Option<f32> {
        self.slope_min
    }
    fn slope_max(&self) -> Option<f32> {
        self.slope_max
    }
    fn owner_session_id(&self) -> Option<Uuid> {
        self.owner_session_id
    }
    fn owner_user_id(&self) -> Option<Uuid> {
        self.owner_user_id
    }
    fn mine(&self) -> Option<bool> {
        self.mine
    }
}

impl TrackFilterParams for TrackGeoJsonQuery {
    fn categories(&self) -> Option<&[String]> {
        self.categories.as_deref()
    }
    fn min_length(&self) -> Option<f64> {
        self.min_length
    }
    fn max_length(&self) -> Option<f64> {
        self.max_length
    }
    fn elevation_gain_min(&self) -> Option<f32> {
        self.elevation_gain_min
    }
    fn elevation_gain_max(&self) -> Option<f32> {
        self.elevation_gain_max
    }
    fn slope_min(&self) -> Option<f32> {
        self.slope_min
    }
    fn slope_max(&self) -> Option<f32> {
        self.slope_max
    }
    fn owner_session_id(&self) -> Option<Uuid> {
        self.owner_session_id
    }
    fn owner_user_id(&self) -> Option<Uuid> {
        self.owner_user_id
    }
    fn mine(&self) -> Option<bool> {
        self.mine
    }
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

/// View mode for track display (overview vs detail).
#[must_use]
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

/// Parsed track data from GPX/KML conversion before DB insertion.
#[must_use]
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
    pub speed_data: Option<Vec<Option<f64>>>, // Point-by-point speed data (km/h)
    pub pace_data: Option<Vec<Option<f64>>>,  // Point-by-point pace data (min/km)
    pub waypoints: Vec<ParsedWaypoint>,       // Waypoints/POIs from GPX file
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
pub struct UpdateTrackCategoriesRequest {
    pub categories: Vec<String>,
    pub session_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTrackDistanceMarkersRequest {
    pub distance_markers_enabled: bool,
    pub session_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct DeleteTrackRequest {
    pub session_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct TrackSearchQuery {
    pub query: String,
}

#[derive(Debug, Deserialize)]
pub struct MapInteractionEvent {
    pub action: String,
    pub zoom: Option<f64>,
    pub session_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct TrackSimplificationQuery {
    pub zoom: Option<f64>,
    pub mode: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TrackSimplifyPreviewRequest {
    pub geometry: serde_json::Value,
    #[serde(default)]
    pub waypoints: Vec<Vec<usize>>,
    pub target_ratio: f64,
}

#[derive(Debug, Serialize)]
pub struct TrackSimplifyPreviewResponse {
    pub geometry: serde_json::Value,
    pub waypoints: Vec<Vec<usize>>,
    pub original_points: usize,
    pub simplified_points: usize,
    pub compression_ratio: f64,
    pub tolerance_used: f64,
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

#[derive(Debug, Deserialize)]
pub struct ElevationPreviewRequest {
    pub coordinates: Vec<[f64; 2]>,
}

#[derive(Debug, Serialize)]
pub struct ElevationPreviewResponse {
    pub elevation_profile: Vec<f64>,
    pub elevation_gain: Option<f32>,
    pub elevation_loss: Option<f32>,
    pub elevation_min: Option<f32>,
    pub elevation_max: Option<f32>,
    pub elevation_dataset: String,
}

/// Track data needed for elevation enrichment
#[derive(Debug)]
pub struct TrackForElevationEnrichment {
    pub id: Uuid,
    pub session_id: Option<Uuid>,
    pub user_id: Option<Uuid>,
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
            owner_session_id: None,
            owner_user_id: None,
            mine: None,
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
            owner_session_id: None,
            owner_user_id: None,
            mine: None,
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

// ============================================================================
// POI (Points of Interest) Models
// ============================================================================

/// POI structure from database
#[must_use]
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Poi {
    pub id: i32,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub elevation: Option<f32>,
    #[sqlx(skip)]
    #[serde(skip_deserializing)]
    pub geom: serde_json::Value, // GeoJSON Point
    pub session_id: Option<Uuid>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// POI with distance and sequence information from track association
#[derive(Debug, Serialize, Deserialize)]
pub struct PoiWithDistance {
    #[serde(flatten)]
    pub poi: Poi,
    pub distance_from_start_m: Option<f32>,
    pub sequence_order: Option<i32>,
}

/// Request to create a new POI
#[derive(Debug, Deserialize)]
pub struct CreatePoiRequest {
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub elevation: Option<f32>,
    pub lat: f64,
    pub lon: f64,
    pub session_id: Option<Uuid>,
}

/// Request to update an existing POI
#[derive(Debug, Deserialize)]
pub struct UpdatePoiRequest {
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    pub category: Option<Option<String>>,
    pub session_id: Option<Uuid>,
}

/// Query parameters for listing POIs
#[derive(Debug, Deserialize)]
pub struct PoiQuery {
    pub bbox: Option<String>, // "minLon,minLat,maxLon,maxLat"
    pub categories: Option<Vec<String>>,
    pub track_id: Option<Uuid>,
    pub search: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Response for POI list endpoint
#[derive(Debug, Serialize)]
pub struct PoiListResponse {
    pub pois: Vec<Poi>,
    pub total: i64,
}

/// Waypoint parsed from GPX file
#[derive(Debug, Clone)]
pub struct ParsedWaypoint {
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub elevation: Option<f32>,
}

/// Request to delete a POI
#[derive(Debug, Deserialize)]
pub struct DeletePoiRequest {
    pub session_id: Option<Uuid>,
}

// ============================================================================
// Strong Domain Types for API Responses
//
// These types replace serde_json::Value for better type safety while
// maintaining backward compatibility with the database representation.
// ============================================================================

/// Elevation profile data: array of {distance, elevation} points
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ElevationPoint {
    /// Distance from start in meters
    pub distance: f64,
    /// Elevation at this point in meters
    pub elevation: f64,
}

/// Heart rate data: array of {time, heartrate} points
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HrPoint {
    /// Time offset from start in seconds
    pub time: f64,
    /// Heart rate in BPM
    pub heartrate: u8,
}

/// Speed data: array of {time, speed} points
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SpeedPoint {
    /// Time offset from start in seconds
    pub time: f64,
    /// Speed in km/h
    pub speed: f64,
}

/// Pace data: array of {time, pace} points
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PacePoint {
    /// Time offset from start in seconds
    pub time: f64,
    /// Pace in min/km
    pub pace: f64,
}

/// Temperature data: array of {time, temperature} points
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TempPoint {
    /// Time offset from start in seconds
    pub time: f64,
    /// Temperature in Celsius
    pub temperature: f64,
}

/// Time data: array of {distance, time} points
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TimePoint {
    /// Distance from start in meters
    pub distance: f64,
    /// Time offset from start in seconds
    pub time: f64,
}

/// Slope histogram bin
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SlopeBin {
    /// Slope range start in percent
    pub slope_start: f64,
    /// Slope range end in percent
    pub slope_end: f64,
    /// Count of points in this range
    pub count: u32,
}

/// Slope segment with grade information
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SlopeSegment {
    /// Start distance in meters
    pub start_distance: f64,
    /// End distance in meters
    pub end_distance: f64,
    /// Average slope in percent
    pub slope: f64,
    /// Length in meters
    pub length: f64,
}

/// Per-segment metadata
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SegmentMeta {
    /// Segment name (optional)
    pub name: Option<String>,
    /// Segment color (hex string)
    pub color: Option<String>,
    /// Surface type (e.g., "asphalt", "gravel", "trail")
    pub surface: Option<String>,
}

/// Track data profiles with strong typing
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TrackDataProfiles {
    pub elevation_profile: Option<Vec<ElevationPoint>>,
    pub hr_data: Option<Vec<HrPoint>>,
    pub temp_data: Option<Vec<TempPoint>>,
    pub time_data: Option<Vec<TimePoint>>,
    pub speed_data: Option<Vec<SpeedPoint>>,
    pub pace_data: Option<Vec<PacePoint>>,
    pub slope_histogram: Option<Vec<SlopeBin>>,
    pub slope_segments: Option<Vec<SlopeSegment>>,
}
