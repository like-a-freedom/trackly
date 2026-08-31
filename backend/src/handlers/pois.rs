//! POI HTTP handlers.
//!
//! Stage 1a: stub — POI handlers lifted from `handlers/tracks.rs` with the same
//! raw SQL and error mapping. Stage 1c replaces the bodies to call `db::pois`.

use crate::error::{AppError, Result};
use crate::input_validation::{
    MAX_CATEGORY_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, validate_text_field,
};
use crate::metrics;
use crate::models::{
    CreatePoiRequest, DeletePoiRequest, Poi, PoiListResponse, PoiQuery, PoiWithDistance,
    UpdatePoiRequest,
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::{error, info};
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
            error!("Invalid bbox format: {}", bbox_str);
            return Err(AppError::BadRequest("invalid request".into()));
        }

        sqlx::query_as::<_, Poi>(
            r#"
            SELECT 
                id, name, description, category, elevation,
                ST_AsGeoJSON(geom::geometry)::jsonb as geom,
                session_id, created_at, updated_at
            FROM pois
            WHERE ST_Intersects(
                geom::geometry, 
                ST_MakeEnvelope($1, $2, $3, $4, 4326)
            )
            ORDER BY created_at DESC
            LIMIT $5
            OFFSET $6
            "#,
        )
        .bind(bbox_parts[0])
        .bind(bbox_parts[1])
        .bind(bbox_parts[2])
        .bind(bbox_parts[3])
        .bind(limit)
        .bind(offset)
        .fetch_all(&*pool)
        .await?
    } else if let Some(track_id) = params.track_id {
        // Get POIs for a specific track
        sqlx::query_as::<_, Poi>(
            r#"
            SELECT 
                p.id, p.name, p.description, p.category, p.elevation,
                ST_AsGeoJSON(p.geom::geometry)::jsonb as geom,
                p.session_id, p.created_at, p.updated_at
            FROM pois p
            JOIN track_pois tp ON p.id = tp.poi_id
            WHERE tp.track_id = $1
            ORDER BY tp.sequence_order
            LIMIT $2
            OFFSET $3
            "#,
        )
        .bind(track_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&*pool)
        .await?
    } else {
        // Get all POIs (with limit)
        sqlx::query_as::<_, Poi>(
            r#"
            SELECT 
                id, name, description, category, elevation,
                ST_AsGeoJSON(geom::geometry)::jsonb as geom,
                session_id, created_at, updated_at
            FROM pois
            ORDER BY created_at DESC
            LIMIT $1
            OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&*pool)
        .await?
    };

    let total = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM pois")
        .fetch_one(&*pool)
        .await?;

    Ok(Json(PoiListResponse { pois, total }))
}

/// GET /pois/:id - Get POI details
pub async fn get_poi(State(pool): State<Arc<PgPool>>, Path(id): Path<i32>) -> Result<Json<Poi>> {
    let poi = sqlx::query_as::<_, Poi>(
        r#"
        SELECT 
            id, name, description, category, elevation,
            ST_AsGeoJSON(geom::geometry)::jsonb as geom,
            session_id, created_at, updated_at
        FROM pois
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&*pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(poi))
}

/// PATCH /pois/:id - Update POI details
pub async fn update_poi(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<i32>,
    Json(request): Json<UpdatePoiRequest>,
) -> Result<Json<Poi>> {
    let has_changes =
        request.name.is_some() || request.description.is_some() || request.category.is_some();
    if !has_changes {
        return Err(AppError::BadRequest("invalid request".into()));
    }

    if let Some(name) = request.name.as_deref() {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest("invalid request".into()));
        }
        validate_text_field(name, MAX_NAME_LENGTH, "name")?;
    }

    if let Some(Some(desc)) = request.description.as_ref() {
        validate_text_field(desc, MAX_DESCRIPTION_LENGTH, "description")?;
    }

    if let Some(Some(cat)) = request.category.as_ref() {
        validate_text_field(cat, MAX_CATEGORY_LENGTH, "category")?;
    }

    let owner_session_id: Option<Uuid> = sqlx::query_scalar(
        r#"
        SELECT session_id
        FROM pois
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&*pool)
    .await?
    .ok_or(AppError::NotFound)?;

    if let Some(owner) = owner_session_id
        && Some(owner) != request.session_id
    {
        return Err(AppError::Forbidden);
    }

    let name_provided = request.name.is_some();
    let desc_provided = request.description.is_some();
    let cat_provided = request.category.is_some();

    let name_value = request.name.as_ref().map(|v| v.trim().to_string());
    let desc_value = request
        .description
        .clone()
        .flatten()
        .map(|v| v.trim().to_string());
    let cat_value = request
        .category
        .clone()
        .flatten()
        .map(|v| v.trim().to_string());

    let poi = sqlx::query_as::<_, Poi>(
        r#"
        UPDATE pois
        SET
            name = CASE WHEN $2 THEN $3 ELSE name END,
            description = CASE WHEN $4 THEN $5 ELSE description END,
            category = CASE WHEN $6 THEN $7 ELSE category END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
            id, name, description, category, elevation,
            ST_AsGeoJSON(geom::geometry)::jsonb as geom,
            session_id, created_at, updated_at
        "#,
    )
    .bind(id)
    .bind(name_provided)
    .bind(name_value)
    .bind(desc_provided)
    .bind(desc_value)
    .bind(cat_provided)
    .bind(cat_value)
    .fetch_one(&*pool)
    .await?;

    info!("Updated POI {}", poi.id);
    Ok(Json(poi))
}

