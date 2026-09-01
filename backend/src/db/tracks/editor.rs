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
    .execute(&**params.pool)
    .await?;

    metrics::observe_db_query("insert_track_from_editor", start.elapsed().as_secs_f64());
    Ok(())
}

/// Update geometry, length, waypoints and hash of an existing track.
pub async fn update_track_geometry(
    pool: &Arc<PgPool>,
    track_id: Uuid,
    geom_geojson: &serde_json::Value,
    length_km: f64,
    waypoints: Option<serde_json::Value>,
    segment_meta: Option<serde_json::Value>,
    hash: &str,
) -> Result<(), sqlx::Error> {
    let start = Instant::now();
    let result = sqlx::query(
        r#"
        UPDATE tracks
        SET geom = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326),
            length_km = $2,
            waypoints = $3,
            segment_meta = COALESCE($4, segment_meta),
            hash = $5
        WHERE id = $6
        "#,
    )
    .bind(geom_geojson)
    .bind(length_km)
    .bind(waypoints)
    .bind(segment_meta)
    .bind(hash)
    .bind(track_id)
    .execute(&**pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(sqlx::Error::RowNotFound);
    }

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
            speed_data, pace_data, waypoints, source
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
            speed_data, pace_data, waypoints, 'duplicate'
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
    .execute(&**pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(sqlx::Error::RowNotFound);
    }

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
