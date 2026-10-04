use crate::{
    db,
    error::{AppError, Result},
    input_validation::validate_track_fields,
    metrics,
    models::TrackUploadResponse,
    track_utils::{extract_segments_from_geojson, geojson_from_segments, length_km_for_segments},
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Instant;
use tracing::{error, info, warn};
use uuid::Uuid;

/// Maximum number of points allowed in a manually created track.
const MAX_TRACK_POINTS: usize = 100_000;

/// Maximum number of segments allowed.
const MAX_SEGMENTS: usize = 100;

/// Maximum number of waypoints allowed.
const MAX_WAYPOINTS: usize = 10_000;

/// A single waypoint placed by the user.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct WaypointInput {
    pub lat: f64,
    pub lon: f64,
    /// Index of this waypoint in the overall point sequence (optional).
    pub index: Option<usize>,
}

/// A POI to associate with the track.
#[derive(Debug, Clone, Deserialize)]
pub struct PoiInput {
    /// Existing POI id (if linking to an existing one).
    pub id: Option<i32>,
    pub lat: f64,
    pub lon: f64,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
}

/// Request payload for creating a track from editor geometry.
#[derive(Debug, Deserialize)]
pub struct CreateTrackFromEditorRequest {
    pub name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub categories: Vec<String>,
    pub geometry: serde_json::Value,
    #[serde(default)]
    pub waypoints: Vec<WaypointInput>,
    #[serde(default)]
    pub pois: Vec<PoiInput>,
    #[serde(default)]
    pub segment_meta: Option<serde_json::Value>,
    pub session_id: Option<Uuid>,
    #[serde(default)]
    pub is_draft: bool,
}

/// Request payload for updating track geometry.
#[derive(Debug, Deserialize)]
pub struct UpdateTrackGeometryRequest {
    pub geometry: serde_json::Value,
    #[serde(default)]
    pub waypoints: Vec<WaypointInput>,
    #[serde(default)]
    pub segment_meta: Option<serde_json::Value>,
    /// Session ID for anonymous ownership verification.
    /// Required for anonymous users updating their own tracks.
    pub session_id: Option<Uuid>,
}

/// Request payload for duplicating a track.
#[derive(Debug, Deserialize)]
pub struct DuplicateTrackRequest {
    pub session_id: Option<Uuid>,
    pub name: Option<String>,
}

/// Create a new track from editor-provided geometry.
#[tracing::instrument(skip(request), fields(endpoint = "create_track_from_editor"))]
pub async fn create_track(
    pool: &Arc<PgPool>,
    request: CreateTrackFromEditorRequest,
    user_id: Option<Uuid>,
) -> Result<TrackUploadResponse> {
    let start = Instant::now();

    // Validate inputs
    validate_create_request(&request)?;

    // Validate and normalize geometry
    let (geojson, length_km) = validate_geometry(&request.geometry)?;

    // Compute hash from geometry
    let hash = compute_geometry_hash(&geojson);

    let track_id = Uuid::new_v4();
    let waypoints_json = if request.waypoints.is_empty() {
        None
    } else {
        Some(serde_json::to_value(&request.waypoints).map_err(|e| {
            error!(?e, "failed to serialize waypoints");
            AppError::Internal(e.into())
        })?)
    };

    let sanitized_name = ammonia::clean(&request.name);
    let sanitized_description = request.description.as_deref().map(ammonia::clean);

    let category_refs: Vec<&str> = request.categories.iter().map(|c| c.as_str()).collect();

    db::insert_track_from_editor(db::InsertTrackFromEditorParams {
        pool,
        id: track_id,
        name: &sanitized_name,
        description: sanitized_description,
        categories: &category_refs,
        geom_geojson: &geojson,
        length_km,
        waypoints: waypoints_json,
        segment_meta: request.segment_meta.clone(),
        hash: &hash,
        session_id: request.session_id,
        user_id,
        is_draft: request.is_draft,
        source: "editor",
    })
    .await
    .map_err(|e| {
        error!(?e, "failed to insert track from editor");
        AppError::Internal(e.into())
    })?;

    metrics::observe_track_length_km("editor", length_km);

    info!(
        track_id = %track_id,
        length_km,
        is_draft = request.is_draft,
        "track created from editor"
    );

    metrics::observe_track_pipeline_latency("editor_create", start.elapsed().as_secs_f64());

    Ok(TrackUploadResponse {
        id: track_id,
        url: format!("/tracks/{track_id}"),
    })
}

