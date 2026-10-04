use crate::metrics;
use crate::models::*;
use crate::track_utils::{get_simplification_params, simplify_track_for_zoom};
use sqlx::{PgPool, Postgres, QueryBuilder, Row};
use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;

/// Append shared ownership and attribute filter WHERE clauses to a query builder.
///
/// `col_prefix` is used for table-qualified column names (e.g. `"t."` for heatmap queries).
pub fn build_track_filter_sql(
    qb: &mut QueryBuilder<Postgres>,
    filters: &dyn crate::models::TrackFilterParams,
    col_prefix: &str,
) {
    // Determine ownership filter based on parameters
    // Priority: owner_user_id > owner_session_id
    let mine = filters.mine().unwrap_or(false);

    if mine {
        // Filter by authenticated user or session
        if let Some(user_id) = filters.owner_user_id() {
            qb.push(format!(" WHERE {col_prefix}user_id = "));
            qb.push_bind(user_id);
        } else if let Some(session_id) = filters.owner_session_id() {
            qb.push(format!(" WHERE {col_prefix}session_id = "));
            qb.push_bind(session_id);
        } else {
            // No ownership context, show public only
            qb.push(format!(" WHERE {col_prefix}is_public = TRUE"));
        }
    } else if let Some(user_id) = filters.owner_user_id() {
        // Show user's tracks (private + public) + other public tracks
        qb.push(format!(" WHERE ({col_prefix}user_id = "));
        qb.push_bind(user_id);
        qb.push(format!(" OR {col_prefix}is_public = TRUE)"));
    } else if let Some(session_id) = filters.owner_session_id() {
        // Show session's tracks (private + public) + other public tracks
        qb.push(format!(" WHERE ({col_prefix}session_id = "));
        qb.push_bind(session_id);
        qb.push(format!(" OR {col_prefix}is_public = TRUE)"));
    } else {
        // Default: only public tracks
        qb.push(format!(" WHERE {col_prefix}is_public = TRUE"));
    }

    if let Some(cats) = filters.categories()
        && !cats.is_empty()
    {
        qb.push(format!(" AND {col_prefix}categories && "));
        qb.push_bind(cats);
    }

    if let Some(min) = filters.min_length() {
        qb.push(format!(" AND {col_prefix}length_km >= "));
        qb.push_bind(min);
    }
    if let Some(max) = filters.max_length() {
        qb.push(format!(" AND {col_prefix}length_km <= "));
        qb.push_bind(max);
    }
    if let Some(min) = filters.elevation_gain_min() {
        qb.push(format!(" AND {col_prefix}elevation_gain >= "));
        qb.push_bind(min);
    }
    if let Some(max) = filters.elevation_gain_max() {
        qb.push(format!(" AND {col_prefix}elevation_gain <= "));
        qb.push_bind(max);
    }
    if let Some(min) = filters.slope_min() {
        qb.push(format!(" AND {col_prefix}slope_min >= "));
        qb.push_bind(min);
    }
    if let Some(max) = filters.slope_max() {
        qb.push(format!(" AND {col_prefix}slope_max <= "));
        qb.push_bind(max);
    }
}

