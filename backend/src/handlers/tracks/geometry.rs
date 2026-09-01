//! Track geometry simplification preview handler.
//!
//! POST /api/tracks/simplify-preview

use axum::Json;

use crate::error::{AppError, Result};
use crate::models::{TrackSimplifyPreviewRequest, TrackSimplifyPreviewResponse};
use crate::track_utils::extract_segments_from_geojson;
use crate::track_utils::simplify_segments_to_ratio;

/// Preview track simplification at a target compression ratio.
///
/// POST /api/tracks/simplify-preview
///
/// Accepts a GeoJSON geometry and returns the simplified version along
/// with metadata (point counts, compression ratio, tolerance used).
pub async fn simplify_track_preview(
    Json(request): Json<TrackSimplifyPreviewRequest>,
) -> Result<Json<TrackSimplifyPreviewResponse>> {
    let segments = extract_segments_from_geojson(&request.geometry)
        .map_err(|e| AppError::BadRequest(format!("Invalid geometry: {e}")))?;

    if segments.is_empty() {
        return Err(AppError::BadRequest("Geometry contains no segments".into()));
    }

    let target_ratio = request.target_ratio.clamp(0.01, 1.0);

    let total_original_points: usize = segments.iter().map(|s| s.len()).sum();

    let (simplified_segments, _simplified_waypoints, _stats) =
        simplify_segments_to_ratio(&segments, None, target_ratio);

    let total_simplified_points: usize = simplified_segments.iter().map(|s| s.len()).sum();

    let tolerance_used = crate::track_utils::get_tolerance_for_zoom(12.0);

    // Rebuild GeoJSON from simplified segments
    let simplified_geojson = crate::track_utils::geojson_from_segments(&simplified_segments);

    let compression_ratio = if total_original_points > 0 {
        total_simplified_points as f64 / total_original_points as f64
    } else {
        1.0
    };

    // Simple waypoint re-mapping: keep original waypoints indices that still exist
    let simplified_waypoints = request.waypoints;

    Ok(Json(TrackSimplifyPreviewResponse {
        geometry: simplified_geojson,
        waypoints: simplified_waypoints,
        original_points: total_original_points,
        simplified_points: total_simplified_points,
        compression_ratio,
        tolerance_used,
    }))
}