/// Update geometry of an existing track.
#[tracing::instrument(skip(request), fields(endpoint = "update_track_geometry", track_id = %track_id))]
pub async fn update_track_geometry(
    pool: &Arc<PgPool>,
    track_id: Uuid,
    request: UpdateTrackGeometryRequest,
) -> Result<()> {
    let start = Instant::now();

    let (geojson, length_km) = validate_geometry(&request.geometry)?;
    validate_segment_meta(&request.segment_meta)?;

    let waypoints_json = if request.waypoints.is_empty() {
        None
    } else {
        Some(serde_json::to_value(&request.waypoints).map_err(|e| {
            error!(?e, "failed to serialize waypoints");
            AppError::Internal(e.into())
        })?)
    };

    let hash = compute_geometry_hash(&geojson);

    db::update_track_geometry(
        pool,
        track_id,
        &geojson,
        length_km,
        waypoints_json,
        request.segment_meta.clone(),
        &hash,
    )
    .await
    .map_err(|e| {
        error!(?e, "failed to update track geometry");
        AppError::Internal(e.into())
    })?;

    info!(track_id = %track_id, length_km, elapsed_ms = start.elapsed().as_millis(), "track geometry updated");

    Ok(())
}

/// Duplicate an existing track.
#[tracing::instrument(skip(request), fields(endpoint = "duplicate_track", source_id = %source_id))]
pub async fn duplicate_track(
    pool: &Arc<PgPool>,
    source_id: Uuid,
    request: DuplicateTrackRequest,
    user_id: Option<Uuid>,
) -> Result<TrackUploadResponse> {
    let new_id = db::duplicate_track(pool, source_id, request.name, request.session_id, user_id)
        .await
        .map_err(|e| {
            error!(?e, "failed to duplicate track");
            match e {
                sqlx::Error::RowNotFound => AppError::NotFound,
                other => AppError::Database(other),
            }
        })?;

    info!(source_id = %source_id, new_id = %new_id, "track duplicated");

    Ok(TrackUploadResponse {
        id: new_id,
        url: format!("/tracks/{new_id}"),
    })
}

fn validate_create_request(request: &CreateTrackFromEditorRequest) -> Result<()> {
    // Name is required
    if request.name.trim().is_empty() {
        warn!("track name is empty");
        return Err(AppError::BadRequest("track name is required".into()));
    }
    validate_track_fields(
        Some(&request.name),
        request.description.as_deref(),
        &request.categories,
    )?;

    if request.waypoints.len() > MAX_WAYPOINTS {
        warn!(count = request.waypoints.len(), "too many waypoints");
        return Err(AppError::BadRequest("too many waypoints".into()));
    }

    // Validate waypoint coordinates
    for wp in &request.waypoints {
        if !is_valid_coordinate(wp.lat, wp.lon) {
            warn!(lat = wp.lat, lon = wp.lon, "invalid waypoint coordinate");
            return Err(AppError::BadRequest("invalid waypoint coordinate".into()));
        }
    }

    validate_segment_meta(&request.segment_meta)?;

    Ok(())
}

fn validate_segment_meta(segment_meta: &Option<serde_json::Value>) -> Result<()> {
    let Some(value) = segment_meta else {
        return Ok(());
    };

    let Some(list) = value.as_array() else {
        warn!(
            reason = "segment_meta_not_array",
            "segment_meta must be array"
        );
        return Err(AppError::BadRequest("segment_meta must be array".into()));
    };

    if list.len() > MAX_SEGMENTS {
        warn!(count = list.len(), "too many segment meta entries");
        return Err(AppError::BadRequest("too many segment meta entries".into()));
    }

    for entry in list {
        let Some(obj) = entry.as_object() else {
            warn!(
                reason = "segment_meta_not_object",
                "segment_meta entry must be object"
            );
            return Err(AppError::BadRequest(
                "segment_meta entry must be object".into(),
            ));
        };

        if let Some(name) = obj.get("name").and_then(|v| v.as_str())
            && name.len() > 80
        {
            warn!(
                reason = "segment_name_too_long",
                len = name.len(),
                "segment name too long"
            );
            return Err(AppError::BadRequest("segment name too long".into()));
        }

        if let Some(color) = obj.get("color").and_then(|v| v.as_str())
            && !is_valid_hex_color(color)
        {
            warn!(
                reason = "segment_color_invalid",
                color, "segment color invalid"
            );
            return Err(AppError::BadRequest("invalid segment color".into()));
        }
    }

    Ok(())
}

