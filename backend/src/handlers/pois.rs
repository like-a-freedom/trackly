//! POI HTTP handlers.
//!
//! Stage 1c: handlers call `db::pois`; no raw SQL lives here.

use crate::db;
use crate::error::{AppError, Result};
use crate::input_validation::{
    MAX_CATEGORY_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, validate_text_field,
};
use crate::metrics;
use crate::models::{CreatePoiRequest, DeletePoiRequest, Poi, PoiListResponse, PoiQuery};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::info;
use uuid::Uuid;

pub async fn get_pois(
    State(pool): State<Arc<PgPool>>,
    Query(params): Query<PoiQuery>,
) -> Result<Json<PoiListResponse>> {
    let limit = params.limit.unwrap_or(100).min(1000);
    let offset = params.offset.unwrap_or(0);

    // Build query based on filters
    let pois = if let Some(bbox_str) = &params.bbox {
        // Parse bbox: "minLon,minLat,maxLon,maxLat"
        let bbox_parts: Vec<f64> = bbox_str.split(',').filter_map(|s| s.parse().ok()).collect();

        if bbox_parts.len() != 4 {
            return Err(AppError::BadRequest("invalid bbox format".into()));
        }

        db::find_by_bbox(
            &pool,
            bbox_parts[0],
            bbox_parts[1],
            bbox_parts[2],
            bbox_parts[3],
            limit,
            offset,
        )
        .await?
    } else if let Some(track_id) = params.track_id {
        db::find_by_track_id(&pool, track_id, limit, offset).await?
    } else {
        db::list_all(&pool, limit, offset).await?
    };

    let total = db::count_all(&pool).await?;

    Ok(Json(PoiListResponse { pois, total }))
}

/// GET /pois/:id - Get POI details
pub async fn get_poi(State(pool): State<Arc<PgPool>>, Path(id): Path<i32>) -> Result<Json<Poi>> {
    let poi = db::get(&pool, id).await?.ok_or(AppError::NotFound)?;
    Ok(Json(poi))
}

/// PATCH /pois/:id - Update POI details
pub async fn update_poi(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<i32>,
    Json(request): Json<crate::models::UpdatePoiRequest>,
) -> Result<Json<Poi>> {
    let has_changes =
        request.name.is_some() || request.description.is_some() || request.category.is_some();
    if !has_changes {
        return Err(AppError::BadRequest("no changes provided".into()));
    }

    if let Some(name) = request.name.as_deref() {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest("name cannot be empty".into()));
        }
        validate_text_field(name, MAX_NAME_LENGTH, "name")?;
    }

    if let Some(Some(desc)) = request.description.as_ref() {
        validate_text_field(desc, MAX_DESCRIPTION_LENGTH, "description")?;
    }

    if let Some(Some(cat)) = request.category.as_ref() {
        validate_text_field(cat, MAX_CATEGORY_LENGTH, "category")?;
    }

    let owner = db::owner_session_id(&pool, id)
        .await?
        .ok_or(AppError::NotFound)?;

    if let Some(owner) = owner
        && Some(owner) != request.session_id
    {
        return Err(AppError::Forbidden);
    }

    let poi = db::update(&pool, id, &request).await?;

    info!("Updated POI {}", poi.id);
    Ok(Json(poi))
}

/// GET /tracks/:track_id/pois - Get POIs for a track with distance info
pub async fn get_track_pois(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<Uuid>,
) -> Result<Json<Vec<crate::models::PoiWithDistance>>> {
    let pois = db::find_by_track_with_distance(&pool, track_id).await?;
    Ok(Json(pois))
}

/// POST /pois - Create manual POI
pub async fn create_poi(
    State(pool): State<Arc<PgPool>>,
    Json(request): Json<CreatePoiRequest>,
) -> Result<Json<Poi>> {
    // Validate inputs
    if request.name.trim().is_empty() {
        return Err(AppError::BadRequest("POI name cannot be empty".into()));
    }

    validate_text_field(&request.name, MAX_NAME_LENGTH, "name")?;

    if let Some(ref desc) = request.description {
        validate_text_field(desc, MAX_DESCRIPTION_LENGTH, "description")?;
    }

    let poi = db::create(&pool, &request).await?;

    info!("Created POI {} (id: {})", poi.name, poi.id);
    metrics::record_poi_created("manual");
    Ok(Json(poi))
}

/// DELETE /tracks/:track_id/pois/:poi_id - Unlink POI from track
pub async fn unlink_track_poi(
    State(pool): State<Arc<PgPool>>,
    Path((track_id, poi_id)): Path<(Uuid, i32)>,
) -> Result<StatusCode> {
    let affected = db::unlink_from_track(&pool, track_id, poi_id).await?;

    if affected == 0 {
        return Err(AppError::NotFound);
    }

    info!("Unlinked POI {} from track {}", poi_id, track_id);
    metrics::record_poi_deleted("unlink_track");
    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /pois/:id - Delete POI (only if not used and user is owner)
pub async fn delete_poi(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<i32>,
    Json(request): Json<DeletePoiRequest>,
) -> Result<StatusCode> {
    // Check ownership and usage
    let owner = db::owner_session_id(&pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    let usage_count = db::usage_count(&pool, id).await?;

    // Only allow deletion if:
    // 1. POI is not used in any track
    // 2. User is the owner (session_id matches) or POI has no owner (auto-created)
    if usage_count > 0 {
        return Err(AppError::Conflict("POI is in use".into()));
    }

    if let Some(owner_session_id) = owner
        && Some(owner_session_id) != request.session_id
    {
        return Err(AppError::Forbidden);
    }

    db::delete(&pool, id).await?;

    info!("Deleted POI {}", id);
    metrics::record_poi_deleted("delete_poi");
    Ok(StatusCode::NO_CONTENT)
}
