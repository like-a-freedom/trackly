//! Slope profile and recalculation handlers.
//!
//! - GET  /api/tracks/{id}/slope-profile     → get_track_slope_profile
//! - POST /api/tracks/{id}/recalculate-slopes → recalculate_track_slopes

use axum::{
    Json,
    extract::{Path, State},
};

use sqlx::PgPool;
use std::sync::Arc;
use tracing::info;

use crate::db;
use crate::error::{AppError, Result};
use crate::track_utils::{
    can_calculate_slopes, extract_segments_from_geojson, recalculate_slope_metrics,
};

/// Get the slope profile for a track.
///
/// GET /api/tracks/{id}/slope-profile
///
/// Returns slope histogram and slope segments for the track.
pub async fn get_track_slope_profile(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>> {
    let track = db::get_track_detail(&pool, track_id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(serde_json::json!({
        "id": track_id.to_string(),
        "slope_min": track.slope_min,
        "slope_max": track.slope_max,
        "slope_avg": track.slope_avg,
        "slope_histogram": track.slope_histogram,
        "slope_segments": track.slope_segments,
    })))
}

/// Recalculate slope metrics for a track.
///
/// POST /api/tracks/{id}/recalculate-slopes
///
/// Re-derives slope data from the geometry and elevation profile,
/// then persists the results.
pub async fn recalculate_track_slopes(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>> {
    let track = db::get_track_detail(&pool, track_id)
        .await?
        .ok_or(AppError::NotFound)?;

    let segments = extract_segments_from_geojson(&track.geom_geojson)
        .map_err(|e| AppError::BadRequest(format!("Invalid geometry: {e}")))?;

    // Flatten segments into a single list of coordinates
    let coords: Vec<(f64, f64)> = segments.into_iter().flatten().collect();

    // Convert elevation profile to Option<f64> format for can_calculate_slopes
    let elevation_option: Vec<Option<f64>> = track
        .elevation_profile
        .as_ref()
        .and_then(|p| p.as_array())
        .map(|arr| arr.iter().map(|v| v.as_f64()).collect::<Vec<_>>())
        .unwrap_or_default();

    let elevation_f64: Vec<f64> = elevation_option.iter().filter_map(|e| *e).collect();

    if !can_calculate_slopes(&coords, &elevation_option) {
        return Err(AppError::BadRequest(
            "Insufficient data to calculate slopes (need geometry with elevation profile)".into(),
        ));
    }

    let slope_metrics = recalculate_slope_metrics(&coords, &elevation_f64, &track.name);

    // Persist the new slope data
    db::update_track_slope(
        &pool,
        track_id,
        db::UpdateSlopeParams {
            slope_min: slope_metrics.slope_min,
            slope_max: slope_metrics.slope_max,
            slope_avg: slope_metrics.slope_avg,
            slope_histogram: slope_metrics.slope_histogram,
            slope_segments: slope_metrics.slope_segments,
        },
    )
    .await?;

    info!(track_id = %track_id, "slope metrics recalculated");

    Ok(Json(serde_json::json!({
        "id": track_id.to_string(),
        "slope_min": slope_metrics.slope_min,
        "slope_max": slope_metrics.slope_max,
        "slope_avg": slope_metrics.slope_avg,
        "message": "Slope metrics recalculated successfully"
    })))
}
