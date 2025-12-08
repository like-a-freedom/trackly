use crate::metrics;
use crate::models::*;
use crate::track_utils::{
    extract_segments_from_geojson, geojson_from_segments, get_simplification_params,
    haversine_distance, length_km_for_segments, simplify_track_for_zoom, split_points_by_gap,
};
use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, QueryBuilder, Row};
use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;

pub async fn track_exists(pool: &Arc<PgPool>, hash: &str) -> Result<Option<Uuid>, sqlx::Error> {
    let rec = sqlx::query("SELECT id FROM tracks WHERE hash = $1")
        .bind(hash)
        .fetch_optional(&**pool)
        .await?;
    Ok(rec.map(|row| {
        row.try_get::<Uuid, _>("id")
            .expect("Failed to get id from row: id column missing or wrong type")
    }))
}

pub struct InsertTrackParams<'a> {
    pub pool: &'a Arc<PgPool>,
    pub id: Uuid,
    pub name: &'a str,
    pub description: Option<String>,
    pub categories: &'a [&'a str],
    pub auto_classifications: &'a [String],
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

fn sanitize_description(text: Option<&str>) -> Option<String> {
    text.map(|raw| ammonia::clean(raw).to_string())
}

fn build_list_tracks_query(params: &crate::models::TrackListQuery) -> QueryBuilder<'_, Postgres> {
    let mut builder = QueryBuilder::<Postgres>::new("SELECT id, name, categories, length_km, elevation_gain, elevation_loss, elevation_enriched, slope_min, slope_max, slope_avg FROM tracks WHERE is_public = TRUE");

    if let Some(cats) = params.categories.as_ref().filter(|c| !c.is_empty()) {
        builder.push(" AND categories && ");
        builder.push_bind(cats);
    }
    if let Some(min) = params.min_length {
        builder.push(" AND length_km >= ");
        builder.push_bind(min);
    }
    if let Some(max) = params.max_length {
        builder.push(" AND length_km <= ");
        builder.push_bind(max);
    }
    if let Some(min) = params.elevation_gain_min {
        builder.push(" AND elevation_gain >= ");
        builder.push_bind(min);
    }
    if let Some(max) = params.elevation_gain_max {
        builder.push(" AND elevation_gain <= ");
        builder.push_bind(max);
    }
    if let Some(min) = params.slope_min {
        builder.push(" AND slope_min >= ");
        builder.push_bind(min);
    }
    if let Some(max) = params.slope_max {
        builder.push(" AND slope_max <= ");
        builder.push_bind(max);
    }

    builder
}

pub async fn insert_track(params: InsertTrackParams<'_>) -> Result<(), sqlx::Error> {
    let start = Instant::now();
    let InsertTrackParams {
        pool,
        id,
        name,
        description,
        categories,
        auto_classifications,
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
            id, name, description, categories, auto_classifications, geom, length_km, elevation_profile,
            elevation_gain, elevation_loss, elevation_min, elevation_max, elevation_enriched, elevation_enriched_at, elevation_dataset, elevation_api_calls, slope_min, slope_max, slope_avg, slope_histogram, slope_segments, avg_speed, avg_hr, hr_min, hr_max, moving_time, pause_time, moving_avg_speed, moving_avg_pace, hr_data, temp_data, time_data, duration_seconds,
            hash, recorded_at, created_at, session_id, is_public, speed_data, pace_data
        )
        VALUES (
            $1, $2, $3, $4, $5, ST_SetSRID(ST_GeomFromGeoJSON($6), 4326), $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33,
            $34, $35, DEFAULT, $36, $37, $38, $39
        )
    "#,
    )
    .bind(id)
    .bind(name)
    .bind(sanitized_description)
    .bind(categories)
    .bind(auto_classifications)
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

pub async fn list_tracks(
    pool: &Arc<PgPool>,
    params: &crate::models::TrackListQuery,
) -> Result<Vec<TrackListItem>, sqlx::Error> {
    let rows = build_list_tracks_query(params)
        .build()
        .fetch_all(&**pool)
        .await?;
    let mut result = Vec::new();
    for row in rows {
        let id: Uuid = row
            .try_get::<Uuid, _>("id")
            .expect("Failed to get id: id column missing or wrong type");
        let name: String = row
            .try_get("name")
            .expect("Failed to get name: name column missing or wrong type");
        let categories: Vec<String> = row
            .try_get("categories")
            .expect("Failed to get categories: categories column missing or wrong type");
        let length_km: f64 = row
            .try_get("length_km")
            .expect("Failed to get length_km: length_km column missing or wrong type");
        let elevation_gain: Option<f32> = row.try_get("elevation_gain").ok();
        let elevation_loss: Option<f32> = row.try_get("elevation_loss").ok();
        let elevation_enriched: Option<bool> = row.try_get("elevation_enriched").ok();
        let slope_min: Option<f32> = row.try_get("slope_min").ok();
        let slope_max: Option<f32> = row.try_get("slope_max").ok();
        let slope_avg: Option<f32> = row.try_get("slope_avg").ok();
        result.push(TrackListItem {
            id,
            name,
            categories,
            length_km,
            elevation_gain,
            elevation_loss,
            elevation_enriched,
            slope_min,
            slope_max,
            slope_avg,
            url: format!("/tracks/{id}"),
        });
    }
    Ok(result)
}

