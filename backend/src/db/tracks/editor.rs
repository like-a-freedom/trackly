use crate::metrics;
use sqlx::{PgPool, Row};
use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;

/// Parameters for inserting a track created from the editor.
pub struct InsertTrackFromEditorParams<'a> {
    pub pool: &'a Arc<PgPool>,
    pub id: Uuid,
    pub name: &'a str,
    pub description: Option<String>,
    pub categories: &'a [&'a str],
    pub geom_geojson: &'a serde_json::Value,
    pub length_km: f64,
    pub waypoints: Option<serde_json::Value>,
    pub segment_meta: Option<serde_json::Value>,
    pub pois: serde_json::Value,
    pub hash: &'a str,
    pub session_id: Option<Uuid>,
    pub user_id: Option<Uuid>,
    pub is_draft: bool,
    pub source: &'a str,
}

pub async fn insert_track_from_editor(
    params: InsertTrackFromEditorParams<'_>,
) -> Result<(), sqlx::Error> {
    let start = Instant::now();
    let sanitized_description = super::crud::sanitize_description(params.description.as_deref());
    let mut transaction = params.pool.begin().await?;

    sqlx::query(
        r#"
        INSERT INTO tracks (
            id, name, description, categories, geom,
            length_km, waypoints, segment_meta, hash, session_id, user_id,
            is_draft, source, is_public, created_at
        )
        VALUES (
            $1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326),
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, DEFAULT
        )
        "#,
    )
    .bind(params.id)
    .bind(params.name)
    .bind(sanitized_description)
    .bind(params.categories)
    .bind(params.geom_geojson)
    .bind(params.length_km)
    .bind(params.waypoints)
    .bind(params.segment_meta)
    .bind(params.hash)
    .bind(params.session_id)
    .bind(params.user_id)
    .bind(params.is_draft)
    .bind(params.source)
    .bind(!params.is_draft) // is_public = !is_draft by default
    .execute(&mut *transaction)
    .await?;

    replace_editor_pois(&mut transaction, params.id, &params.pois, params.session_id).await?;
    transaction.commit().await?;
    metrics::observe_db_query("insert_track_from_editor", start.elapsed().as_secs_f64());
    Ok(())
}

/// Optional editor state saved in the same transaction as geometry.
pub struct GeometryUpdateOptions {
    pub waypoints: Option<serde_json::Value>,
    pub segment_meta: Option<serde_json::Value>,
    pub pois: Option<serde_json::Value>,
    pub session_id: Option<Uuid>,
}

/// Update geometry, length, waypoints and hash of an existing track.
pub async fn update_track_geometry(
    pool: &Arc<PgPool>,
    track_id: Uuid,
    geom_geojson: &serde_json::Value,
    length_km: f64,
    options: GeometryUpdateOptions,
    hash: &str,
) -> Result<(), sqlx::Error> {
    let GeometryUpdateOptions {
        waypoints,
        segment_meta,
        pois,
        session_id,
    } = options;
    let start = Instant::now();
    let mut transaction = pool.begin().await?;
    let result = sqlx::query(
        r#"
        UPDATE tracks
        SET geom = CASE WHEN time_data IS NOT NULL OR hr_data IS NOT NULL OR speed_data IS NOT NULL OR temp_data IS NOT NULL OR recorded_at IS NOT NULL THEN geom ELSE ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) END,
            length_km = CASE WHEN time_data IS NOT NULL OR hr_data IS NOT NULL OR speed_data IS NOT NULL OR temp_data IS NOT NULL OR recorded_at IS NOT NULL THEN length_km ELSE $2 END,
            waypoints = $3,
            segment_meta = COALESCE($4, segment_meta),
            hash = CASE WHEN time_data IS NOT NULL OR hr_data IS NOT NULL OR speed_data IS NOT NULL OR temp_data IS NOT NULL OR recorded_at IS NOT NULL THEN hash ELSE $5 END
        WHERE id = $6
        "#,
    )
    .bind(geom_geojson)
    .bind(length_km)
    .bind(waypoints)
    .bind(segment_meta)
    .bind(hash)
    .bind(track_id)
    .execute(&mut *transaction)
    .await?;

    if result.rows_affected() == 0 {
        return Err(sqlx::Error::RowNotFound);
    }

    if let Some(pois) = pois {
        replace_editor_pois(&mut transaction, track_id, &pois, session_id).await?;
    }
    transaction.commit().await?;
    metrics::observe_db_query("update_track_geometry", start.elapsed().as_secs_f64());
    Ok(())
}

