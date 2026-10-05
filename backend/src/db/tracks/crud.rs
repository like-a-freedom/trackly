use crate::metrics;
use crate::models::*;
use crate::track_utils::{
    extract_segments_from_geojson, geojson_from_segments, get_simplification_params,
    simplify_track_for_zoom, split_points_by_gap,
};
use sqlx::{PgPool, Row};
use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;

use super::gap_metadata::{compute_gap_metadata, simplify_chart_data};

pub async fn track_exists(pool: &Arc<PgPool>, hash: &str) -> Result<Option<Uuid>, sqlx::Error> {
    let start = Instant::now();
    let rec = sqlx::query("SELECT id FROM tracks WHERE hash = $1")
        .bind(hash)
        .fetch_optional(&**pool)
        .await?;
    crate::metrics::observe_db_query("track_exists", start.elapsed().as_secs_f64());
    if let Some(row) = rec {
        let id = row.try_get::<Uuid, _>("id")?;
        Ok(Some(id))
    } else {
        Ok(None)
    }
}

pub struct InsertTrackParams<'a> {
    pub pool: &'a Arc<PgPool>,
    pub id: Uuid,
    pub name: &'a str,
    pub description: Option<String>,
    pub categories: &'a [&'a str],
    pub geom_geojson: &'a serde_json::Value,
    pub length_km: f64,
    pub elevation_profile_json: Option<serde_json::Value>,
    pub hr_data_json: Option<serde_json::Value>,
    pub temp_data_json: Option<serde_json::Value>,
    pub time_data_json: Option<serde_json::Value>,
    // Unified elevation fields
    pub elevation_gain: Option<f32>,
    pub elevation_loss: Option<f32>,
    pub elevation_min: Option<f32>,
    pub elevation_max: Option<f32>,
    pub elevation_enriched: Option<bool>,
    pub elevation_enriched_at: Option<chrono::NaiveDateTime>,
    pub elevation_dataset: Option<String>,
    pub elevation_api_calls: Option<i32>,
    // Slope fields
    pub slope_min: Option<f32>,
    pub slope_max: Option<f32>,
    pub slope_avg: Option<f32>,
    pub slope_histogram: Option<serde_json::Value>,
    pub slope_segments: Option<serde_json::Value>,
    pub avg_speed: Option<f64>,
    pub avg_hr: Option<i32>,
    pub hr_min: Option<i32>,
    pub hr_max: Option<i32>,
    pub moving_time: Option<i32>,
    pub pause_time: Option<i32>,
    pub moving_avg_speed: Option<f64>,
    pub moving_avg_pace: Option<f64>,
    pub duration_seconds: Option<i32>,
    pub hash: &'a str,
    pub recorded_at: Option<chrono::DateTime<chrono::Utc>>,
    pub session_id: Option<Uuid>,
    pub speed_data_json: Option<serde_json::Value>,
    pub pace_data_json: Option<serde_json::Value>,
}

pub fn sanitize_description(text: Option<&str>) -> Option<String> {
    text.map(|raw| ammonia::clean(raw).to_string())
}

