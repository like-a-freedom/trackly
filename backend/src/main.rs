use axum::extract::Query;
use axum::extract::State;
use axum::http::{header, HeaderValue};
use axum::response::Response;
use axum::{
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use axum_extra::extract::multipart::Multipart as AxumMultipart;
use gpx::{write, Gpx, GpxVersion, Track, TrackSegment, Waypoint};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};
use std::net::SocketAddr;
use std::sync::Arc;
use tracing::{debug, error, info};
use uuid::Uuid;
mod track_utils;

#[derive(Serialize)]
pub struct TrackUploadResponse {
    id: Uuid,
    already_exists: bool,
    url: String,
}

#[derive(Debug, Deserialize)]
pub struct TrackListQuery {
    pub categories: Option<Vec<String>>,
    pub min_length: Option<f64>,
    pub max_length: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct TrackListItem {
    pub id: Uuid,
    pub name: String,
    pub categories: Vec<String>,
    pub length_km: f64,
    pub url: String,
}

async fn upload_track(
    State(pool): State<Arc<PgPool>>,
    mut multipart: AxumMultipart,
) -> Result<Json<TrackUploadResponse>, StatusCode> {
    info!("[upload_track] called");
    let mut name = None;
    let mut description = None;
    let mut categories = Vec::new();
    let mut session_id = None;
    let mut file_bytes = None;
    let mut file_name = None;

    while let Some(field) = multipart.next_field().await.unwrap() {
        debug!(field_name = ?field.name(), "[upload_track] got field");
        match field.name() {
            Some("name") => name = Some(field.text().await.unwrap()),
            Some("description") => description = Some(field.text().await.unwrap()),
            Some("categories") => {
                let cats = field.text().await.unwrap();
                categories = cats.split(',').map(|s| s.trim().to_string()).collect();
            }
            Some("session_id") => {
                let sid = field.text().await.unwrap();
                session_id = Uuid::parse_str(&sid).ok();
            }
            Some("file") => {
                file_name = field.file_name().map(|s| s.to_string());
                file_bytes = Some(field.bytes().await.unwrap());
            }
            _ => {}
        }
    }
    let file_bytes = match file_bytes {
        Some(b) => b,
        None => {
            error!("[upload_track] no file provided");
            return Err(StatusCode::BAD_REQUEST);
        }
    };
    let file_name = match file_name {
        Some(f) => f,
        None => {
            error!("[upload_track] no file name provided");
            return Err(StatusCode::BAD_REQUEST);
        }
    };
    let ext = file_name.split('.').last().unwrap_or("").to_lowercase();
    if ext != "gpx" && ext != "kml" {
        error!(?file_name, "[upload_track] unsupported file extension");
        return Err(StatusCode::UNSUPPORTED_MEDIA_TYPE);
    }
    let (
        geom_wkt,
        length_km,
        elevation_up,
        elevation_down,
        avg_speed,
        avg_hr,
        duration_seconds,
        hash,
    ) = if ext == "gpx" {
        track_utils::parse_gpx(&file_bytes).map_err(|e| {
            error!(?e, "[upload_track] failed to parse gpx");
            StatusCode::UNPROCESSABLE_ENTITY
        })?
    } else {
        track_utils::parse_kml(&file_bytes).map_err(|e| {
            error!(?e, "[upload_track] failed to parse kml");
            StatusCode::UNPROCESSABLE_ENTITY
        })?
    };
    let rec = sqlx::query("SELECT id FROM tracks WHERE hash = $1")
        .bind(&hash)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| {
            error!(?e, "[upload_track] db error on dedup");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    if let Some(existing) = rec {
        let id: Uuid = existing.try_get::<Uuid, _>("id").unwrap();
        info!(?id, "[upload_track] duplicate track");
        return Ok(Json(TrackUploadResponse {
            id,
            already_exists: true,
            url: format!("/tracks/{}", id),
        }));
    }
    let id = Uuid::new_v4();
    let name: String = name
        .or(Some(file_name))
        .unwrap_or_else(|| "Unnamed track".to_string());
    let cats: Vec<&str> = categories.iter().map(|s| s.as_str()).collect();
    sqlx::query(r#"
        INSERT INTO tracks (id, name, description, categories, geom, length_km, elevation_up, elevation_down, avg_speed, avg_hr, duration_seconds, hash, session_id)
        VALUES ($1, $2, $3, $4, ST_GeomFromText($5, 4326), $6, $7, $8, $9, $10, $11, $12, $13)
    "#)
        .bind(id)
        .bind(&name)
        .bind(description)
        .bind(&cats)
        .bind(&geom_wkt)
        .bind(length_km)
        .bind(elevation_up)
        .bind(elevation_down)
        .bind(avg_speed)
        .bind(avg_hr)
        .bind(duration_seconds)
        .bind(&hash)
        .bind(session_id)
        .execute(&*pool)
        .await
        .map_err(|e| {
            error!(?e, "[upload_track] db error on insert");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    info!(?id, "[upload_track] track uploaded successfully");
    Ok(Json(TrackUploadResponse {
        id,
        already_exists: false,
        url: format!("/tracks/{}", id),
    }))
}

async fn list_tracks(
    State(pool): State<Arc<PgPool>>,
    axum::extract::Query(params): axum::extract::Query<TrackListQuery>,
) -> Result<Json<Vec<TrackListItem>>, StatusCode> {
    info!(?params, "[list_tracks] called");
    let mut query =
        "SELECT id, name, categories, length_km FROM tracks WHERE is_public = TRUE".to_string();
    let mut args: Vec<String> = Vec::new();
    if let Some(ref cats) = params.categories {
        query.push_str(" AND categories && $1");
        args.push(format!("{{{}}}", cats.join(",")));
    }
    if let Some(min) = params.min_length {
        query.push_str(&format!(" AND length_km >= {}", min));
    }
    if let Some(max) = params.max_length {
        query.push_str(&format!(" AND length_km <= {}", max));
    }
    let rows = sqlx::query(&query).fetch_all(&*pool).await.map_err(|e| {
        error!(?e, "[list_tracks] db error");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let mut result = Vec::new();
    for row in rows {
        let id: Uuid = row.try_get::<Uuid, _>("id").unwrap();
        let name: String = row.try_get("name").unwrap();
        let categories: Vec<String> = row.try_get("categories").unwrap();
        let length_km: f64 = row.try_get("length_km").unwrap();
        result.push(TrackListItem {
            id,
            name,
            categories,
            length_km,
            url: format!("/tracks/{}", id),
        });
    }
    info!(count = result.len(), "[list_tracks] returning tracks");
    Ok(Json(result))
}

#[derive(Serialize)]
pub struct TrackDetail {
    id: Uuid,
    name: String,
    description: Option<String>,
    categories: Vec<String>,
    geom_wkt: String,
    length_km: f64,
    elevation_up: Option<f64>,
    elevation_down: Option<f64>,
    avg_speed: Option<f64>,
    avg_hr: Option<i32>,
    duration_seconds: Option<i32>,
}

async fn get_track(
    State(pool): State<Arc<PgPool>>,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
) -> Result<Json<TrackDetail>, StatusCode> {
    info!(?id, "[get_track] called");
    let row = sqlx::query(r#"
        SELECT id, name, description, categories, ST_AsText(geom) as geom_wkt, length_km, elevation_up, elevation_down, avg_speed, avg_hr, duration_seconds
        FROM tracks WHERE id = $1
    "#)
        .bind(id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| {
            error!(?e, "[get_track] db error");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    if let Some(row) = row {
        info!(?id, "[get_track] found");
        Ok(Json(TrackDetail {
            id: row.try_get::<Uuid, _>("id").unwrap(),
            name: row.try_get("name").unwrap(),
            description: row.try_get("description").unwrap(),
            categories: row.try_get("categories").unwrap(),
            geom_wkt: row.try_get("geom_wkt").unwrap(),
            length_km: row.try_get("length_km").unwrap(),
            elevation_up: row.try_get("elevation_up").unwrap(),
            elevation_down: row.try_get("elevation_down").unwrap(),
            avg_speed: row.try_get("avg_speed").unwrap(),
            avg_hr: row.try_get("avg_hr").unwrap(),
            duration_seconds: row.try_get("duration_seconds").unwrap(),
        }))
    } else {
        error!(?id, "[get_track] not found");
        Err(StatusCode::NOT_FOUND)
    }
}

async fn export_gpx(
    State(pool): State<Arc<PgPool>>,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
) -> Result<Response, StatusCode> {
    info!(?id, "[export_gpx] called");
    let row = sqlx::query(
        r#"
        SELECT name, description, ST_AsText(geom) as geom_wkt FROM tracks WHERE id = $1
    "#,
    )
    .bind(id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| {
        error!(?e, "[export_gpx] db error");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    if let Some(row) = row {
        info!(?id, "[export_gpx] found");
        let wkt: String = row.try_get::<String, _>("geom_wkt").unwrap();
        let points =
            track_utils::parse_linestring_wkt(&wkt).ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
        let mut seg = TrackSegment { points: Vec::new() };
        for (lat, lon) in points {
            let wp = Waypoint::new(geo_types::Point::new(lon, lat));
            seg.points.push(wp);
        }
        let track = Track {
            name: Some(row.try_get("name").unwrap()),
            description: row.try_get("description").unwrap(),
            segments: vec![seg],
            ..Default::default()
        };
        let gpx = Gpx {
            version: GpxVersion::Gpx11,
            tracks: vec![track],
            ..Default::default()
        };
        let mut buf = Vec::new();
        write(&gpx, &mut buf).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let resp = Response::builder()
            .header(header::CONTENT_TYPE, "application/gpx+xml")
            .header(
                header::CONTENT_DISPOSITION,
                HeaderValue::from_str(&format!("attachment; filename=track_{}.gpx", id)).unwrap(),
            )
            .body(axum::body::Body::from(buf))
            .unwrap();
        Ok(resp)
    } else {
        error!(?id, "[export_gpx] not found");
        Err(StatusCode::NOT_FOUND)
    }
}

#[derive(Serialize)]
pub struct TrackGeoJsonFeature {
    #[serde(rename = "type")]
    type_field: String,
    geometry: serde_json::Value,
    properties: serde_json::Value,
}

#[derive(Serialize)]
pub struct TrackGeoJsonCollection {
    #[serde(rename = "type")]
    type_field: String,
    features: Vec<TrackGeoJsonFeature>,
}

#[derive(Debug, Deserialize)]
pub struct TrackGeoJsonQuery {
    pub bbox: Option<String>,
}

async fn list_tracks_geojson(
    State(pool): State<Arc<PgPool>>,
    Query(params): Query<TrackGeoJsonQuery>,
) -> Result<Json<TrackGeoJsonCollection>, StatusCode> {
    let mut sql = String::from(
        "SELECT id, name, categories, length_km, ST_AsGeoJSON(geom) as geom_json FROM tracks WHERE is_public = TRUE",
    );
    let mut query = sqlx::query(&sql);
    if let Some(bbox) = params.bbox {
        let parts: Vec<&str> = bbox.split(',').collect();
        if parts.len() == 4 {
            sql.push_str(" AND ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))");
            query = sqlx::query(&sql)
                .bind(parts[0].parse::<f64>().unwrap_or(0.0))
                .bind(parts[1].parse::<f64>().unwrap_or(0.0))
                .bind(parts[2].parse::<f64>().unwrap_or(0.0))
                .bind(parts[3].parse::<f64>().unwrap_or(0.0));
        }
    }
    let rows = query
        .fetch_all(&*pool)
        .await
        .map_err(|e| {
            error!(?e, "[list_tracks_geojson] db error");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    let features = rows
        .into_iter()
        .map(|row| {
            let id: Uuid = row.get("id");
            let name: String = row.get("name");
            let categories: Vec<String> = row.get("categories");
            let length_km: f64 = row.get("length_km");
            let geom_json: String = row.get("geom_json");
            TrackGeoJsonFeature {
                type_field: "Feature".to_string(),
                geometry: serde_json::from_str(&geom_json).unwrap_or(serde_json::json!({})),
                properties: serde_json::json!({
                    "id": id,
                    "name": name,
                    "categories": categories,
                    "length_km": length_km
                }),
            }
        })
        .collect();
    Ok(Json(TrackGeoJsonCollection {
        type_field: "FeatureCollection".to_string(),
        features,
    }))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = Arc::new(
        PgPoolOptions::new()
            .max_connections(5)
            .connect(&db_url)
            .await
            .expect("DB connect"),
    );
    let app = Router::new()
        .route("/health", get(health))
        .route("/tracks/upload", post(upload_track))
        .route("/tracks", get(list_tracks))
        .route("/tracks/{id}", get(get_track))
        .route("/tracks/{id}/export.gpx", get(export_gpx))
        .route("/tracks/geojson", get(list_tracks_geojson))
        .with_state(pool);
    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    tracing::info!("listening on {}", addr);
    axum::serve(
        tokio::net::TcpListener::bind(addr).await.unwrap(),
        app.into_make_service(),
    )
    .await
    .unwrap();
}

async fn health() -> &'static str {
    info!("[health] called");
    "ok"
}

#[cfg(test)]
mod tests {
    use assert_approx_eq::assert_approx_eq;

    #[test]
    fn test_haversine_distance_zero() {
        let a = (55.0, 37.0);
        let b = (55.0, 37.0);
        assert_approx_eq!(crate::track_utils::haversine_distance(a, b), 0.0, 1e-6);
    }

    #[test]
    fn test_haversine_distance_known() {
        let a = (55.0, 37.0);
        let b = (55.1, 37.0);
        let d = crate::track_utils::haversine_distance(a, b);
        assert!((d - 11119.5).abs() < 100.0); // ~11.1km
    }

    #[test]
    fn test_parse_linestring_wkt() {
        let wkt = "LINESTRING(37.0 55.0, 38.0 56.0)";
        let pts = crate::track_utils::parse_linestring_wkt(wkt).unwrap();
        assert_eq!(pts, vec![(55.0, 37.0), (56.0, 38.0)]);
    }
}