/// Duplicate an existing track, returning the new track's ID.
pub async fn duplicate_track(
    pool: &Arc<PgPool>,
    source_id: Uuid,
    custom_name: Option<String>,
    session_id: Option<Uuid>,
    user_id: Option<Uuid>,
) -> Result<Uuid, sqlx::Error> {
    let start = Instant::now();
    let new_id = Uuid::new_v4();
    let new_hash = format!("dup_{new_id}");

    let mut transaction = pool.begin().await?;
    // Copy most fields from the source track but assign new id/hash/session
    let result = sqlx::query(
        r#"
        INSERT INTO tracks (
            id, name, description, categories,
            geom, length_km, elevation_profile,
            elevation_gain, elevation_loss, elevation_min, elevation_max,
            elevation_enriched, elevation_enriched_at, elevation_dataset,
            slope_min, slope_max, slope_avg, slope_histogram, slope_segments,
            avg_speed, avg_hr, hr_min, hr_max,
            moving_time, pause_time, moving_avg_speed, moving_avg_pace,
            hr_data, temp_data, time_data, duration_seconds,
            hash, recorded_at, session_id, user_id, is_public, distance_markers_enabled,
            speed_data, pace_data, waypoints, segment_meta, source
        )
        SELECT
            $1, COALESCE($4, name || ' (copy)'), description, categories,
            geom, length_km, elevation_profile,
            elevation_gain, elevation_loss, elevation_min, elevation_max,
            elevation_enriched, elevation_enriched_at, elevation_dataset,
            slope_min, slope_max, slope_avg, slope_histogram, slope_segments,
            avg_speed, avg_hr, hr_min, hr_max,
            moving_time, pause_time, moving_avg_speed, moving_avg_pace,
            hr_data, temp_data, time_data, duration_seconds,
            $2, recorded_at, $3, $5, is_public, distance_markers_enabled,
            speed_data, pace_data, waypoints, segment_meta, 'duplicate'
        FROM tracks
        WHERE id = $6
        "#,
    )
    .bind(new_id)
    .bind(&new_hash)
    .bind(session_id)
    .bind(custom_name)
    .bind(user_id)
    .bind(source_id)
    .execute(&mut *transaction)
    .await?;

    if result.rows_affected() == 0 {
        return Err(sqlx::Error::RowNotFound);
    }

    sqlx::query("INSERT INTO track_pois (track_id, poi_id, distance_from_start_m, sequence_order) SELECT $1, poi_id, distance_from_start_m, sequence_order FROM track_pois WHERE track_id = $2")
        .bind(new_id).bind(source_id).execute(&mut *transaction).await?;
    transaction.commit().await?;
    metrics::observe_db_query("duplicate_track", start.elapsed().as_secs_f64());
    Ok(new_id)
}

/// Mark a track as no longer a draft (publish).
pub async fn publish_track(pool: &Arc<PgPool>, track_id: Uuid) -> Result<(), sqlx::Error> {
    let start = Instant::now();
    let result = sqlx::query("UPDATE tracks SET is_draft = FALSE, is_public = TRUE WHERE id = $1")
        .bind(track_id)
        .execute(&**pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(sqlx::Error::RowNotFound);
    }

    metrics::observe_db_query("publish_track", start.elapsed().as_secs_f64());
    Ok(())
}

/// Get track ownership info for authorization checks.
pub async fn get_track_ownership(
    pool: &Arc<PgPool>,
    track_id: Uuid,
) -> Result<(Option<Uuid>, Option<Uuid>), sqlx::Error> {
    let row = sqlx::query("SELECT session_id, user_id FROM tracks WHERE id = $1")
        .bind(track_id)
        .fetch_optional(&**pool)
        .await?;

    match row {
        Some(row) => {
            let session_id: Option<Uuid> = row.try_get("session_id").ok();
            let user_id: Option<Uuid> = row.try_get("user_id").ok();
            Ok((session_id, user_id))
        }
        None => Err(sqlx::Error::RowNotFound),
    }
}

/// Replace editor POI links transactionally; changed POIs become independent copies.
async fn replace_editor_pois(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    track_id: Uuid,
    pois: &serde_json::Value,
    session_id: Option<Uuid>,
) -> Result<(), sqlx::Error> {
    if let Some(session_id) = session_id {
        sqlx::query("INSERT INTO sessions (id) VALUES ($1) ON CONFLICT (id) DO NOTHING")
            .bind(session_id)
            .execute(&mut **transaction)
            .await?;
    }
    let mut links = Vec::new();
    for (order, poi) in pois.as_array().into_iter().flatten().enumerate() {
        let name = ammonia::clean(poi["name"].as_str().unwrap_or_default().trim());
        let description = poi["description"].as_str().map(ammonia::clean);
        let category = poi["category"].as_str();
        let lat = poi["lat"].as_f64().unwrap_or_default();
        let lon = poi["lon"].as_f64().unwrap_or_default();
        let existing: Option<i32> = sqlx::query_scalar("SELECT p.id FROM pois p JOIN track_pois tp ON tp.poi_id=p.id WHERE tp.track_id=$1 AND p.name=$2 AND p.description IS NOT DISTINCT FROM $3 AND p.category IS NOT DISTINCT FROM $4 AND ST_X(p.geom::geometry)=$5 AND ST_Y(p.geom::geometry)=$6 LIMIT 1")
            .bind(track_id).bind(&name).bind(&description).bind(category).bind(lon).bind(lat).fetch_optional(&mut **transaction).await?;
        let id = match existing {
            Some(id) => id,
            None => sqlx::query_scalar("INSERT INTO pois (name, description, category, geom, session_id) VALUES ($1,$2,$3,ST_SetSRID(ST_MakePoint($4,$5),4326)::geography,$6) RETURNING id")
                .bind(&name).bind(&description).bind(category).bind(lon).bind(lat).bind(session_id).fetch_one(&mut **transaction).await?,
        };
        links.push((id, order as i32));
    }
    sqlx::query("DELETE FROM track_pois WHERE track_id=$1")
        .bind(track_id)
        .execute(&mut **transaction)
        .await?;
    for (id, order) in links {
        sqlx::query("INSERT INTO track_pois (track_id,poi_id,sequence_order,distance_from_start_m) VALUES ($1,$2,$3,calculate_poi_distance_on_track($1::uuid,$2)) ON CONFLICT (track_id,poi_id) DO NOTHING")
            .bind(track_id).bind(id).bind(order).execute(&mut **transaction).await?;
    }
    Ok(())
}