pub async fn insert_track(params: InsertTrackParams<'_>) -> Result<(), sqlx::Error> {
    let start = Instant::now();
    let InsertTrackParams {
        pool,
        id,
        name,
        description,
        categories,
        geom_geojson,
        length_km,
        elevation_profile_json,
        hr_data_json,
        temp_data_json,
        time_data_json,
        elevation_gain,
        elevation_loss,
        elevation_min,
        elevation_max,
        elevation_enriched,
        elevation_enriched_at,
        elevation_dataset,
        elevation_api_calls,
        slope_min,
        slope_max,
        slope_avg,
        slope_histogram,
        slope_segments,
        avg_speed,
        avg_hr,
        hr_min,
        hr_max,
        moving_time,
        pause_time,
        moving_avg_speed,
        moving_avg_pace,
        duration_seconds,
        hash,
        recorded_at,
        session_id,
        speed_data_json,
        pace_data_json,
    } = params;
    let sanitized_description = sanitize_description(description.as_deref());
    sqlx::query(
        r#"
        INSERT INTO tracks (
            id, name, description, categories, geom, length_km, elevation_profile,
            elevation_gain, elevation_loss, elevation_min, elevation_max, elevation_enriched, elevation_enriched_at, elevation_dataset, elevation_api_calls, slope_min, slope_max, slope_avg, slope_histogram, slope_segments, avg_speed, avg_hr, hr_min, hr_max, moving_time, pause_time, moving_avg_speed, moving_avg_pace, hr_data, temp_data, time_data, duration_seconds,
            hash, recorded_at, created_at, session_id, is_public, speed_data, pace_data
        )
        VALUES (
            $1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326), $6, $7,
            $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
            $33, $34, DEFAULT, $35, $36, $37, $38
        )
    "#,
    )
    .bind(id)
    .bind(name)
    .bind(sanitized_description)
    .bind(categories)
    .bind(geom_geojson)
    .bind(length_km)
    .bind(elevation_profile_json)
    .bind(elevation_gain)
    .bind(elevation_loss)
    .bind(elevation_min)
    .bind(elevation_max)
    .bind(elevation_enriched)
    .bind(elevation_enriched_at)
    .bind(elevation_dataset)
    .bind(elevation_api_calls)
    .bind(slope_min)
    .bind(slope_max)
    .bind(slope_avg)
    .bind(slope_histogram)
    .bind(slope_segments)
    .bind(avg_speed)
    .bind(avg_hr)
    .bind(hr_min)
    .bind(hr_max)
    .bind(moving_time)
    .bind(pause_time)
    .bind(moving_avg_speed)
    .bind(moving_avg_pace)
    .bind(hr_data_json)
    .bind(temp_data_json)
    .bind(time_data_json)
    .bind(duration_seconds)
    .bind(hash)
    .bind(recorded_at)
    .bind(session_id)
    .bind(true) // is_public, default to true
    .bind(speed_data_json)
    .bind(pace_data_json)
    .execute(&**pool)
    .await?;
    metrics::observe_db_query("insert_track", start.elapsed().as_secs_f64());
    Ok(())
}

