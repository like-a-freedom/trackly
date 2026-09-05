//! Track update / delete / visibility / bulk operations.
//!
//! - PATCH /api/tracks/{id}/description       → update_track_description
//! - PATCH /api/tracks/{id}/name              → update_track_name
//! - PATCH /api/tracks/{id}/categories        → update_track_categories
//! - PATCH /api/tracks/{id}/distance-markers  → update_track_distance_markers
//! - PATCH /api/tracks/{id}/visibility        → update_track_visibility
//! - DELETE /api/tracks/{id}                  → delete_track
//! - DELETE /api/account/tracks/bulk          → bulk_delete_tracks
//! - PATCH  /api/account/tracks/bulk/visibility → bulk_toggle_visibility

use axum::{
    Json,
    extract::{Path, State},
};

use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::info;
use uuid::Uuid;

use crate::auth::{AuthError, AuthUser, OptionalAuthUser};
use crate::db;
use crate::error::{AppError, Result};
use crate::handlers::util::verify_track_owner;
use crate::metrics;

// ─── Update handlers ────────────────────────────────────────────────────────

/// Update track description.
///
/// PATCH /api/tracks/{id}/description
pub async fn update_track_description(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
    auth_user: OptionalAuthUser,
    Json(request): Json<crate::models::UpdateTrackDescriptionRequest>,
) -> Result<Json<serde_json::Value>> {
    // Ownership check
    verify_track_owner(&pool, track_id, &auth_user, Some(request.session_id)).await?;

    db::update_track_description(&pool, track_id, &request.description).await?;

    metrics::record_track_edit("description");

    Ok(Json(serde_json::json!({
        "id": track_id.to_string(),
        "message": "Track description updated"
    })))
}

/// Update track name.
///
/// PATCH /api/tracks/{id}/name
pub async fn update_track_name(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
    auth_user: OptionalAuthUser,
    Json(request): Json<crate::models::UpdateTrackNameRequest>,
) -> Result<Json<serde_json::Value>> {
    verify_track_owner(&pool, track_id, &auth_user, Some(request.session_id)).await?;

    db::update_track_name(&pool, track_id, &request.name).await?;

    metrics::record_track_edit("name");

    Ok(Json(serde_json::json!({
        "id": track_id.to_string(),
        "message": "Track name updated"
    })))
}

/// Update track categories.
///
/// PATCH /api/tracks/{id}/categories
pub async fn update_track_categories(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
    auth_user: OptionalAuthUser,
    Json(request): Json<crate::models::UpdateTrackCategoriesRequest>,
) -> Result<Json<serde_json::Value>> {
    if request.categories.is_empty() {
        return Err(AppError::Validation(
            "At least one category is required".into(),
        ));
    }

    verify_track_owner(&pool, track_id, &auth_user, Some(request.session_id)).await?;

    db::update_track_categories(&pool, track_id, &request.categories).await?;

    metrics::record_track_category_edit("update");

    Ok(Json(serde_json::json!({
        "id": track_id.to_string(),
        "categories": request.categories,
        "message": "Track categories updated"
    })))
}

/// Update track distance markers toggle.
///
/// PATCH /api/tracks/{id}/distance-markers
pub async fn update_track_distance_markers(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
    auth_user: OptionalAuthUser,
    Json(request): Json<crate::models::UpdateTrackDistanceMarkersRequest>,
) -> Result<Json<serde_json::Value>> {
    verify_track_owner(&pool, track_id, &auth_user, Some(request.session_id)).await?;

    db::update_track_distance_markers(&pool, track_id, request.distance_markers_enabled).await?;

    Ok(Json(serde_json::json!({
        "id": track_id.to_string(),
        "distance_markers_enabled": request.distance_markers_enabled,
        "message": "Track distance markers updated"
    })))
}

// ─── Visibility handlers ────────────────────────────────────────────────────

/// Request for track visibility update.
#[derive(Debug, Deserialize)]
pub struct UpdateVisibilityRequest {
    pub is_public: bool,
    pub session_id: Option<Uuid>,
}

