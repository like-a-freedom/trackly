use crate::models::*;
use crate::track_utils::{get_simplification_params, simplify_track_for_zoom};
use sqlx::{PgPool, Row};
use std::sync::Arc;
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
    pub elevation_up: Option<f64>,
    pub elevation_down: Option<f64>,
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
}

pub async fn insert_track(params: InsertTrackParams<'_>) -> Result<(), sqlx::Error> {
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
        elevation_up,
        elevation_down,
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
    } = params;
    sqlx::query(
        r#"
        INSERT INTO tracks (
            id, name, description, categories, auto_classifications, geom, length_km, elevation_profile,
            elevation_up, elevation_down, avg_speed, avg_hr, hr_min, hr_max, moving_time, pause_time, moving_avg_speed, moving_avg_pace, hr_data, temp_data, time_data, duration_seconds,
            hash, recorded_at, created_at, session_id, is_public
        )
        VALUES (
            $1, $2, $3, $4, $5, ST_SetSRID(ST_GeomFromGeoJSON($6), 4326), $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
            $23, $24, DEFAULT, $25, $26
        )
    "#,
    )
    .bind(id)
    .bind(name)
    .bind(description)
    .bind(categories)
    .bind(auto_classifications)
    .bind(geom_geojson)
    .bind(length_km)
    .bind(elevation_profile_json)
    .bind(elevation_up)
    .bind(elevation_down)
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
    .execute(&**pool)
    .await?;
    Ok(())
}

