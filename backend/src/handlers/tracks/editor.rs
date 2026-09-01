//! Track editor handlers.
//!
//! - POST /api/tracks/create              → create_track_from_editor
//! - PUT  /api/tracks/{id}/geometry       → update_track_geometry
//! - POST /api/tracks/{id}/duplicate      → duplicate_track

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};

use sqlx::PgPool;
use std::sync::Arc;

use crate::auth::OptionalAuthUser;
use crate::error::Result;
use crate::models::TrackUploadResponse;
use crate::services::track_editor;
use crate::services::track_editor::{
    CreateTrackFromEditorRequest, DuplicateTrackRequest, UpdateTrackGeometryRequest,
};

/// Create a track from editor-drawn geometry.
///
/// POST /api/tracks/create
///
/// Accepts GeoJSON geometry, waypoints, categories, etc. from the track editor.
pub async fn create_track_from_editor(
    State(pool): State<Arc<PgPool>>,
    auth_user: OptionalAuthUser,
    Json(request): Json<CreateTrackFromEditorRequest>,
) -> Result<(StatusCode, Json<TrackUploadResponse>)> {
    let user_id = auth_user.user().map(|u| u.user_id);

    let response = track_editor::create_track(&pool, request, user_id).await?;

    Ok((StatusCode::CREATED, Json(response)))
}

/// Update an existing track's geometry.
///
/// PUT /api/tracks/{id}/geometry
///
/// Replaces the track geometry with new editor-provided data.
pub async fn update_track_geometry(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
    Json(request): Json<UpdateTrackGeometryRequest>,
) -> Result<Json<serde_json::Value>> {
    track_editor::update_track_geometry(&pool, track_id, request).await?;

    Ok(Json(serde_json::json!({
        "id": track_id.to_string(),
        "message": "Track geometry updated"
    })))
}

/// Duplicate a track.
///
/// POST /api/tracks/{id}/duplicate
///
/// Creates a copy of the track with a new ID.
pub async fn duplicate_track(
    State(pool): State<Arc<PgPool>>,
    Path(source_id): Path<uuid::Uuid>,
    auth_user: OptionalAuthUser,
    Json(request): Json<DuplicateTrackRequest>,
) -> Result<(StatusCode, Json<TrackUploadResponse>)> {
    let user_id = auth_user.user().map(|u| u.user_id);

    let response = track_editor::duplicate_track(&pool, source_id, request, user_id).await?;

    Ok((StatusCode::CREATED, Json(response)))
}