/// GET /tracks/:track_id/pois - Get POIs for a track with distance info
pub async fn get_track_pois(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<Uuid>,
) -> Result<Json<Vec<PoiWithDistance>>> {
    let rows = sqlx::query(
        r#"
        SELECT 
            p.id, p.name, p.description, p.category, p.elevation,
            ST_AsGeoJSON(p.geom::geometry)::jsonb as geom,
            p.session_id, p.created_at, p.updated_at,
            tp.distance_from_start_m, tp.sequence_order
        FROM pois p
        JOIN track_pois tp ON p.id = tp.poi_id
        WHERE tp.track_id = $1
        ORDER BY tp.sequence_order
        "#,
    )
    .bind(track_id)
    .fetch_all(&*pool)
    .await?;

    let pois: Vec<PoiWithDistance> = rows
        .into_iter()
        .map(|row| {
            use sqlx::Row;
            PoiWithDistance {
                poi: Poi {
                    id: row.get("id"),
                    name: row.get("name"),
                    description: row.get("description"),
                    category: row.get("category"),
                    elevation: row.get("elevation"),
                    geom: row.get("geom"),
                    session_id: row.get("session_id"),
                    created_at: row.get("created_at"),
                    updated_at: row.get("updated_at"),
                },
                distance_from_start_m: row.get("distance_from_start_m"),
                sequence_order: row.get("sequence_order"),
            }
        })
        .collect();

    Ok(Json(pois))
}

/// POST /pois - Create manual POI
pub async fn create_poi(
    State(pool): State<Arc<PgPool>>,
    Json(request): Json<CreatePoiRequest>,
) -> Result<Json<Poi>> {
    // Validate inputs
    if request.name.trim().is_empty() {
        error!("POI name cannot be empty");
        return Err(AppError::BadRequest("invalid request".into()));
    }

    validate_text_field(&request.name, MAX_NAME_LENGTH, "name")?;

    if let Some(ref desc) = request.description {
        validate_text_field(desc, MAX_DESCRIPTION_LENGTH, "description")?;
    }

    let poi = sqlx::query_as::<_, Poi>(
        r#"
        INSERT INTO pois (name, description, category, elevation, geom, session_id)
        VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7)
        RETURNING 
            id, name, description, category, elevation,
            ST_AsGeoJSON(geom::geometry)::jsonb as geom,
            session_id, created_at, updated_at
        "#,
    )
    .bind(request.name.trim())
    .bind(request.description)
    .bind(request.category)
    .bind(request.elevation)
    .bind(request.lon)
    .bind(request.lat)
    .bind(request.session_id)
    .fetch_one(&*pool)
    .await?;

    info!("Created POI {} (id: {})", poi.name, poi.id);
    metrics::record_poi_created("manual");
    Ok(Json(poi))
}

/// DELETE /tracks/:track_id/pois/:poi_id - Unlink POI from track
pub async fn unlink_track_poi(
    State(pool): State<Arc<PgPool>>,
    Path((track_id, poi_id)): Path<(Uuid, i32)>,
) -> Result<StatusCode> {
    let result = sqlx::query("DELETE FROM track_pois WHERE track_id = $1 AND poi_id = $2")
        .bind(track_id)
        .bind(poi_id)
        .execute(&*pool)
        .await?;

    if result.rows_affected() == 0 {
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
    let poi_info = sqlx::query(
        r#"
        SELECT 
            session_id,
            (SELECT COUNT(*) FROM track_pois WHERE poi_id = $1) as usage_count
        FROM pois
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&*pool)
    .await?
    .ok_or(AppError::NotFound)?;

    use sqlx::Row;
    let usage_count: i64 = poi_info.get("usage_count");
    let owner_id: Option<Uuid> = poi_info.get("session_id");

    // Only allow deletion if:
    // 1. POI is not used in any track
    // 2. User is the owner (session_id matches) or POI has no owner (auto-created)
    if usage_count > 0 {
        error!("Cannot delete POI {}: used in {} tracks", id, usage_count);
        return Err(AppError::Conflict("POI is in use".into()));
    }

    if let Some(owner_session_id) = owner_id
        && Some(owner_session_id) != request.session_id
    {
        error!("Cannot delete POI {}: not the owner", id);
        return Err(AppError::Forbidden); // 403: Not the owner
    }

    sqlx::query("DELETE FROM pois WHERE id = $1")
        .bind(id)
        .execute(&*pool)
        .await?;

    info!("Deleted POI {}", id);
    metrics::record_poi_deleted("delete_poi");
    Ok(StatusCode::NO_CONTENT)
}
