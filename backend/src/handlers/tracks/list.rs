//! Track listing handlers.
//!
//! - GET /api/tracks           → list_tracks_geojson
//! - GET /api/tracks/heatmap   → list_tracks_heatmap
//! - GET /api/account/tracks   → list_account_tracks

use axum::{
    Json,
    extract::{Query, State},
};

use sqlx::PgPool;
use std::sync::Arc;

use crate::auth::{AuthUser, OptionalAuthUser};
use crate::db;
use crate::error::Result;
use crate::models::{HeatmapPoint, TrackGeoJsonCollection, TrackGeoJsonQuery};

/// Query parameters for listing a user's tracks (account page).
#[derive(Debug, serde::Deserialize)]
pub struct UserTracksQuery {
    pub sort: Option<String>,
    pub order: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Response for user's track list.
#[derive(Debug, serde::Serialize)]
pub struct UserTracksResponse {
    pub tracks: Vec<db::UserTrackSummary>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

/// List tracks as GeoJSON features for the map.
///
/// GET /api/tracks?bbox=...&zoom=...&mode=...
///
/// Supports bbox filtering, zoom-based simplification, and ownership filtering.
pub async fn list_tracks_geojson(
    State(pool): State<Arc<PgPool>>,
    auth_user: OptionalAuthUser,
    Query(mut params): Query<TrackGeoJsonQuery>,
) -> Result<Json<TrackGeoJsonCollection>> {
    // Inject ownership context from authenticated user
    if let Some(user) = auth_user.user()
        && params.owner_user_id.is_none()
        && params.owner_session_id.is_none()
    {
        params.owner_user_id = Some(user.user_id);
    }

    let bbox = params.bbox.as_deref();
    let zoom = params.zoom;
    let mode = params.mode.as_deref();

    let collection = db::list_tracks_geojson(&pool, bbox, zoom, mode, &params).await?;
    Ok(Json(collection))
}

/// Get track density heatmap data.
///
/// GET /api/tracks/heatmap?bbox=...&zoom=...
///
/// Returns a grid of weighted points showing track density.
pub async fn list_tracks_heatmap(
    State(pool): State<Arc<PgPool>>,
    auth_user: OptionalAuthUser,
    Query(mut params): Query<TrackGeoJsonQuery>,
) -> Result<Json<Vec<HeatmapPoint>>> {
    // Inject ownership context
    if let Some(user) = auth_user.user()
        && params.owner_user_id.is_none()
        && params.owner_session_id.is_none()
    {
        params.owner_user_id = Some(user.user_id);
    }

    let bbox = params.bbox.as_deref();
    let zoom = params.zoom;

    let points = db::list_tracks_heatmap(&pool, bbox, zoom, &params).await?;
    Ok(Json(points))
}

/// List user's tracks (account page).
///
/// GET /api/account/tracks?sort=...&order=...&limit=...&offset=...
///
/// Returns paginated list of the authenticated user's tracks.
pub async fn list_account_tracks(
    State(pool): State<Arc<PgPool>>,
    auth_user: AuthUser,
    Query(params): Query<UserTracksQuery>,
) -> Result<Json<UserTracksResponse>> {
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);

    let (tracks, total) = db::list_user_tracks(
        &pool,
        auth_user.user_id,
        params.sort.as_deref(),
        params.order.as_deref(),
        limit,
        offset,
    )
    .await?;

    Ok(Json(UserTracksResponse {
        tracks,
        total,
        limit,
        offset,
    }))
}