pub fn build_list_tracks_query(
    params: &dyn crate::models::TrackFilterParams,
) -> QueryBuilder<Postgres> {
    let mut builder = QueryBuilder::<Postgres>::new(
        "SELECT id, name, categories, length_km, elevation_gain, elevation_loss, elevation_enriched, slope_min, slope_max, slope_avg FROM tracks",
    );

    build_track_filter_sql(&mut builder, params, "");

    builder
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
        let id: Uuid = row.try_get::<Uuid, _>("id")?;
        let name: String = row.try_get("name")?;
        let categories: Vec<String> = row.try_get("categories")?;
        let length_km: f64 = row.try_get("length_km")?;
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

/// Entry used for sitemap generation
pub struct SitemapEntry {
    pub id: Uuid,
    pub lastmod: chrono::DateTime<chrono::Utc>,
}

/// Return list of public tracks with last modification time for sitemap generation
pub async fn list_public_tracks_for_sitemap(
    pool: &Arc<PgPool>,
) -> Result<Vec<SitemapEntry>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT id, COALESCE(updated_at, created_at) as lastmod FROM tracks WHERE is_public = TRUE",
    )
    .fetch_all(&**pool)
    .await?;
    let mut out = Vec::new();
    for row in rows {
        let id: Uuid = row.try_get::<Uuid, _>("id")?;
        let lastmod: chrono::DateTime<chrono::Utc> =
            row.try_get::<chrono::DateTime<chrono::Utc>, _>("lastmod")?;
        out.push(SitemapEntry { id, lastmod });
    }
    Ok(out)
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

    let mut builder = QueryBuilder::<Postgres>::new(
        "SELECT id, name, categories, length_km, elevation_gain, elevation_loss, slope_min, slope_max,",
    );

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

    builder.push(" FROM tracks");

    build_track_filter_sql(&mut builder, filter_params, "");

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
            if !use_postgis_simplification
                && track_mode.is_overview()
                && let Some(coordinates) = geom_json.get("coordinates").and_then(|c| c.as_array())
                && !coordinates.is_empty()
            {
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
                    let params =
                        get_simplification_params(track_mode, Some(zoom_level), points.len());
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

pub fn heatmap_grid_size_degrees(zoom_level: f64) -> f64 {
    let clamped_zoom = zoom_level.clamp(0.0, 20.0);
    let degrees_per_pixel = 360.0 / (2.0_f64.powf(clamped_zoom) * 256.0);
    let grid_size = degrees_per_pixel * 10.0;
    grid_size.clamp(0.00015, 0.05)
}

pub async fn list_tracks_heatmap(
    pool: &Arc<PgPool>,
    bbox: Option<&str>,
    zoom: Option<f64>,
    filter_params: &crate::models::TrackGeoJsonQuery,
) -> Result<Vec<HeatmapPoint>, sqlx::Error> {
    let start = Instant::now();
    let bbox_str = match bbox {
        Some(value) => value,
        None => return Ok(vec![]),
    };

    let parts: Vec<&str> = bbox_str.split(',').collect();
    if parts.len() != 4 {
        return Ok(vec![]);
    }

    let coords: Vec<f64> = match parts
        .iter()
        .map(|value| value.parse::<f64>())
        .collect::<Result<Vec<_>, _>>()
    {
        Ok(values) => values,
        Err(_) => return Ok(vec![]),
    };

    let zoom_level = zoom.unwrap_or(12.0);
    let grid_size = heatmap_grid_size_degrees(zoom_level);

    let mut builder = QueryBuilder::<Postgres>::new("WITH bbox AS (SELECT ST_MakeEnvelope(");
    builder.push_bind(coords[0]);
    builder.push(", ");
    builder.push_bind(coords[1]);
    builder.push(", ");
    builder.push_bind(coords[2]);
    builder.push(", ");
    builder.push_bind(coords[3]);
    builder.push(", 4326) AS geom), filtered AS (SELECT t.geom FROM tracks t, bbox b");

    build_track_filter_sql(&mut builder, filter_params, "t.");

    builder.push(" AND ST_Intersects(t.geom, b.geom))");
    builder.push(", points AS (SELECT (ST_DumpPoints(ST_Intersection(t.geom, b.geom))).geom AS pt FROM filtered t, bbox b)");
    builder.push(", grid AS (SELECT ST_SnapToGrid(pt, ");
    builder.push_bind(grid_size);
    builder.push(", ");
    builder.push_bind(grid_size);
    builder.push(") AS cell, COUNT(*)::int AS weight FROM points GROUP BY cell)");
    builder.push(" SELECT ST_Y(cell) AS lat, ST_X(cell) AS lon, weight FROM grid ORDER BY weight DESC LIMIT ");
    builder.push_bind(5000_i64);

    let rows = builder.build().fetch_all(&**pool).await?;
    let points = rows
        .into_iter()
        .filter_map(|row| {
            let lat: f64 = row.try_get("lat").ok()?;
            let lon: f64 = row.try_get("lon").ok()?;
            let weight: i32 = row.try_get("weight").unwrap_or(0);
            Some(HeatmapPoint { lat, lon, weight })
        })
        .collect();

    metrics::observe_db_query("list_tracks_heatmap", start.elapsed().as_secs_f64());
    Ok(points)
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
