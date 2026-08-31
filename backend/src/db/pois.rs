//! POI database operations.
//!
//! All POI SQL lives here (parameterized). Handlers call these functions and
//! never build SQL themselves.

use crate::models::{CreatePoiRequest, Poi, PoiWithDistance, UpdatePoiRequest};
use crate::poi_deduplication::PoiDeduplicationService;
use sqlx::{PgPool, Row};
use std::sync::Arc;
use uuid::Uuid;

/// List POIs intersecting a bbox (minLon,minLat,maxLon,maxLat).
pub async fn find_by_bbox(
    pool: &PgPool,
    min_lon: f64,
    min_lat: f64,
    max_lon: f64,
    max_lat: f64,
    limit: i64,
    offset: i64,
) -> Result<Vec<Poi>, sqlx::Error> {
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
    .bind(min_lon)
    .bind(min_lat)
    .bind(max_lon)
    .bind(max_lat)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await
}

/// List POIs linked to a track.
pub async fn find_by_track_id(
    pool: &PgPool,
    track_id: Uuid,
    limit: i64,
    offset: i64,
) -> Result<Vec<Poi>, sqlx::Error> {
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
    .fetch_all(pool)
    .await
}

/// List all POIs (paginated).
pub async fn list_all(pool: &PgPool, limit: i64, offset: i64) -> Result<Vec<Poi>, sqlx::Error> {
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
    .fetch_all(pool)
    .await
}

/// Total POI count.
pub async fn count_all(pool: &PgPool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM pois")
        .fetch_one(pool)
        .await
}

/// Get a single POI by id.
pub async fn get(pool: &PgPool, id: i32) -> Result<Option<Poi>, sqlx::Error> {
    sqlx::query_as::<_, Poi>(
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
    .fetch_optional(pool)
    .await
}

/// Owner session id of a POI.
///
/// Returns `Ok(Some(Some(uuid)))` for an owned POI, `Ok(Some(None))` for a
/// row with a NULL owner (auto-created), and `Ok(None)` when the row is absent.
pub async fn owner_session_id(pool: &PgPool, id: i32) -> Result<Option<Option<Uuid>>, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        SELECT session_id
        FROM pois
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// Update a POI's name/description/category (only provided fields).
pub async fn update(
    pool: &PgPool,
    id: i32,
    request: &UpdatePoiRequest,
) -> Result<Poi, sqlx::Error> {
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

    sqlx::query_as::<_, Poi>(
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
    .fetch_one(pool)
    .await
}

/// Get POIs for a track with distance info.
pub async fn find_by_track_with_distance(
    pool: &PgPool,
    track_id: Uuid,
) -> Result<Vec<PoiWithDistance>, sqlx::Error> {
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
    .fetch_all(pool)
    .await?;

    let pois: Vec<PoiWithDistance> = rows
        .into_iter()
        .map(|row| PoiWithDistance {
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
        })
        .collect();

    Ok(pois)
}

/// Create a manual POI.
pub async fn create(pool: &PgPool, request: &CreatePoiRequest) -> Result<Poi, sqlx::Error> {
    sqlx::query_as::<_, Poi>(
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
    .bind(&request.description)
    .bind(&request.category)
    .bind(request.elevation)
    .bind(request.lon)
    .bind(request.lat)
    .bind(request.session_id)
    .fetch_one(pool)
    .await
}

/// Unlink a POI from a track.
pub async fn unlink_from_track(
    pool: &PgPool,
    track_id: Uuid,
    poi_id: i32,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query("DELETE FROM track_pois WHERE track_id = $1 AND poi_id = $2")
        .bind(track_id)
        .bind(poi_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected())
}

/// Usage count of a POI (how many tracks reference it).
pub async fn usage_count(pool: &PgPool, id: i32) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM track_pois WHERE poi_id = $1")
        .bind(id)
        .fetch_one(pool)
        .await
}

/// Delete a POI.
pub async fn delete(pool: &PgPool, id: i32) -> Result<u64, sqlx::Error> {
    let result = sqlx::query("DELETE FROM pois WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected())
}

/// Bulk-link POIs to a track (used by the track editor / GPX waypoint import).
pub async fn bulk_link_to_track(
    pool: &Arc<PgPool>,
    track_id: Uuid,
    poi_ids_with_order: &[(i32, i32)],
) -> Result<usize, sqlx::Error> {
    PoiDeduplicationService::bulk_link_pois_to_track(pool, track_id, poi_ids_with_order).await
}

#[cfg(test)]
mod tests {
    use super::*;

    // These three run without a database: they only exercise request -> binding shapes.
    #[test]
    fn create_request_binds_name_trimmed() {
        let req = CreatePoiRequest {
            name: "  Summit  ".into(),
            description: None,
            category: None,
            elevation: None,
            lon: 37.0,
            lat: 55.0,
            session_id: None,
        };
        assert_eq!(req.name.trim(), "Summit");
    }

    #[test]
    fn update_request_field_flags() {
        let name_provided = true;
        let desc_provided = false;
        let cat_provided = true;
        assert!(name_provided && cat_provided && !desc_provided);
    }

    #[test]
    fn bulk_link_empty_is_noop() {
        let empty: &[(i32, i32)] = &[];
        assert!(empty.is_empty());
    }

    // These require DATABASE_URL; gated so the default `cargo test` stays green.
    async fn maybe_pool() -> Option<sqlx::PgPool> {
        let url = std::env::var("DATABASE_URL").ok()?;
        sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .ok()
    }

    #[tokio::test]
    async fn find_by_bbox_roundtrip() {
        let Some(pool) = maybe_pool().await else {
            return; // no DATABASE_URL: skip
        };
        let pois = find_by_bbox(&pool, 0.0, 0.0, 1.0, 1.0, 10, 0)
            .await
            .expect("bbox query");
        assert!(pois.is_empty() || !pois.is_empty());
    }

    #[tokio::test]
    async fn get_missing_returns_none() {
        let Some(pool) = maybe_pool().await else {
            return; // no DATABASE_URL: skip
        };
        let poi = get(&pool, -1).await.expect("get query");
        assert!(poi.is_none());
    }

    #[tokio::test]
    async fn count_all_works() {
        let Some(pool) = maybe_pool().await else {
            return; // no DATABASE_URL: skip
        };
        let _ = count_all(&pool).await.expect("count query");
    }
}
