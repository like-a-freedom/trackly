use crate::models::*;
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

pub async fn list_tracks_geojson(
    pool: &Arc<PgPool>,
    bbox: Option<&str>,
) -> Result<TrackGeoJsonCollection, sqlx::Error> {
    let base_sql = String::from(
        "SELECT id, name, categories, length_km, elevation_up, elevation_down, avg_hr, avg_speed, duration_seconds, recorded_at, ST_AsGeoJSON(geom) as geom_json FROM tracks WHERE is_public = TRUE",
    );

    let rows = if let Some(bbox_str) = bbox {
        let parts: Vec<&str> = bbox_str.split(',').collect();
        if parts.len() == 4 {
            let coords: Result<Vec<f64>, _> = parts.iter().map(|s| s.parse::<f64>()).collect();
            match coords {
                Ok(c) => {
                    let sql = format!(
                        "{base_sql} AND ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))"
                    );
                    sqlx::query(&sql)
                        .bind(c[0])
                        .bind(c[1])
                        .bind(c[2])
                        .bind(c[3])
                        .fetch_all(&**pool)
                        .await?
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
    } else {
        sqlx::query(&base_sql).fetch_all(&**pool).await?
    };

    let features = rows
        .into_iter()
        .map(|row| {
            let id: Uuid = row.get("id");
            let name: String = row.get("name");
            let categories: Vec<String> = row.get("categories");
            let length_km: f64 = row.get("length_km");
            let elevation_up: Option<f64> = row.try_get("elevation_up").ok();
            let elevation_down: Option<f64> = row.try_get("elevation_down").ok();
            let avg_hr: Option<i32> = row.try_get("avg_hr").ok();
            let avg_speed: Option<f64> = row.try_get("avg_speed").ok();
            let duration_seconds: Option<i32> = row.try_get("duration_seconds").ok();
            let recorded_at: Option<chrono::DateTime<chrono::Utc>> =
                row.try_get("recorded_at").ok();
            let geom_json: String = row.get("geom_json");
            TrackGeoJsonFeature {
                type_field: "Feature".to_string(),
                geometry: serde_json::from_str(&geom_json).unwrap_or_else(|e| {
                    eprintln!("Failed to parse geometry GeoJSON: {e}");
                    serde_json::json!({})
                }),
                properties: serde_json::json!({
                    "id": id,
                    "name": name,
                    "categories": categories,
                    "length_km": length_km,
                    "elevation_up": elevation_up,
                    "elevation_down": elevation_down,
                    "avg_hr": avg_hr,
                    "avg_speed": avg_speed,
                    "duration_seconds": duration_seconds,
                    "recorded_at": recorded_at,
                }),
            }
        })
        .collect();
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