fn validate_geometry(geometry: &serde_json::Value) -> Result<(serde_json::Value, f64)> {
    let geom_type = geometry
        .get("type")
        .and_then(|t| t.as_str())
        .ok_or_else(|| {
            warn!("geometry missing type field");
            AppError::BadRequest("geometry missing type field".into())
        })?;

    match geom_type {
        "LineString" | "MultiLineString" => {}
        other => {
            warn!(geom_type = other, "unsupported geometry type");
            return Err(AppError::BadRequest(format!(
                "unsupported geometry type: {other}"
            )));
        }
    }

    let segments = extract_segments_from_geojson(geometry).map_err(|e| {
        warn!(error = %e, "failed to extract segments from geometry");
        AppError::BadRequest(format!("invalid geometry: {e}"))
    })?;

    if segments.is_empty() {
        warn!("geometry has no segments");
        return Err(AppError::BadRequest("geometry has no segments".into()));
    }

    // Validate total point count
    let total_points: usize = segments.iter().map(|s| s.len()).sum();
    if total_points < 2 {
        warn!(total_points, "track must have at least 2 points");
        return Err(AppError::BadRequest(
            "track must have at least 2 points".into(),
        ));
    }
    if total_points > MAX_TRACK_POINTS {
        warn!(total_points, "track exceeds maximum point count");
        return Err(AppError::BadRequest(
            "track exceeds maximum point count".into(),
        ));
    }

    if segments.len() > MAX_SEGMENTS {
        warn!(count = segments.len(), "too many segments");
        return Err(AppError::BadRequest("too many segments".into()));
    }

    // Validate each segment has at least 2 points
    for (i, seg) in segments.iter().enumerate() {
        if seg.len() < 2 {
            warn!(
                segment = i,
                points = seg.len(),
                "segment must have at least 2 points"
            );
            return Err(AppError::BadRequest(format!(
                "segment {i} must have at least 2 points"
            )));
        }
        // Validate coordinate ranges
        for &(lat, lon) in seg {
            if !is_valid_coordinate(lat, lon) {
                warn!(lat, lon, "invalid coordinate in geometry");
                return Err(AppError::BadRequest(
                    "invalid coordinate in geometry".into(),
                ));
            }
        }
    }

    let length_km = length_km_for_segments(&segments);

    // Rebuild a normalized GeoJSON from the validated segments
    let geojson = geojson_from_segments(&segments);

    Ok((geojson, length_km))
}

fn compute_geometry_hash(geojson: &serde_json::Value) -> String {
    use sha2::{Digest, Sha256};
    let bytes = serde_json::to_vec(geojson).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    hex::encode(hasher.finalize())
}

/// Validate lat/lon coordinate ranges.
fn is_valid_coordinate(lat: f64, lon: f64) -> bool {
    (-90.0..=90.0).contains(&lat)
        && (-180.0..=180.0).contains(&lon)
        && lat.is_finite()
        && lon.is_finite()
}

