//! Track detail handlers.
//!
//! - GET /api/tracks/{id}              → get_track (adaptive simplification)
//! - GET /api/tracks/{id}/simplified   → get_track_simplified

use axum::{
    Json,
    extract::{Path, Query, State},
};

use sqlx::PgPool;
use std::sync::Arc;

use crate::db;
use crate::error::{AppError, Result};
use crate::models::{TrackDetail, TrackSimplificationQuery};

/// Get track detail with adaptive simplification based on zoom level.
///
/// GET /api/tracks/{id}?zoom=...&mode=...
///
/// Geometry and chart data are simplified on-the-fly based on the
/// requested zoom level and mode (overview vs. detail).
pub async fn get_track(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
    Query(params): Query<TrackSimplificationQuery>,
) -> Result<Json<TrackDetail>> {
    let track = db::get_track_detail_adaptive(&pool, track_id, params.zoom, params.mode.as_deref())
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(track))
}

/// Get track detail with full geometry (no simplification).
///
/// GET /api/tracks/{id}/simplified
///
/// Returns the complete track data for export or detailed analysis.
pub async fn get_track_simplified(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
) -> Result<Json<TrackDetail>> {
    let track = db::get_track_detail(&pool, track_id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(track))
}