pub async fn list_tracks(
    pool: &Arc<PgPool>,
    params: &crate::models::TrackListQuery,
) -> Result<Vec<TrackListItem>, sqlx::Error> {
    let mut query =
        "SELECT id, name, categories, length_km FROM tracks WHERE is_public = TRUE".to_string();
    let mut args: Vec<String> = Vec::new();
    if let Some(ref cats) = params.categories {
        query.push_str(" AND categories && $1");
        args.push(format!("{{{}}}", cats.join(",")));
    }
    if let Some(min) = params.min_length {
        query.push_str(&format!(" AND length_km >= {min}"));
    }
    if let Some(max) = params.max_length {
        query.push_str(&format!(" AND length_km <= {max}"));
    }
    let rows = sqlx::query(&query).fetch_all(&**pool).await?;
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
        result.push(TrackListItem {
            id,
            name,
            categories,
            length_km,
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
        SELECT id, name, description, categories, auto_classifications, ST_AsGeoJSON(geom) as geom_geojson, length_km, elevation_profile, hr_data, temp_data, time_data, elevation_up, elevation_down, avg_speed, avg_hr, hr_min, hr_max, moving_time, pause_time, moving_avg_speed, moving_avg_pace, duration_seconds, hash, recorded_at, created_at, updated_at, session_id
        FROM tracks WHERE id = $1
    "#)
        .bind(id)
        .fetch_optional(&**pool)
        .await?;
    if let Some(row) = row {
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
            geom_geojson: serde_json::from_str(
                row.try_get::<&str, _>("geom_geojson")
                    .expect("Failed to get geom_geojson"),
            )
            .unwrap_or(serde_json::json!({})),
            length_km: row
                .try_get("length_km")
                .expect("Failed to get length_km: length_km column missing or wrong type"),
            elevation_profile: row.try_get("elevation_profile").ok(),
            hr_data: row.try_get("hr_data").ok(),
            temp_data: row.try_get("temp_data").ok(),
            time_data: row.try_get("time_data").ok(),
            elevation_up: row
                .try_get("elevation_up")
                .expect("Failed to get elevation_up: elevation_up column missing or wrong type"),
            elevation_down: row.try_get("elevation_down").expect(
                "Failed to get elevation_down: elevation_down column missing or wrong type",
            ),
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
    let track_mode = TrackMode::from_string(mode.unwrap_or("detail"));
    let zoom_level = zoom.unwrap_or(15.0); // Default to high detail for track detail view
    
    let row = sqlx::query(r#"
        SELECT id, name, description, categories, auto_classifications, ST_AsGeoJSON(geom) as geom_geojson, length_km, elevation_profile, hr_data, temp_data, time_data, elevation_up, elevation_down, avg_speed, avg_hr, hr_min, hr_max, moving_time, pause_time, moving_avg_speed, moving_avg_pace, duration_seconds, hash, recorded_at, created_at, updated_at, session_id, ST_NPoints(geom) as original_points
        FROM tracks WHERE id = $1
    "#)
        .bind(id)
        .fetch_optional(&**pool)
        .await?;
        
    if let Some(row) = row {
        let original_points: i32 = row.try_get("original_points").unwrap_or(0);
        let mut geom_geojson: serde_json::Value = serde_json::from_str(
            row.try_get::<&str, _>("geom_geojson")
                .expect("Failed to get geom_geojson"),
        )
        .unwrap_or(serde_json::json!({}));
        
        // Apply simplification for huge tracks or overview mode
        let params = get_simplification_params(track_mode, Some(zoom_level), original_points as usize);
        if params.should_simplify(original_points as usize) {
            if let Some(coordinates) = geom_geojson.get("coordinates").and_then(|c| c.as_array()) {
                if !coordinates.is_empty() {
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
                        let simplified_geom = simplify_track_for_zoom(&points, zoom_level);
                        if simplified_geom.len() < points.len() {
                            let simplified_coords: Vec<serde_json::Value> = simplified_geom
                                .iter()
                                .map(|(lat, lng)| serde_json::json!([lng, lat]))
                                .collect();
                            
                            geom_geojson = serde_json::json!({
                                "type": "LineString",
                                "coordinates": simplified_coords
                            });
                        }
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
        
        let hr_data = simplify_chart_data(
            row.try_get("hr_data").ok(),
            track_mode,
            zoom_level,
        );
        
        let temp_data = simplify_chart_data(
            row.try_get("temp_data").ok(),
            track_mode,
            zoom_level,
        );
        
        let time_data = simplify_chart_data(
            row.try_get("time_data").ok(),
            track_mode,
            zoom_level,
        );
        
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
            geom_geojson,
            length_km: row
                .try_get("length_km")
                .expect("Failed to get length_km: length_km column missing or wrong type"),
            elevation_profile,
            hr_data,
            temp_data,
            time_data,
            elevation_up: row
                .try_get("elevation_up")
                .expect("Failed to get elevation_up: elevation_up column missing or wrong type"),
            elevation_down: row.try_get("elevation_down").expect(
                "Failed to get elevation_down: elevation_down column missing or wrong type",
            ),
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
        }))
    } else {
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
                    TrackMode::Overview => 500,  // For overview mode, limit chart data aggressively
                    TrackMode::Detail => 1500,   // For detail mode, allow more points but still limit for performance
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
        },
        None => None,
    }
}

pub async fn list_tracks_geojson(
    pool: &Arc<PgPool>,
    bbox: Option<&str>,
    zoom: Option<f64>,
    mode: Option<&str>,
) -> Result<TrackGeoJsonCollection, sqlx::Error> {
    let track_mode = TrackMode::from_string(mode.unwrap_or("overview"));
    let zoom_level = zoom.unwrap_or(12.0);
    
    // Build base SQL with zoom-based simplification using PostGIS ST_Simplify
    let use_postgis_simplification = track_mode.is_overview() && zoom_level <= 14.0;
    
    let base_sql = if use_postgis_simplification {
        // Use PostGIS ST_Simplify for overview mode with reasonable zoom levels
        String::from(
            "SELECT id, name, categories, length_km, 
             CASE 
               WHEN ST_NPoints(geom) > 1000 THEN 
                 ST_AsGeoJSON(ST_Simplify(geom, tolerance_for_zoom_degrees($5)))
               ELSE ST_AsGeoJSON(geom) 
             END as geom_json,
             ST_NPoints(geom) as original_points"
        )
    } else {
        // Return full geometry for Rust-side processing
        String::from(
            "SELECT id, name, categories, length_km, ST_AsGeoJSON(geom) as geom_json,
             ST_NPoints(geom) as original_points"
        )
    };
    
    // Add properties based on mode
    let properties_sql = if track_mode.is_overview() {
        // Minimal properties for overview mode
        ""
    } else {
        // Full properties for detail mode  
        ", elevation_up, elevation_down, avg_hr, avg_speed, duration_seconds, recorded_at"
    };
    
    let full_sql = format!(
        "{base_sql}{properties_sql} FROM tracks WHERE is_public = TRUE"
    );

    let rows = if let Some(bbox_str) = bbox {
        let parts: Vec<&str> = bbox_str.split(',').collect();
        if parts.len() == 4 {
            let coords: Result<Vec<f64>, _> = parts.iter().map(|s| s.parse::<f64>()).collect();
            match coords {
                Ok(c) => {
                    let sql = format!(
                        "{full_sql} AND ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))"
                    );
                    if use_postgis_simplification {
                        sqlx::query(&sql)
                            .bind(c[0])
                            .bind(c[1])
                            .bind(c[2])
                            .bind(c[3])
                            .bind(zoom_level)
                            .fetch_all(&**pool)
                            .await?
                    } else {
                        sqlx::query(&sql)
                            .bind(c[0])
                            .bind(c[1])
                            .bind(c[2])
                            .bind(c[3])
                            .fetch_all(&**pool)
                            .await?
                    }
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
    } else if use_postgis_simplification {
        sqlx::query(&full_sql)
            .bind(zoom_level)
            .fetch_all(&**pool)
            .await?
    } else {
        sqlx::query(&full_sql).fetch_all(&**pool).await?
    };

    let features: Vec<TrackGeoJsonFeature> = rows
        .into_iter()
        .map(|row| {
            let id: Uuid = row.get("id");
            let name: String = row.get("name");
            let categories: Vec<String> = row.get("categories");
            let length_km: f64 = row.get("length_km");
            let _original_points: i32 = row.try_get("original_points").unwrap_or(0);
            let mut geom_json: String = row.get("geom_json");
            
            // Apply Rust-side simplification if not already done in PostGIS
            if !use_postgis_simplification && track_mode.is_overview() {
                if let Ok(geom_value) = serde_json::from_str::<serde_json::Value>(&geom_json) {
                    if let Some(coordinates) = geom_value.get("coordinates").and_then(|c| c.as_array()) {
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
                                let params = get_simplification_params(track_mode, Some(zoom_level), points.len());
                                if params.should_simplify(points.len()) {
                                    let simplified_geom = simplify_track_for_zoom(&points, zoom_level);
                                    if simplified_geom.len() < points.len() {
                                        // Convert back to GeoJSON format
                                        let simplified_coords: Vec<serde_json::Value> = simplified_geom
                                            .iter()
                                            .map(|(lat, lng)| serde_json::json!([lng, lat]))
                                            .collect();
                                        
                                        let simplified_geojson = serde_json::json!({
                                            "type": "LineString",
                                            "coordinates": simplified_coords
                                        });
                                        
                                        geom_json = simplified_geojson.to_string();
                                    }
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
            });
            
            // Add extra properties for detail mode
            if track_mode.is_detail() {
                let elevation_up: Option<f64> = row.try_get("elevation_up").ok();
                let elevation_down: Option<f64> = row.try_get("elevation_down").ok();
                let avg_hr: Option<i32> = row.try_get("avg_hr").ok();
                let avg_speed: Option<f64> = row.try_get("avg_speed").ok();
                let duration_seconds: Option<i32> = row.try_get("duration_seconds").ok();
                let recorded_at: Option<chrono::DateTime<chrono::Utc>> =
                    row.try_get("recorded_at").ok();
                
                properties["elevation_up"] = serde_json::to_value(elevation_up).unwrap_or(serde_json::Value::Null);
                properties["elevation_down"] = serde_json::to_value(elevation_down).unwrap_or(serde_json::Value::Null);
                properties["avg_hr"] = serde_json::to_value(avg_hr).unwrap_or(serde_json::Value::Null);
                properties["avg_speed"] = serde_json::to_value(avg_speed).unwrap_or(serde_json::Value::Null);
                properties["duration_seconds"] = serde_json::to_value(duration_seconds).unwrap_or(serde_json::Value::Null);
                properties["recorded_at"] = serde_json::to_value(recorded_at).unwrap_or(serde_json::Value::Null);
            }

            TrackGeoJsonFeature {
                type_field: "Feature".to_string(),
                geometry: serde_json::from_str(&geom_json).unwrap_or_else(|e| {
                    eprintln!("Failed to parse geometry GeoJSON: {e}");
                    serde_json::json!({})
                }),
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
    sqlx::query(
        r#"
        UPDATE tracks
        SET description = $1,
            updated_at = NOW()
        WHERE id = $2
        "#,
    )
    .bind(new_description)
    .bind(track_id)
    .execute(&**pool)
    .await?;
    Ok(())
}

pub async fn update_track_name(
    pool: &Arc<PgPool>,
    track_id: Uuid,
    new_name: &str,
) -> Result<(), sqlx::Error> {
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
    Ok(())
}

pub async fn delete_track(pool: &Arc<PgPool>, track_id: Uuid) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        r#"
        DELETE FROM tracks WHERE id = $1
        "#,
    )
    .bind(track_id)
    .execute(&**pool)
    .await?;
    Ok(result.rows_affected())
}

pub async fn search_tracks(
    pool: &Arc<PgPool>,
    query: &str,
) -> Result<Vec<TrackSearchResult>, sqlx::Error> {
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