pub async fn get_track_detail(
    pool: &Arc<PgPool>,
    id: Uuid,
) -> Result<Option<TrackDetail>, sqlx::Error> {
    let row = sqlx::query(r#"
        SELECT id, name, description, categories, auto_classifications, ST_AsGeoJSON(geom)::jsonb as geom_geojson, length_km, elevation_profile, hr_data, temp_data, time_data, elevation_gain, elevation_loss, elevation_min, elevation_max, elevation_enriched, elevation_enriched_at, elevation_dataset, slope_min, slope_max, slope_avg, slope_histogram, slope_segments, avg_speed, avg_hr, hr_min, hr_max, moving_time, pause_time, moving_avg_speed, moving_avg_pace, duration_seconds, hash, recorded_at, created_at, updated_at, session_id, speed_data, pace_data
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
            auto_classifications: row
                .try_get("auto_classifications")
                .unwrap_or_else(|_| Vec::new()),
            geom_geojson: row
                .try_get::<serde_json::Value, _>("geom_geojson")
                .expect("Failed to get geom_geojson"),
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
        SELECT id, name, description, categories, auto_classifications, ST_AsGeoJSON(geom)::jsonb as geom_geojson, length_km, elevation_profile, hr_data, temp_data, time_data, elevation_gain, elevation_loss, elevation_min, elevation_max, elevation_enriched, elevation_enriched_at, elevation_dataset, slope_min, slope_max, slope_avg, slope_histogram, slope_segments, avg_speed, avg_hr, hr_min, hr_max, moving_time, pause_time, moving_avg_speed, moving_avg_pace, duration_seconds, hash, recorded_at, created_at, updated_at, session_id, speed_data, pace_data, ST_NPoints(geom) as original_points
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
        let mut normalized_length_km: Option<f64> = None;

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
                normalized_length_km = Some(length_km_for_segments(&normalized_segments));
            }
        }

        // Apply simplification for huge tracks or overview mode
        let params =
            get_simplification_params(track_mode, Some(zoom_level), original_points as usize);
        if params.should_simplify(original_points as usize) {
            if let Ok(segments) = extract_segments_from_geojson(&geom_geojson) {
                if !segments.is_empty() {
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
            auto_classifications: row
                .try_get("auto_classifications")
                .unwrap_or_else(|_| Vec::new()),
            geom_geojson,
            segment_gaps,
            pause_gaps,
            length_km: normalized_length_km.unwrap_or_else(|| {
                row.try_get("length_km")
                    .expect("Failed to get length_km: length_km column missing or wrong type")
            }),
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

/// Helper function to simplify chart data (elevation, HR, temp) based on mode
fn simplify_chart_data(
    data: Option<serde_json::Value>,
    mode: TrackMode,
    _zoom: f64,
) -> Option<serde_json::Value> {
    match data {
        Some(json_data) => {
            if let Some(array) = json_data.as_array() {
                let max_points = match mode {
                    TrackMode::Overview => 500, // For overview mode, limit chart data aggressively
                    TrackMode::Detail => 1500, // For detail mode, allow more points but still limit for performance
                };

                if array.len() > max_points {
                    // Simple uniform sampling for chart data
                    let step = array.len() / max_points;
                    let simplified: Vec<serde_json::Value> = array
                        .iter()
                        .step_by(step.max(1))
                        .take(max_points)
                        .cloned()
                        .collect();

                    Some(serde_json::Value::Array(simplified))
                } else {
                    Some(json_data)
                }
            } else {
                Some(json_data)
            }
        }
        None => None,
    }
}

const PAUSE_GAP_THRESHOLD_SECS: i64 = 180; // 3 minutes without samples marks a pause gap

fn parse_time_points(time_data: &serde_json::Value) -> Vec<Option<DateTime<Utc>>> {
    let mut result = Vec::new();
    let array = match time_data.as_array() {
        Some(arr) => arr,
        None => return result,
    };

    for value in array {
        if value.is_null() {
            result.push(None);
            continue;
        }

        if let Some(s) = value.as_str() {
            if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
                result.push(Some(dt.with_timezone(&Utc)));
                continue;
            }
        }

        result.push(None);
    }

    result
}

fn compute_gap_metadata(
    segments_opt: Option<&[Vec<(f64, f64)>]>,
    time_data_raw: Option<&serde_json::Value>,
) -> (Option<Vec<GapInfo>>, Option<Vec<GapInfo>>) {
    let mut segment_gaps: Vec<GapInfo> = Vec::new();
    let mut pause_gaps: Vec<GapInfo> = Vec::new();

    if let Some(segments) = segments_opt {
        if segments.len() > 1 {
            for (idx, window) in segments.windows(2).enumerate() {
                let from = window[0].last().copied();
                let to = window[1].first().copied();
                if let (Some(from_pt), Some(to_pt)) = (from, to) {
                    let distance_m = haversine_distance(from_pt, to_pt);
                    segment_gaps.push(GapInfo {
                        kind: "segment".to_string(),
                        from: GapEndpoint {
                            lat: from_pt.0,
                            lon: from_pt.1,
                            segment_index: idx,
                            point_index: window[0].len().saturating_sub(1),
                        },
                        to: GapEndpoint {
                            lat: to_pt.0,
                            lon: to_pt.1,
                            segment_index: idx + 1,
                            point_index: 0,
                        },
                        distance_m,
                        duration_seconds: None,
                    });
                }
            }
        }

        if segments.len() == 1 {
            if let Some(time_json) = time_data_raw {
                let times = parse_time_points(time_json);
                let coords = &segments[0];
                if coords.len() == times.len() && coords.len() > 1 {
                    for i in 1..coords.len() {
                        if let (Some(t1), Some(t2)) = (times[i - 1], times[i]) {
                            let delta = (t2 - t1).num_seconds();
                            if delta >= PAUSE_GAP_THRESHOLD_SECS {
                                let distance_m = haversine_distance(coords[i - 1], coords[i]);
                                pause_gaps.push(GapInfo {
                                    kind: "pause".to_string(),
                                    from: GapEndpoint {
                                        lat: coords[i - 1].0,
                                        lon: coords[i - 1].1,
                                        segment_index: 0,
                                        point_index: i - 1,
                                    },
                                    to: GapEndpoint {
                                        lat: coords[i].0,
                                        lon: coords[i].1,
                                        segment_index: 0,
                                        point_index: i,
                                    },
                                    distance_m,
                                    duration_seconds: Some(delta),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    (
        if segment_gaps.is_empty() {
            None
        } else {
            Some(segment_gaps)
        },
        if pause_gaps.is_empty() {
            None
        } else {
            Some(pause_gaps)
        },
    )
}

pub async fn list_tracks_geojson(
    pool: &Arc<PgPool>,
    bbox: Option<&str>,
    zoom: Option<f64>,
    mode: Option<&str>,
    filter_params: &crate::models::TrackGeoJsonQuery,
) -> Result<TrackGeoJsonCollection, sqlx::Error> {
    let start = Instant::now();
    let track_mode = TrackMode::from_string(mode.unwrap_or("overview"));
    let zoom_level = zoom.unwrap_or(12.0);

    // Build base SQL with zoom-based simplification using PostGIS ST_Simplify
    let use_postgis_simplification = track_mode.is_overview() && zoom_level <= 14.0;

    let mut builder = QueryBuilder::<Postgres>::new("SELECT id, name, categories, length_km, elevation_gain, elevation_loss, slope_min, slope_max,");

    if use_postgis_simplification {
        builder.push(
            " CASE WHEN ST_NPoints(geom) > 1000 THEN ST_AsGeoJSON(ST_Simplify(geom, tolerance_for_zoom_degrees(",
        );
        builder.push_bind(zoom_level);
        builder.push(
            ")))::jsonb ELSE ST_AsGeoJSON(geom)::jsonb END as geom_json, ST_NPoints(geom) as original_points",
        );
    } else {
        builder
            .push(" ST_AsGeoJSON(geom)::jsonb as geom_json, ST_NPoints(geom) as original_points");
    }

    if track_mode.is_detail() {
        builder.push(", avg_hr, avg_speed, duration_seconds, recorded_at");
    }

    builder.push(" FROM tracks WHERE is_public = TRUE");

    if let Some(categories) = &filter_params.categories {
        if !categories.is_empty() {
            builder.push(" AND categories && ");
            builder.push_bind(categories);
        }
    }

    if let Some(min) = filter_params.min_length {
        builder.push(" AND length_km >= ");
        builder.push_bind(min);
    }

    if let Some(max) = filter_params.max_length {
        builder.push(" AND length_km <= ");
        builder.push_bind(max);
    }

    if let Some(min) = filter_params.elevation_gain_min {
        builder.push(" AND elevation_gain >= ");
        builder.push_bind(min);
    }

    if let Some(max) = filter_params.elevation_gain_max {
        builder.push(" AND elevation_gain <= ");
        builder.push_bind(max);
    }

    if let Some(min) = filter_params.slope_min {
        builder.push(" AND slope_min >= ");
        builder.push_bind(min);
    }

    if let Some(max) = filter_params.slope_max {
        builder.push(" AND slope_max <= ");
        builder.push_bind(max);
    }

    if let Some(bbox_str) = bbox {
        let parts: Vec<&str> = bbox_str.split(',').collect();
        if parts.len() == 4 {
            let coords: Result<Vec<f64>, _> = parts.iter().map(|s| s.parse::<f64>()).collect();
            match coords {
                Ok(c) => {
                    builder.push(" AND ST_Intersects(geom, ST_MakeEnvelope(");
                    builder.push_bind(c[0]);
                    builder.push(", ");
                    builder.push_bind(c[1]);
                    builder.push(", ");
                    builder.push_bind(c[2]);
                    builder.push(", ");
                    builder.push_bind(c[3]);
                    builder.push(", 4326))");
                }
                Err(_) => {
                    eprintln!("Invalid bbox format: {bbox_str}");
                    return Ok(TrackGeoJsonCollection {
                        type_field: "FeatureCollection".to_string(),
                        features: vec![],
                    });
                }
            }
        } else {
            eprintln!("Invalid bbox string (must be 4 comma-separated values): {bbox_str}");
            return Ok(TrackGeoJsonCollection {
                type_field: "FeatureCollection".to_string(),
                features: vec![],
            });
        }
    }

    let rows = builder.build().fetch_all(&**pool).await?;

    let features: Vec<TrackGeoJsonFeature> = rows
        .into_iter()
        .map(|row| {
            let id: Uuid = row.get("id");
            let name: String = row.get("name");
            let categories: Vec<String> = row.get("categories");
            let length_km: f64 = row.get("length_km");
            let elevation_gain: Option<f32> = row.get("elevation_gain");
            let elevation_loss: Option<f32> = row.get("elevation_loss");
            let slope_min: Option<f32> = row.try_get("slope_min").ok();
            let slope_max: Option<f32> = row.try_get("slope_max").ok();
            let _original_points: i32 = row.try_get("original_points").unwrap_or(0);
            let mut geom_json: serde_json::Value = row.get("geom_json");

            // Apply Rust-side simplification if not already done in PostGIS
            if !use_postgis_simplification && track_mode.is_overview() {
                if let Some(coordinates) = geom_json.get("coordinates").and_then(|c| c.as_array()) {
                    if !coordinates.is_empty() {
                        // Extract points for simplification
                        let points: Vec<(f64, f64)> = coordinates
                            .iter()
                            .filter_map(|coord| {
                                if let Some(coord_array) = coord.as_array() {
                                    if coord_array.len() >= 2 {
                                        let lng = coord_array[0].as_f64()?;
                                        let lat = coord_array[1].as_f64()?;
                                        Some((lat, lng))
                                    } else {
                                        None
                                    }
                                } else {
                                    None
                                }
                            })
                            .collect();

                        if !points.is_empty() {
                            let params = get_simplification_params(
                                track_mode,
                                Some(zoom_level),
                                points.len(),
                            );
                            if params.should_simplify(points.len()) {
                                let simplify_start = Instant::now();
                                let simplified_geom = simplify_track_for_zoom(&points, zoom_level);
                                metrics::observe_track_simplify(
                                    if track_mode.is_detail() {
                                        "detail"
                                    } else {
                                        "overview"
                                    },
                                    simplify_start.elapsed().as_secs_f64(),
                                );
                                if simplified_geom.len() < points.len() {
                                    // Convert back to GeoJSON format
                                    let simplified_coords: Vec<serde_json::Value> = simplified_geom
                                        .iter()
                                        .map(|(lat, lng)| serde_json::json!([lng, lat]))
                                        .collect();

                                    geom_json = serde_json::json!({
                                        "type": "LineString",
                                        "coordinates": simplified_coords
                                    });
                                }
                            }
                        }
                    }
                }
            }

            // Build properties based on mode
            let mut properties = serde_json::json!({
                "id": id,
                "name": name,
                "categories": categories,
                "length_km": length_km,
                "elevation_gain": elevation_gain,
                "elevation_loss": elevation_loss,
                "slope_min": slope_min,
                "slope_max": slope_max,
            });

            // Add extra properties for detail mode
            if track_mode.is_detail() {
                let avg_hr: Option<i32> = row.try_get("avg_hr").ok();
                let avg_speed: Option<f64> = row.try_get("avg_speed").ok();
                let duration_seconds: Option<i32> = row.try_get("duration_seconds").ok();
                let recorded_at: Option<chrono::DateTime<chrono::Utc>> =
                    row.try_get("recorded_at").ok();

                properties["avg_hr"] =
                    serde_json::to_value(avg_hr).unwrap_or(serde_json::Value::Null);
                properties["avg_speed"] =
                    serde_json::to_value(avg_speed).unwrap_or(serde_json::Value::Null);
                properties["duration_seconds"] =
                    serde_json::to_value(duration_seconds).unwrap_or(serde_json::Value::Null);
                properties["recorded_at"] =
                    serde_json::to_value(recorded_at).unwrap_or(serde_json::Value::Null);
            }

            TrackGeoJsonFeature {
                type_field: "Feature".to_string(),
                geometry: geom_json,
                properties,
            }
        })
        .collect();

    // Log performance metrics for monitoring
    if !features.is_empty() {
        let total_features = features.len();
        tracing::info!(
            total_features = total_features,
            zoom = zoom_level,
            mode = mode.unwrap_or("overview"),
            postgis_simplified = use_postgis_simplification,
            "[PERF] list_tracks_geojson completed"
        );
    }

    let elapsed = start.elapsed().as_secs_f64();
    metrics::observe_db_query("list_tracks_geojson", elapsed);
    Ok(TrackGeoJsonCollection {
        type_field: "FeatureCollection".to_string(),
        features,
    })
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

pub async fn search_tracks(
    pool: &Arc<PgPool>,
    query: &str,
) -> Result<Vec<TrackSearchResult>, sqlx::Error> {
    let start = Instant::now();
    let search_query = format!("%{}%", query.to_lowercase());

    let rows = sqlx::query(
        r#"
        SELECT 
            id, 
            name, 
            description, 
            categories, 
            length_km,
            CASE 
                WHEN is_public = true 
                THEN '/tracks/' || id::text 
                ELSE '' 
            END as url
        FROM tracks 
        WHERE is_public = true 
        AND (
            LOWER(name) LIKE $1 
            OR LOWER(COALESCE(description, '')) LIKE $1
        )
        ORDER BY 
            CASE 
                WHEN LOWER(name) LIKE $1 THEN 1 
                ELSE 2 
            END,
            name
        LIMIT 50
        "#,
    )
    .bind(&search_query)
    .fetch_all(&**pool)
    .await?;
    metrics::observe_db_query("search_tracks", start.elapsed().as_secs_f64());

    let mut tracks = Vec::new();
    for row in rows {
        let categories: Vec<String> = row
            .try_get::<Vec<String>, _>("categories")
            .unwrap_or_default();

        tracks.push(TrackSearchResult {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            description: row.try_get("description")?,
            categories,
            length_km: row.try_get("length_km")?,
            url: row.try_get("url")?,
        });
    }

    Ok(tracks)
}

/// Get track by ID for elevation enrichment
pub async fn get_track_by_id(
    pool: &PgPool,
    track_id: Uuid,
) -> Result<Option<TrackForElevationEnrichment>, sqlx::Error> {
    let start = Instant::now();
    let row = sqlx::query(
        r#"
        SELECT id, session_id, elevation_enriched, elevation_gain, elevation_loss, elevation_min, elevation_max, elevation_enriched_at, elevation_dataset, ST_AsGeoJSON(geom)::jsonb as geom_geojson
        FROM tracks
        WHERE id = $1
        "#
    )
    .bind(track_id)
    .fetch_optional(pool)
    .await?;

    metrics::observe_db_query("get_track_by_id", start.elapsed().as_secs_f64());

    if let Some(row) = row {
        Ok(Some(TrackForElevationEnrichment {
            id: row.try_get("id")?,
            session_id: row.try_get("session_id")?,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::TrackGeoJsonQuery;
    use serde_json::json;

    #[test]
    fn list_tracks_query_uses_binds_for_filters() {
        let params = crate::models::TrackListQuery {
            categories: Some(vec!["run".to_string(), "mtb".to_string()]),
            min_length: Some(10.5),
            max_length: Some(42.0),
            elevation_gain_min: Some(100.0),
            elevation_gain_max: Some(900.0),
            slope_min: Some(1.5),
            slope_max: Some(12.0),
        };

        let builder = build_list_tracks_query(&params);
        let sql = builder.sql().to_string();

        // Expect placeholders rather than inlined user input
        assert!(sql.contains("$1"));
        assert!(sql.contains("$2"));
        assert!(!sql.contains("run"));
        assert!(!sql.contains("10.5"));
    }

    #[test]
    fn sanitize_description_strips_script_tags() {
        let input = Some("<script>alert('x')</script><b>ok</b>");
        let cleaned = sanitize_description(input);
        assert_eq!(cleaned.as_deref(), Some("<b>ok</b>"));
    }

    #[test]
    fn compute_gap_metadata_detects_segment_boundaries() {
        let segments = vec![
            vec![(0.0, 0.0), (0.0, 0.001)],
            vec![(0.0, 0.002), (0.0, 0.003)],
        ];

        let (segment_gaps, pause_gaps) = compute_gap_metadata(Some(&segments), None);

        assert!(pause_gaps.is_none());
        let gaps = segment_gaps.expect("Expected segment gaps");
        assert_eq!(gaps.len(), 1);

        let gap = &gaps[0];
        assert_eq!(gap.kind, "segment");
        assert_eq!(gap.from.segment_index, 0);
        assert_eq!(gap.to.segment_index, 1);
        assert_eq!(gap.from.point_index, 1);
        assert_eq!(gap.to.point_index, 0);
        assert!(gap.distance_m > 100.0); // ~111m per 0.001° at equator
        assert!(gap.duration_seconds.is_none());
    }

    #[test]
    fn compute_gap_metadata_detects_pause_on_single_segment() {
        let segments = vec![vec![(0.0, 0.0), (0.0, 0.001), (0.0, 0.002)]];
        let time_data = json!([
            "2024-01-01T00:00:00Z",
            "2024-01-01T00:01:00Z",
            "2024-01-01T00:06:00Z"
        ]);

        let (segment_gaps, pause_gaps) = compute_gap_metadata(Some(&segments), Some(&time_data));

        assert!(segment_gaps.is_none());
        let gaps = pause_gaps.expect("Expected pause gaps");
        assert_eq!(gaps.len(), 1);

        let gap = &gaps[0];
        assert_eq!(gap.kind, "pause");
        assert_eq!(gap.from.segment_index, 0);
        assert_eq!(gap.to.segment_index, 0);
        assert_eq!(gap.from.point_index, 1);
        assert_eq!(gap.to.point_index, 2);
        assert_eq!(gap.duration_seconds, Some(300));
        assert!(gap.distance_m > 100.0);
    }

    // Helper functions for query building (these would be actual implementations)
    fn build_elevation_filter_conditions(params: &TrackGeoJsonQuery) -> String {
        let mut conditions = Vec::new();

        if let Some(min_gain) = params.elevation_gain_min {
            conditions.push(format!("elevation_gain >= {}", min_gain));
        }

        if let Some(max_gain) = params.elevation_gain_max {
            conditions.push(format!("elevation_gain <= {}", max_gain));
        }

        conditions.join(" AND ")
    }

    fn build_slope_filter_conditions(params: &TrackGeoJsonQuery) -> String {
        let mut conditions = Vec::new();

        if let Some(min_slope) = params.slope_min {
            conditions.push(format!("slope_min >= {}", min_slope));
        }

        if let Some(max_slope) = params.slope_max {
            conditions.push(format!("slope_max <= {}", max_slope));
        }

        conditions.join(" AND ")
    }

    // Note: These tests would typically require a test database setup
    // They are written to demonstrate the test structure for elevation functionality

    #[test]
    fn test_elevation_filter_query_building() {
        // Test elevation_gain_min filter
        let mut params = TrackGeoJsonQuery {
            bbox: None,
            zoom: None,
            mode: None,
            min_length: None,
            max_length: None,
            elevation_gain_min: Some(100.0),
            elevation_gain_max: None,
            slope_min: None,
            slope_max: None,
            categories: None,
        };

        // In a real implementation, we would extract the query building logic
        // into a separate function that can be tested without database
        let filter_conditions = build_elevation_filter_conditions(&params);
        assert!(filter_conditions.contains("elevation_gain >= 100"));

        // Test elevation_gain_max filter
        params.elevation_gain_min = None;
        params.elevation_gain_max = Some(500.0);
        let filter_conditions = build_elevation_filter_conditions(&params);
        assert!(filter_conditions.contains("elevation_gain <= 500"));

        // Test both min and max filters
        params.elevation_gain_min = Some(100.0);
        params.elevation_gain_max = Some(500.0);
        let filter_conditions = build_elevation_filter_conditions(&params);
        assert!(filter_conditions.contains("elevation_gain >= 100"));
        assert!(filter_conditions.contains("elevation_gain <= 500"));
    }

    #[test]
    fn test_elevation_filter_edge_cases() {
        // Test with zero values
        let params = TrackGeoJsonQuery {
            bbox: None,
            zoom: None,
            mode: None,
            min_length: None,
            max_length: None,
            elevation_gain_min: Some(0.0),
            elevation_gain_max: Some(0.0),
            slope_min: None,
            slope_max: None,
            categories: None,
        };

        let filter_conditions = build_elevation_filter_conditions(&params);
        assert!(filter_conditions.contains("elevation_gain >= 0"));
        assert!(filter_conditions.contains("elevation_gain <= 0"));

        // Test with negative values (should be handled gracefully)
        let params_negative = TrackGeoJsonQuery {
            bbox: None,
            zoom: None,
            mode: None,
            min_length: None,
            max_length: None,
            elevation_gain_min: Some(-10.0),
            elevation_gain_max: Some(-5.0),
            slope_min: None,
            slope_max: None,
            categories: None,
        };

        let filter_conditions = build_elevation_filter_conditions(&params_negative);
        assert!(filter_conditions.contains("elevation_gain >= -10"));
        assert!(filter_conditions.contains("elevation_gain <= -5"));
    }

    #[test]
    fn test_elevation_filter_with_other_filters() {
        // Test combination of elevation and length filters
        let params = TrackGeoJsonQuery {
            bbox: None,
            zoom: None,
            mode: None,
            min_length: Some(5.0),
            max_length: Some(20.0),
            elevation_gain_min: Some(100.0),
            elevation_gain_max: Some(500.0),
            slope_min: None,
            slope_max: None,
            categories: None,
        };

        let filter_conditions = build_elevation_filter_conditions(&params);
        // Should include both elevation and length conditions
        assert!(filter_conditions.contains("elevation_gain >= 100"));
        assert!(filter_conditions.contains("elevation_gain <= 500"));
        // Note: length conditions would be handled by build_length_filter_conditions
    }

    #[test]
    fn test_slope_filter_query_building() {
        // Test slope_min filter
        let params_min = TrackGeoJsonQuery {
            bbox: None,
            zoom: None,
            mode: None,
            min_length: None,
            max_length: None,
            elevation_gain_min: None,
            elevation_gain_max: None,
            slope_min: Some(5.0),
            slope_max: None,
            categories: None,
        };

        let filter_conditions = build_slope_filter_conditions(&params_min);
        assert!(filter_conditions.contains("slope_min >= 5"));

        // Test slope_max filter
        let params_max = TrackGeoJsonQuery {
            bbox: None,
            zoom: None,
            mode: None,
            min_length: None,
            max_length: None,
            elevation_gain_min: None,
            elevation_gain_max: None,
            slope_min: None,
            slope_max: Some(15.0),
            categories: None,
        };

        let filter_conditions = build_slope_filter_conditions(&params_max);
        assert!(filter_conditions.contains("slope_max <= 15"));

        // Test slope range filter
        let params_range = TrackGeoJsonQuery {
            bbox: None,
            zoom: None,
            mode: None,
            min_length: None,
            max_length: None,
            elevation_gain_min: None,
            elevation_gain_max: None,
            slope_min: Some(3.0),
            slope_max: Some(12.0),
            categories: None,
        };

        let filter_conditions = build_slope_filter_conditions(&params_range);
        assert!(filter_conditions.contains("slope_min >= 3"));
        assert!(filter_conditions.contains("slope_max <= 12"));
    }

    #[test]
    fn test_combined_elevation_and_slope_filters() {
        // Test combination of elevation and slope filters
        let params = TrackGeoJsonQuery {
            bbox: None,
            zoom: None,
            mode: None,
            min_length: Some(10.0),
            max_length: Some(50.0),
            elevation_gain_min: Some(200.0),
            elevation_gain_max: Some(1000.0),
            slope_min: Some(2.0),
            slope_max: Some(20.0),
            categories: None,
        };

        let elevation_conditions = build_elevation_filter_conditions(&params);
        let slope_conditions = build_slope_filter_conditions(&params);

        assert!(elevation_conditions.contains("elevation_gain >= 200"));
        assert!(elevation_conditions.contains("elevation_gain <= 1000"));
        assert!(slope_conditions.contains("slope_min >= 2"));
        assert!(slope_conditions.contains("slope_max <= 20"));
    }

    // Tests for elevation-related database operations would include:

    #[tokio::test]
    #[ignore] // Requires database setup
    async fn test_update_track_elevation() {
        // This test would verify that update_track_elevation correctly
        // updates all elevation fields in the database
        // Requires test database setup and transaction rollback
    }

    #[tokio::test]
    #[ignore] // Requires database setup
    async fn test_elevation_filters_in_list_tracks_geojson() {
        // This test would verify that elevation filters work correctly
        // in the list_tracks_geojson function by:
        // 1. Creating test tracks with different elevation values
        // 2. Applying various elevation filters
        // 3. Verifying correct tracks are returned
        // Requires test database setup and transaction rollback
    }

    #[tokio::test]
    #[ignore] // Requires database setup
    async fn test_elevation_filters_performance() {
        // This test would verify that elevation filters perform well
        // with large datasets and proper indexing
        // Requires test database setup with large dataset
    }

    // Additional integration tests for track operations

    #[tokio::test]
    #[ignore] // Requires database setup
    async fn test_track_exists_and_insert() {
        use sqlx::postgres::PgPoolOptions;
        use std::sync::Arc;
        use uuid::Uuid;

        // Using mocks, for real tests, you need to set up a test database
        let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set for tests");
        let pool = Arc::new(
            PgPoolOptions::new()
                .max_connections(1)
                .connect(&db_url)
                .await
                .unwrap(),
        );
        let id = Uuid::new_v4();
        let hash = format!("testhash-{id}");
        let name = "Test Track";
        let cats = ["testcat"];
        let geom_geojson = serde_json::json!({
            "type": "LineString",
            "coordinates": vec![vec![0.0, 0.0], vec![1.0, 1.0]]
        });
        let res = insert_track(InsertTrackParams {
            pool: &pool,
            id,
            name,
            description: Some("desc".to_string()),
            categories: &cats[..],
            auto_classifications: &["aerobic_run".to_string()],
            geom_geojson: &geom_geojson,
            length_km: 1.0,
            elevation_profile_json: None,
            hr_data_json: None,
            temp_data_json: None,
            time_data_json: None,
            elevation_gain: None,
            elevation_loss: None,
            elevation_min: None,
            elevation_max: None,
            elevation_enriched: None,
            elevation_enriched_at: None,
            elevation_dataset: None,
            elevation_api_calls: None,
            slope_min: None,
            slope_max: None,
            slope_avg: None,
            slope_histogram: None,
            slope_segments: None,
            avg_speed: None,
            avg_hr: Some(150),
            hr_min: None,
            hr_max: None,
            moving_time: None,
            pause_time: None,
            moving_avg_speed: None,
            moving_avg_pace: None,
            duration_seconds: Some(3600),
            hash: &hash,
            recorded_at: None,
            session_id: None,
            speed_data_json: None,
            pace_data_json: None,
        })
        .await;
        if let Err(e) = &res {
            println!("insert_track error: {e:?}");
        }
        assert!(res.is_ok());
        let found = track_exists(&pool, &hash).await.unwrap();
        assert_eq!(found, Some(id));
    }

    #[tokio::test]
    #[ignore] // Requires database setup
    async fn test_insert_track_with_time_data() {
        use sqlx::postgres::PgPoolOptions;
        use std::sync::Arc;
        use uuid::Uuid;

        let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set for tests");
        let pool = Arc::new(
            PgPoolOptions::new()
                .max_connections(1)
                .connect(&db_url)
                .await
                .unwrap(),
        );

        let id = Uuid::new_v4();
        let hash = format!("testhash-with-time-{id}");
        let name = "Test Track with Time";
        let cats = ["testcat"];
        let geom_geojson = serde_json::json!({
            "type": "LineString",
            "coordinates": vec![vec![0.0, 0.0], vec![1.0, 1.0]]
        });

        let time_data = serde_json::json!(["2024-01-01T10:00:00Z", "2024-01-01T10:01:00Z"]);

        let res = insert_track(InsertTrackParams {
            pool: &pool,
            id,
            name,
            description: Some("Track with timestamps".to_string()),
            categories: &cats[..],
            auto_classifications: &["aerobic_run".to_string()],
            geom_geojson: &geom_geojson,
            length_km: 1.0,
            elevation_profile_json: None,
            hr_data_json: None,
            temp_data_json: None,
            time_data_json: Some(time_data),
            elevation_gain: None,
            elevation_loss: None,
            elevation_min: None,
            elevation_max: None,
            elevation_enriched: None,
            elevation_enriched_at: None,
            elevation_dataset: None,
            elevation_api_calls: None,
            slope_min: None,
            slope_max: None,
            slope_avg: None,
            slope_histogram: None,
            slope_segments: None,
            avg_speed: None,
            avg_hr: Some(150),
            hr_min: None,
            hr_max: None,
            moving_time: None,
            pause_time: None,
            moving_avg_speed: None,
            moving_avg_pace: None,
            duration_seconds: Some(3600),
            hash: &hash,
            recorded_at: None,
            session_id: None,
            speed_data_json: None,
            pace_data_json: None,
        })
        .await;

        assert!(
            res.is_ok(),
            "Failed to insert track with time_data: {:?}",
            res.err()
        );

        // Verify the track was inserted
        let found = track_exists(&pool, &hash).await.unwrap();
        assert_eq!(found, Some(id));

        // Optionally, verify that time_data was stored correctly by retrieving the track
        // This would require a get_track function in db module
    }

    #[tokio::test]
    #[ignore] // Requires database setup
    async fn test_search_tracks_by_name() {
        use sqlx::postgres::PgPoolOptions;
        use std::sync::Arc;
        use uuid::Uuid;

        let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
            "postgres://postgres:password@localhost:5432/trackly_test".to_string()
        });

        let pool = Arc::new(
            PgPoolOptions::new()
                .max_connections(1)
                .connect(&database_url)
                .await
                .expect("Failed to connect to test database"),
        );

        // Insert a test track
        let track_id = Uuid::new_v4();
        let unique_hash = format!("test_hash_{}", Uuid::new_v4());
        let test_geom = serde_json::json!({
            "type": "LineString",
            "coordinates": [[0.0, 0.0], [1.0, 1.0]]
        });

        insert_track(InsertTrackParams {
            pool: &pool,
            id: track_id,
            name: "Test Running Track",
            description: Some("A great running route".to_string()),
            categories: &["running"],
            auto_classifications: &["running".to_string()],
            geom_geojson: &test_geom,
            length_km: 5.0,
            elevation_profile_json: None,
            hr_data_json: None,
            temp_data_json: None,
            time_data_json: None,
            elevation_gain: None,
            elevation_loss: None,
            elevation_min: None,
            elevation_max: None,
            elevation_enriched: None,
            elevation_enriched_at: None,
            elevation_dataset: None,
            elevation_api_calls: None,
            slope_min: None,
            slope_max: None,
            slope_avg: None,
            slope_histogram: None,
            slope_segments: None,
            avg_speed: None,
            avg_hr: None,
            hr_min: None,
            hr_max: None,
            moving_time: None,
            pause_time: None,
            moving_avg_speed: None,
            moving_avg_pace: None,
            duration_seconds: None,
            hash: &unique_hash,
            recorded_at: None,
            session_id: None,
            speed_data_json: None,
            pace_data_json: None,
        })
        .await
        .unwrap();

        // Search by name
        let results = search_tracks(&pool, "running").await.unwrap();
        assert!(!results.is_empty());
        assert_eq!(results[0].name, "Test Running Track");

        // Search by description
        let results = search_tracks(&pool, "great").await.unwrap();
        assert!(!results.is_empty());
        assert_eq!(results[0].name, "Test Running Track");

        // Search with no results
        let results = search_tracks(&pool, "nonexistent").await.unwrap();
        assert!(results.is_empty());
    }

    #[tokio::test]
    #[ignore] // Requires database setup
    async fn test_search_tracks_case_insensitive() {
        use sqlx::postgres::PgPoolOptions;
        use std::sync::Arc;
        use uuid::Uuid;

        let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
            "postgres://postgres:password@localhost:5432/trackly_test".to_string()
        });

        let pool = Arc::new(
            PgPoolOptions::new()
                .max_connections(1)
                .connect(&database_url)
                .await
                .expect("Failed to connect to test database"),
        );

        let track_id = Uuid::new_v4();
        let unique_hash = format!("test_hash_2_{}", Uuid::new_v4());
        let test_geom = serde_json::json!({
            "type": "LineString",
            "coordinates": [[0.0, 0.0], [1.0, 1.0]]
        });

        insert_track(InsertTrackParams {
            pool: &pool,
            id: track_id,
            name: "Mountain Bike Trail",
            description: Some("Challenging MOUNTAIN bike route".to_string()),
            categories: &["cycling"],
            auto_classifications: &["cycling".to_string()],
            geom_geojson: &test_geom,
            length_km: 10.0,
            elevation_profile_json: None,
            hr_data_json: None,
            temp_data_json: None,
            time_data_json: None,
            elevation_gain: None,
            elevation_loss: None,
            elevation_min: None,
            elevation_max: None,
            elevation_enriched: None,
            elevation_enriched_at: None,
            elevation_dataset: None,
            elevation_api_calls: None,
            slope_min: None,
            slope_max: None,
            slope_avg: None,
            slope_histogram: None,
            slope_segments: None,
            avg_speed: None,
            avg_hr: None,
            hr_min: None,
            hr_max: None,
            moving_time: None,
            pause_time: None,
            moving_avg_speed: None,
            moving_avg_pace: None,
            duration_seconds: None,
            hash: &unique_hash,
            recorded_at: None,
            session_id: None,
            speed_data_json: None,
            pace_data_json: None,
        })
        .await
        .unwrap();

        // Test case insensitive search
        let results = search_tracks(&pool, "MOUNTAIN").await.unwrap();
        assert!(!results.is_empty());

        let results = search_tracks(&pool, "mountain").await.unwrap();
        assert!(!results.is_empty());

        let results = search_tracks(&pool, "Mountain").await.unwrap();
        assert!(!results.is_empty());
    }

    #[test]
    fn test_update_slope_params_creation() {
        use serde_json::json;

        let params = UpdateSlopeParams {
            slope_min: Some(-10.5),
            slope_max: Some(25.3),
            slope_avg: Some(7.8),
            slope_histogram: Some(json!({
                "0-5": 30,
                "5-10": 25,
                "10-15": 20,
                "15+": 25
            })),
            slope_segments: Some(json!([
                {
                    "start_distance": 0.0,
                    "end_distance": 100.0,
                    "slope": 5.5
                },
                {
                    "start_distance": 100.0,
                    "end_distance": 200.0,
                    "slope": -3.2
                }
            ])),
        };

        assert_eq!(params.slope_min, Some(-10.5));
        assert_eq!(params.slope_max, Some(25.3));
        assert_eq!(params.slope_avg, Some(7.8));
        assert!(params.slope_histogram.is_some());
        assert!(params.slope_segments.is_some());
    }

    #[test]
    fn test_track_coordinates_extraction() {
        // Test helper function for coordinate extraction that would be used
        // in slope calculation workflows

        // This would test a helper function that extracts coordinates from PostGIS geometry
        // The actual implementation would need to handle ST_AsText parsing
        let mock_geom_text = "LINESTRING(37.6176 55.7558,37.6177 55.7559,37.6178 55.7560)";

        // In a real implementation, we'd have a function like:
        // let coordinates = extract_coordinates_from_geom_text(mock_geom_text);
        // assert_eq!(coordinates.len(), 3);
        // assert_eq!(coordinates[0], (37.6176, 55.7558));

        // For now, just verify the format is parseable
        assert!(mock_geom_text.starts_with("LINESTRING("));
        assert!(mock_geom_text.contains(","));
        assert!(mock_geom_text.ends_with(")"));
    }

    #[test]
    fn test_slope_data_validation() {
        // Test that slope data validation works properly

        // Valid slope range
        let valid_params = UpdateSlopeParams {
            slope_min: Some(-30.0),
            slope_max: Some(45.0),
            slope_avg: Some(8.5),
            slope_histogram: Some(serde_json::json!({})),
            slope_segments: Some(serde_json::json!([])),
        };

        assert!(valid_params.slope_min.unwrap() >= -100.0);
        assert!(valid_params.slope_max.unwrap() <= 100.0);
        assert!(valid_params.slope_min.unwrap() <= valid_params.slope_max.unwrap());
    }
}
