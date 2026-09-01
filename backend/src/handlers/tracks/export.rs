//! GPX export handler.
//!
//! GET /api/tracks/{id}/export

use axum::{
    extract::{Path, State},
    http::HeaderMap,
    response::IntoResponse,
};

use sqlx::PgPool;
use std::sync::Arc;

use crate::db;
use crate::error::{AppError, Result};
use crate::metrics;
use crate::services::gpx_export;

/// Export a track as GPX.
///
/// GET /api/tracks/{id}/export
///
/// Returns a downloadable GPX file with full track data.
pub async fn export_track_gpx(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
) -> Result<impl IntoResponse> {
    let track = db::get_track_detail(&pool, track_id)
        .await?
        .ok_or(AppError::NotFound)?;

    let gpx_content = gpx_export::generate_gpx(&track);
    let filename = gpx_export::sanitize_filename(&track.name);

    metrics::record_track_export("gpx");
    metrics::observe_track_export_duration("gpx", 0.0);

    let mut headers = HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        "application/gpx+xml".parse().unwrap(),
    );
    headers.insert(
        axum::http::header::CONTENT_DISPOSITION,
        format!("attachment; filename=\"{}.gpx\"", filename)
            .parse()
            .unwrap(),
    );

    Ok((headers, gpx_content))
}