pub async fn get_track_detail(
    pool: &Arc<PgPool>,
    id: Uuid,
) -> Result<Option<TrackDetail>, sqlx::Error> {
    let row = sqlx::query(r#"
        SELECT id, name, description, categories, distance_markers_enabled, segment_meta, waypoints, ST_AsGeoJSON(geom)::jsonb as geom_geojson, length_km, elevation_profile, hr_data, temp_data, time_data, elevation_gain, elevation_loss, elevation_min, elevation_max, elevation_enriched, elevation_enriched_at, elevation_dataset, slope_min, slope_max, slope_avg, slope_histogram, slope_segments, avg_speed, avg_hr, hr_min, hr_max, moving_time, pause_time, moving_avg_speed, moving_avg_pace, duration_seconds, hash, recorded_at, created_at, updated_at, session_id, user_id, speed_data, pace_data
        FROM tracks WHERE id = $1
    "#)
        .bind(id)
        .fetch_optional(&**pool)
        .await?;
    if let Some(row) = row {
        let geom_geojson: serde_json::Value = row
            .try_get::<serde_json::Value, _>("geom_geojson")
            .expect("Failed to get geom_geojson");
        let time_data_raw: Option<serde_json::Value> = row.try_get("time_data").ok();
        let segments_for_metadata = extract_segments_from_geojson(&geom_geojson).ok();
        let (segment_gaps, pause_gaps) =
            compute_gap_metadata(segments_for_metadata.as_deref(), time_data_raw.as_ref());

        Ok(Some(TrackDetail {
            id: row.try_get::<Uuid, _>("id")?,
            name: row.try_get("name")?,
            description: row.try_get("description")?,
            categories: row.try_get("categories")?,
            distance_markers_enabled: row.try_get("distance_markers_enabled").ok(),
            geom_geojson: row.try_get::<serde_json::Value, _>("geom_geojson")?,
            waypoints: row.try_get("waypoints").ok(),
            segment_meta: row.try_get("segment_meta").ok(),
            segment_gaps,
            pause_gaps,
            length_km: row
                .try_get("length_km")
                .expect("Failed to get length_km: length_km column missing or wrong type"),
            elevation_profile: row.try_get("elevation_profile").ok(),
            hr_data: row.try_get("hr_data").ok(),
            temp_data: row.try_get("temp_data").ok(),
            time_data: time_data_raw,
            // Unified elevation fields
            elevation_gain: row.try_get("elevation_gain").ok(),
            elevation_loss: row.try_get("elevation_loss").ok(),
            elevation_min: row.try_get("elevation_min").ok(),
            elevation_max: row.try_get("elevation_max").ok(),
            elevation_enriched: row.try_get("elevation_enriched").ok(),
            elevation_enriched_at: row.try_get("elevation_enriched_at").ok(),
            elevation_dataset: row.try_get("elevation_dataset").ok(),
            // Slope fields
            slope_min: row.try_get("slope_min").ok(),
            slope_max: row.try_get("slope_max").ok(),
            slope_avg: row.try_get("slope_avg").ok(),
            slope_histogram: row.try_get("slope_histogram").ok(),
            slope_segments: row.try_get("slope_segments").ok(),
            avg_speed: row
                .try_get("avg_speed")
                .expect("Failed to get avg_speed: avg_speed column missing or wrong type"),
            avg_hr: row
                .try_get("avg_hr")
                .expect("Failed to get avg_hr: avg_hr column missing or wrong type"),
            hr_min: row.try_get("hr_min").ok(),
            hr_max: row.try_get("hr_max").ok(),
            moving_time: row.try_get("moving_time").ok(),
            pause_time: row.try_get("pause_time").ok(),
            moving_avg_speed: row.try_get("moving_avg_speed").ok(),
            moving_avg_pace: row.try_get("moving_avg_pace").ok(),
            duration_seconds: row.try_get("duration_seconds").expect(
                "Failed to get duration_seconds: duration_seconds column missing or wrong type",
            ),
            created_at: row.try_get("created_at").ok(),
            updated_at: row.try_get("updated_at").ok(),
            recorded_at: row.try_get("recorded_at").ok(),
            session_id: row.try_get("session_id").ok(),
            user_id: row.try_get("user_id").ok(),
            speed_data: row.try_get("speed_data").ok(),
            pace_data: row.try_get("pace_data").ok(),
        }))
    } else {
        Ok(None)
    }
}

/// Get track detail with adaptive simplification based on zoom and mode
pub async fn get_track_detail_adaptive(
    pool: &Arc<PgPool>,
    id: Uuid,
    zoom: Option<f64>,
    mode: Option<&str>,
) -> Result<Option<TrackDetail>, sqlx::Error> {
    let start = Instant::now();
    let track_mode = TrackMode::from_string(mode.unwrap_or("detail"));
    let zoom_level = zoom.unwrap_or(15.0); // Default to high detail for track detail view

    let row = sqlx::query(r#"
        SELECT id, name, description, categories, distance_markers_enabled, segment_meta, waypoints, ST_AsGeoJSON(geom)::jsonb as geom_geojson, length_km, elevation_profile, hr_data, temp_data, time_data, elevation_gain, elevation_loss, elevation_min, elevation_max, elevation_enriched, elevation_enriched_at, elevation_dataset, slope_min, slope_max, slope_avg, slope_histogram, slope_segments, avg_speed, avg_hr, hr_min, hr_max, moving_time, pause_time, moving_avg_speed, moving_avg_pace, duration_seconds, hash, recorded_at, created_at, updated_at, session_id, user_id, speed_data, pace_data, ST_NPoints(geom) as original_points
        FROM tracks WHERE id = $1
    "#)
        .bind(id)
        .fetch_optional(&**pool)
        .await?;

    if let Some(row) = row {
        let original_points: i32 = row.try_get("original_points").unwrap_or(0);
        let mut geom_geojson: serde_json::Value = row
            .try_get::<serde_json::Value, _>("geom_geojson")
            .expect("Failed to get geom_geojson");
        let mut working_segments: Option<Vec<Vec<(f64, f64)>>> = None;
        let time_data_raw: Option<serde_json::Value> = row.try_get("time_data").ok();

        // Normalize geometry by splitting teleport gaps for legacy records
        if let Ok(raw_segments) = extract_segments_from_geojson(&geom_geojson) {
            let max_gap_meters = std::env::var("TRACK_MAX_GAP_METERS")
                .ok()
                .and_then(|v| v.parse::<f64>().ok());
            let mut normalized_segments: Vec<Vec<(f64, f64)>> = Vec::new();
            let mut changed = false;
            for segment in raw_segments {
                let splits = split_points_by_gap(&segment, max_gap_meters);
                if splits.len() > 1 {
                    changed = true;
                }
                normalized_segments.extend(splits);
            }

            if changed {
                geom_geojson = geojson_from_segments(&normalized_segments);
            }

            if !normalized_segments.is_empty() {
                working_segments = Some(normalized_segments.clone());
            }
        }

        // Apply simplification for huge tracks or overview mode
        let params =
            get_simplification_params(track_mode, Some(zoom_level), original_points as usize);
        if params.should_simplify(original_points as usize)
            && let Ok(segments) = extract_segments_from_geojson(&geom_geojson)
            && !segments.is_empty()
        {
            let simplify_start = Instant::now();
            let simplified_segments: Vec<Vec<(f64, f64)>> = segments
                .iter()
                .map(|segment| simplify_track_for_zoom(segment, zoom_level))
                .collect();

            metrics::observe_track_simplify(
                if track_mode.is_detail() {
                    "detail"
                } else {
                    "overview"
                },
                simplify_start.elapsed().as_secs_f64(),
            );

            let changed = simplified_segments
                .iter()
                .zip(segments.iter())
                .any(|(new_seg, old_seg)| new_seg.len() < old_seg.len());

            if changed {
                geom_geojson = geojson_from_segments(&simplified_segments);
            }
        }

        // Simplify profile data for charts based on mode
        let elevation_profile = simplify_chart_data(
            row.try_get("elevation_profile").ok(),
            track_mode,
            zoom_level,
        );

        let hr_data = simplify_chart_data(row.try_get("hr_data").ok(), track_mode, zoom_level);

        let temp_data = simplify_chart_data(row.try_get("temp_data").ok(), track_mode, zoom_level);

        let time_data = simplify_chart_data(time_data_raw.clone(), track_mode, zoom_level);

        let segments_for_metadata = working_segments
            .clone()
            .or_else(|| extract_segments_from_geojson(&geom_geojson).ok());
        let (segment_gaps, pause_gaps) =
            compute_gap_metadata(segments_for_metadata.as_deref(), time_data_raw.as_ref());

        let result = Ok(Some(TrackDetail {
            id: row
                .try_get::<Uuid, _>("id")
                .expect("Failed to get id: id column missing or wrong type"),
            name: row
                .try_get("name")
                .expect("Failed to get name: name column missing or wrong type"),
            description: row
                .try_get("description")
                .expect("Failed to get description: description column missing or wrong type"),
            categories: row
                .try_get("categories")
                .expect("Failed to get categories: categories column missing or wrong type"),
            distance_markers_enabled: row.try_get("distance_markers_enabled").ok(),
            geom_geojson,
            waypoints: row.try_get("waypoints").ok(),
            segment_meta: row.try_get("segment_meta").ok(),
            segment_gaps,
            pause_gaps,
            length_km: row.try_get("length_km")?,
            elevation_profile,
            hr_data,
            temp_data,
            time_data,
            // Unified elevation fields
            elevation_gain: row.try_get("elevation_gain").ok(),
            elevation_loss: row.try_get("elevation_loss").ok(),
            elevation_min: row.try_get("elevation_min").ok(),
            elevation_max: row.try_get("elevation_max").ok(),
            elevation_enriched: row.try_get("elevation_enriched").ok(),
            elevation_enriched_at: row.try_get("elevation_enriched_at").ok(),
            elevation_dataset: row.try_get("elevation_dataset").ok(),
            // Slope fields
            slope_min: row.try_get("slope_min").ok(),
            slope_max: row.try_get("slope_max").ok(),
            slope_avg: row.try_get("slope_avg").ok(),
            slope_histogram: row.try_get("slope_histogram").ok(),
            slope_segments: row.try_get("slope_segments").ok(),
            avg_speed: row
                .try_get("avg_speed")
                .expect("Failed to get avg_speed: avg_speed column missing or wrong type"),
            avg_hr: row
                .try_get("avg_hr")
                .expect("Failed to get avg_hr: avg_hr column missing or wrong type"),
            hr_min: row
                .try_get("hr_min")
                .expect("Failed to get hr_min: hr_min column missing or wrong type"),
            hr_max: row
                .try_get("hr_max")
                .expect("Failed to get hr_max: hr_max column missing or wrong type"),
            moving_time: row
                .try_get("moving_time")
                .expect("Failed to get moving_time: moving_time column missing or wrong type"),
            pause_time: row
                .try_get("pause_time")
                .expect("Failed to get pause_time: pause_time column missing or wrong type"),
            moving_avg_speed: row.try_get("moving_avg_speed").ok(),
            moving_avg_pace: row.try_get("moving_avg_pace").ok(),
            duration_seconds: row.try_get("duration_seconds").expect(
                "Failed to get duration_seconds: duration_seconds column missing or wrong type",
            ),
            created_at: row.try_get("created_at").ok(),
            updated_at: row.try_get("updated_at").ok(),
            recorded_at: row.try_get("recorded_at").ok(),
            session_id: row.try_get("session_id").ok(),
            user_id: row.try_get("user_id").ok(),
            speed_data: row.try_get("speed_data").ok(),
            pace_data: row.try_get("pace_data").ok(),
        }));
        metrics::observe_db_query("get_track_detail_adaptive", start.elapsed().as_secs_f64());
        result
    } else {
        metrics::observe_db_query("get_track_detail_adaptive", start.elapsed().as_secs_f64());
        Ok(None)
    }
}

pub async fn delete_track(pool: &Arc<PgPool>, track_id: Uuid) -> Result<u64, sqlx::Error> {
    let start = Instant::now();
    let result = sqlx::query(
        r#"
        DELETE FROM tracks WHERE id = $1
        "#,
    )
    .bind(track_id)
    .execute(&**pool)
    .await?;
    metrics::observe_db_query("delete_track", start.elapsed().as_secs_f64());
    Ok(result.rows_affected())
}

pub async fn update_track_description(
    pool: &Arc<PgPool>,
    track_id: Uuid,
    new_description: &str,
) -> Result<(), sqlx::Error> {
    let start = Instant::now();
    let sanitized = sanitize_description(Some(new_description));
    sqlx::query(
        r#"
        UPDATE tracks
        SET description = $1,
            updated_at = NOW()
        WHERE id = $2
        "#,
    )
    .bind(sanitized)
    .bind(track_id)
    .execute(&**pool)
    .await?;
    metrics::observe_db_query("update_track_description", start.elapsed().as_secs_f64());
    Ok(())
}

pub async fn update_track_name(
    pool: &Arc<PgPool>,
    track_id: Uuid,
    new_name: &str,
) -> Result<(), sqlx::Error> {
    let start = Instant::now();
    sqlx::query(
        r#"
        UPDATE tracks
        SET name = $1,
            updated_at = NOW()
        WHERE id = $2
        "#,
    )
    .bind(new_name)
    .bind(track_id)
    .execute(&**pool)
    .await?;
    metrics::observe_db_query("update_track_name", start.elapsed().as_secs_f64());
    Ok(())
}

pub async fn update_track_categories(
    pool: &Arc<PgPool>,
    track_id: Uuid,
    categories: &[String],
) -> Result<(), sqlx::Error> {
    let start = Instant::now();
    // Convert to slice of &str for binding
    let cat_refs: Vec<&str> = categories.iter().map(|s| s.as_str()).collect();

    sqlx::query(
        r#"
        UPDATE tracks
        SET categories = $1,
            updated_at = NOW()
        WHERE id = $2
        "#,
    )
    .bind(cat_refs)
    .bind(track_id)
    .execute(&**pool)
    .await?;

    metrics::observe_db_query("update_track_categories", start.elapsed().as_secs_f64());
    Ok(())
}

pub async fn update_track_distance_markers(
    pool: &Arc<PgPool>,
    track_id: Uuid,
    enabled: bool,
) -> Result<(), sqlx::Error> {
    let start = Instant::now();
    sqlx::query(
        r#"
        UPDATE tracks
        SET distance_markers_enabled = $1,
            updated_at = NOW()
        WHERE id = $2
        "#,
    )
    .bind(enabled)
    .bind(track_id)
    .execute(&**pool)
    .await?;

    metrics::observe_db_query(
        "update_track_distance_markers",
        start.elapsed().as_secs_f64(),
    );
    Ok(())
}

/// Get track by ID for elevation enrichment
pub async fn get_track_by_id(
    pool: &PgPool,
    track_id: Uuid,
) -> Result<Option<TrackForElevationEnrichment>, sqlx::Error> {
    let start = Instant::now();
    let row = sqlx::query(
        r#"
        SELECT id, session_id, user_id, elevation_enriched, elevation_gain, elevation_loss, elevation_min, elevation_max, elevation_enriched_at, elevation_dataset, ST_AsGeoJSON(geom)::jsonb as geom_geojson
        FROM tracks
        WHERE id = $1
        "#,
    )
    .bind(track_id)
    .fetch_optional(pool)
    .await?;

    metrics::observe_db_query("get_track_by_id", start.elapsed().as_secs_f64());

    if let Some(row) = row {
        Ok(Some(TrackForElevationEnrichment {
            id: row.try_get("id")?,
            session_id: row.try_get("session_id")?,
            user_id: row.try_get("user_id")?,
            elevation_enriched: row.try_get("elevation_enriched")?,
            elevation_gain: row.try_get("elevation_gain")?,
            elevation_loss: row.try_get("elevation_loss")?,
            elevation_min: row.try_get("elevation_min")?,
            elevation_max: row.try_get("elevation_max")?,
            elevation_enriched_at: row.try_get("elevation_enriched_at")?,
            elevation_dataset: row.try_get("elevation_dataset")?,
            geom_geojson: row.try_get("geom_geojson")?,
        }))
    } else {
        Ok(None)
    }
}

/// Update track elevation data
pub struct UpdateElevationParams {
    pub elevation_gain: Option<f32>,
    pub elevation_loss: Option<f32>,
    pub elevation_min: Option<f32>,
    pub elevation_max: Option<f32>,
    pub elevation_enriched: bool,
    pub elevation_enriched_at: Option<chrono::NaiveDateTime>,
    pub elevation_dataset: Option<String>,
    pub elevation_profile: Option<Vec<f64>>,
    pub elevation_api_calls: u32,
}

pub async fn update_track_elevation(
    pool: &PgPool,
    track_id: Uuid,
    params: UpdateElevationParams,
) -> Result<(), sqlx::Error> {
    let start = Instant::now();
    // Convert elevation profile to JSON
    let elevation_profile_json = params
        .elevation_profile
        .map(|profile| serde_json::to_value(profile).unwrap_or(serde_json::Value::Null));

    sqlx::query(
        r#"
        UPDATE tracks 
        SET elevation_gain = $2,
            elevation_loss = $3,
            elevation_min = $4,
            elevation_max = $5,
            elevation_enriched = $6,
            elevation_enriched_at = $7,
            elevation_dataset = $8,
            elevation_profile = $9,
            elevation_api_calls = COALESCE(elevation_api_calls, 0) + $10,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(track_id)
    .bind(params.elevation_gain)
    .bind(params.elevation_loss)
    .bind(params.elevation_min)
    .bind(params.elevation_max)
    .bind(params.elevation_enriched)
    .bind(params.elevation_enriched_at)
    .bind(params.elevation_dataset)
    .bind(elevation_profile_json)
    .bind(params.elevation_api_calls as i32)
    .execute(pool)
    .await?;

    metrics::observe_db_query("update_track_elevation", start.elapsed().as_secs_f64());

    Ok(())
}

/// Parameters for updating track slope data
#[derive(Debug)]
pub struct UpdateSlopeParams {
    pub slope_min: Option<f32>,
    pub slope_max: Option<f32>,
    pub slope_avg: Option<f32>,
    pub slope_histogram: Option<serde_json::Value>,
    pub slope_segments: Option<serde_json::Value>,
}

pub async fn update_track_slope(
    pool: &PgPool,
    track_id: Uuid,
    params: UpdateSlopeParams,
) -> Result<(), sqlx::Error> {
    let start = Instant::now();
    sqlx::query(
        r#"
        UPDATE tracks 
        SET slope_min = $2,
            slope_max = $3,
            slope_avg = $4,
            slope_histogram = $5,
            slope_segments = $6,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(track_id)
    .bind(params.slope_min)
    .bind(params.slope_max)
    .bind(params.slope_avg)
    .bind(params.slope_histogram)
    .bind(params.slope_segments)
    .execute(pool)
    .await?;

    metrics::observe_db_query("update_track_slope", start.elapsed().as_secs_f64());

    Ok(())
}