fn is_valid_hex_color(value: &str) -> bool {
    if value.len() != 7 || !value.starts_with('#') {
        return false;
    }
    value.chars().skip(1).all(|c| c.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_is_valid_coordinate() {
        assert!(is_valid_coordinate(55.0, 37.0));
        assert!(is_valid_coordinate(-90.0, -180.0));
        assert!(is_valid_coordinate(90.0, 180.0));
        assert!(!is_valid_coordinate(91.0, 37.0));
        assert!(!is_valid_coordinate(55.0, 181.0));
        assert!(!is_valid_coordinate(f64::NAN, 37.0));
        assert!(!is_valid_coordinate(55.0, f64::INFINITY));
    }

    #[test]
    fn test_waypoint_input_deserialize() {
        let json = r#"{"lat": 55.0, "lon": 37.0, "index": 5}"#;
        let wp: WaypointInput = serde_json::from_str(json).unwrap();
        assert!((wp.lat - 55.0).abs() < f64::EPSILON);
        assert!((wp.lon - 37.0).abs() < f64::EPSILON);
        assert_eq!(wp.index, Some(5));
    }

    #[test]
    fn test_waypoint_input_without_index() {
        let json = r#"{"lat": 55.0, "lon": 37.0}"#;
        let wp: WaypointInput = serde_json::from_str(json).unwrap();
        assert_eq!(wp.index, None);
    }

    #[test]
    fn test_create_request_deserialize() {
        let json = json!({
            "name": "Test Track",
            "geometry": {
                "type": "LineString",
                "coordinates": [[37.0, 55.0], [37.1, 55.1]]
            },
            "waypoints": [
                {"lat": 55.0, "lon": 37.0, "index": 0},
                {"lat": 55.1, "lon": 37.1, "index": 1}
            ]
        });
        let request: CreateTrackFromEditorRequest = serde_json::from_value(json).unwrap();
        assert_eq!(request.name, "Test Track");
        assert_eq!(request.waypoints.len(), 2);
        assert!(!request.is_draft);
    }

    #[test]
    fn test_geometry_hash_deterministic() {
        let geojson = json!({
            "type": "LineString",
            "coordinates": [[37.0, 55.0], [37.1, 55.1]]
        });
        let svc_hash = {
            use sha2::{Digest, Sha256};
            let bytes = serde_json::to_vec(&geojson).unwrap();
            let mut hasher = Sha256::new();
            hasher.update(&bytes);
            hex::encode(hasher.finalize())
        };
        // Same input should produce same hash
        let svc_hash2 = {
            use sha2::{Digest, Sha256};
            let bytes = serde_json::to_vec(&geojson).unwrap();
            let mut hasher = Sha256::new();
            hasher.update(&bytes);
            hex::encode(hasher.finalize())
        };
        assert_eq!(svc_hash, svc_hash2);
        assert!(!svc_hash.is_empty());
    }

    #[test]
    fn test_coordinate_validation_edge_cases() {
        assert!(is_valid_coordinate(0.0, 0.0));
        assert!(!is_valid_coordinate(f64::NEG_INFINITY, 0.0));
        assert!(!is_valid_coordinate(0.0, f64::NAN));
    }

    #[test]
    fn test_create_request_default_fields() {
        let json = json!({
            "name": "Minimal Track",
            "geometry": {
                "type": "LineString",
                "coordinates": [[37.0, 55.0], [37.1, 55.1]]
            }
        });
        let request: CreateTrackFromEditorRequest = serde_json::from_value(json).unwrap();
        assert!(!request.is_draft);
        assert!(request.categories.is_empty());
        assert!(request.waypoints.is_empty());
        assert!(request.pois.is_empty());
        assert!(request.description.is_none());
        assert!(request.session_id.is_none());
    }

    #[test]
    fn test_create_request_with_all_fields() {
        let session_id = Uuid::new_v4();
        let json = json!({
            "name": "Full Track",
            "description": "A description",
            "categories": ["hiking", "walking"],
            "geometry": {
                "type": "MultiLineString",
                "coordinates": [[[37.0, 55.0], [37.1, 55.1]]]
            },
            "waypoints": [
                {"lat": 55.0, "lon": 37.0, "index": 0}
            ],
            "pois": [
                {"lat": 55.0, "lon": 37.0, "name": "Start", "description": "Start point", "category": "viewpoint"}
            ],
            "session_id": session_id.to_string(),
            "is_draft": true
        });
        let request: CreateTrackFromEditorRequest = serde_json::from_value(json).unwrap();
        assert_eq!(request.name, "Full Track");
        assert_eq!(request.description.as_deref(), Some("A description"));
        assert_eq!(request.categories.len(), 2);
        assert!(request.is_draft);
        assert_eq!(request.session_id, Some(session_id));
        assert_eq!(request.pois.len(), 1);
        assert_eq!(request.pois[0].name, "Start");
    }

    #[test]
    fn test_update_geometry_request_deserialize() {
        let json = json!({
            "geometry": {
                "type": "LineString",
                "coordinates": [[37.0, 55.0], [37.1, 55.1]]
            },
            "waypoints": [
                {"lat": 55.0, "lon": 37.0}
            ]
        });
        let request: UpdateTrackGeometryRequest = serde_json::from_value(json).unwrap();
        assert_eq!(request.waypoints.len(), 1);
        assert!(request.session_id.is_none());
    }

    #[test]
    fn test_duplicate_request_deserialize() {
        let json = json!({
            "name": "Copy of Track"
        });
        let request: DuplicateTrackRequest = serde_json::from_value(json).unwrap();
        assert_eq!(request.name.as_deref(), Some("Copy of Track"));
        assert!(request.session_id.is_none());
    }

    #[test]
    fn test_duplicate_request_minimal() {
        let json = json!({});
        let request: DuplicateTrackRequest = serde_json::from_value(json).unwrap();
        assert!(request.name.is_none());
        assert!(request.session_id.is_none());
    }

    #[test]
    fn test_waypoint_serialize_roundtrip() {
        let wp = WaypointInput {
            lat: 55.7558,
            lon: 37.6173,
            index: Some(42),
        };
        let json_str = serde_json::to_string(&wp).unwrap();
        let wp2: WaypointInput = serde_json::from_str(&json_str).unwrap();
        assert!((wp2.lat - 55.7558).abs() < f64::EPSILON);
        assert!((wp2.lon - 37.6173).abs() < f64::EPSILON);
        assert_eq!(wp2.index, Some(42));
    }

    #[test]
    fn test_coordinate_boundary_values() {
        // Exact boundaries
        assert!(is_valid_coordinate(90.0, 180.0));
        assert!(is_valid_coordinate(-90.0, -180.0));
        // Just over boundary
        assert!(!is_valid_coordinate(90.001, 0.0));
        assert!(!is_valid_coordinate(0.0, 180.001));
        assert!(!is_valid_coordinate(-90.001, 0.0));
        assert!(!is_valid_coordinate(0.0, -180.001));
    }
}