/// Update track visibility.
///
/// PATCH /api/tracks/{id}/visibility
///
/// Implements FR-TRACK-003: Track Visibility Control.
/// Supports both authenticated users and anonymous session-based ownership.
pub async fn update_track_visibility(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
    auth_user: OptionalAuthUser,
    Json(request): Json<UpdateVisibilityRequest>,
) -> Result<Json<serde_json::Value>> {
    // Verify ownership via authenticated user or session_id
    verify_track_owner(&pool, track_id, &auth_user, request.session_id).await?;

    db::update_track_visibility(
        &pool,
        track_id,
        auth_user.user_id(),
        request.session_id,
        request.is_public,
    )
    .await?;

    let user_id_str = auth_user
        .user_id()
        .map(|u| u.to_string())
        .unwrap_or_default();
    info!(
        user_id = %user_id_str,
        track_id = %track_id,
        is_public = request.is_public,
        "Track visibility updated"
    );

    Ok(Json(serde_json::json!({
        "id": track_id.to_string(),
        "is_public": request.is_public,
        "message": if request.is_public { "Track is now public" } else { "Track is now private" }
    })))
}

// ─── Delete handlers ────────────────────────────────────────────────────────

/// Delete a track.
///
/// DELETE /api/tracks/{id}
/// Body (optional): { "session_id": "<uuid>" } for anonymous ownership check
pub async fn delete_track(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
    auth_user: OptionalAuthUser,
    Json(request): Json<crate::models::DeleteTrackRequest>,
) -> Result<Json<serde_json::Value>> {
    // Ownership check
    verify_track_owner(&pool, track_id, &auth_user, request.session_id).await?;

    let rows = db::delete_track(&pool, track_id).await?;
    if rows == 0 {
        return Err(AppError::NotFound);
    }

    metrics::record_track_deleted("success");

    Ok(Json(serde_json::json!({
        "id": track_id.to_string(),
        "message": "Track deleted"
    })))
}

// ─── Bulk operations ────────────────────────────────────────────────────────

/// Request for bulk track operations.
#[derive(Debug, Deserialize)]
pub struct BulkTrackRequest {
    pub track_ids: Vec<uuid::Uuid>,
}

/// Response for bulk visibility toggle.
#[derive(Debug, Serialize)]
pub struct BulkVisibilityResponse {
    pub updated: Vec<db::BulkVisibilityResult>,
    pub count: usize,
}

/// Toggle visibility for multiple tracks at once.
///
/// PATCH /api/account/tracks/bulk/visibility
pub async fn bulk_toggle_visibility(
    State(pool): State<Arc<PgPool>>,
    auth_user: AuthUser,
    Json(request): Json<BulkTrackRequest>,
) -> Result<Json<BulkVisibilityResponse>> {
    if request.track_ids.is_empty() {
        return Ok(Json(BulkVisibilityResponse {
            updated: Vec::new(),
            count: 0,
        }));
    }

    if request.track_ids.len() > 100 {
        return Err(AppError::from(AuthError::InvalidInput(
            "Maximum 100 tracks per bulk operation".into(),
        )));
    }

    let updated =
        db::bulk_toggle_track_visibility(&pool, auth_user.user_id, &request.track_ids).await?;

    info!(
        user_id = %auth_user.user_id,
        requested = request.track_ids.len(),
        updated = updated.len(),
        "Bulk visibility toggle"
    );

    Ok(Json(BulkVisibilityResponse {
        count: updated.len(),
        updated,
    }))
}

/// Response for bulk delete.
#[derive(Debug, Serialize)]
pub struct BulkDeleteResponse {
    pub deleted: Vec<String>,
    pub count: usize,
}

/// Delete multiple tracks at once.
///
/// DELETE /api/account/tracks/bulk
pub async fn bulk_delete_tracks(
    State(pool): State<Arc<PgPool>>,
    auth_user: AuthUser,
    Json(request): Json<BulkTrackRequest>,
) -> Result<Json<BulkDeleteResponse>> {
    if request.track_ids.is_empty() {
        return Ok(Json(BulkDeleteResponse {
            deleted: Vec::new(),
            count: 0,
        }));
    }

    if request.track_ids.len() > 100 {
        return Err(AppError::from(AuthError::InvalidInput(
            "Maximum 100 tracks per bulk operation".into(),
        )));
    }

    let deleted = db::bulk_delete_tracks(&pool, auth_user.user_id, &request.track_ids).await?;
    let deleted_strings: Vec<String> = deleted.iter().map(|id| id.to_string()).collect();

    info!(
        user_id = %auth_user.user_id,
        requested = request.track_ids.len(),
        deleted = deleted.len(),
        "Bulk tracks deleted"
    );

    Ok(Json(BulkDeleteResponse {
        count: deleted_strings.len(),
        deleted: deleted_strings,
    }))
}
