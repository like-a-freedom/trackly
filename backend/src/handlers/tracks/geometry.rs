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

    let waypoints = (!request.waypoints.is_empty()).then_some(request.waypoints.as_slice());
    let (simplified_segments, simplified_waypoints, stats) =
        simplify_segments_to_ratio(&segments, waypoints, target_ratio);

    let simplified_geojson = crate::track_utils::geojson_from_segments(&simplified_segments);

    Ok(Json(TrackSimplifyPreviewResponse {
        geometry: simplified_geojson,
        waypoints: simplified_waypoints,
        original_points: stats.original_points,
        simplified_points: stats.simplified_points,
        compression_ratio: stats.compression_ratio,
        tolerance_used: stats.tolerance_used,
    }))
}
