//! Track export handler.
//!
//! GET /api/tracks/{id}/export?format=gpx|kml|geojson

use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    response::IntoResponse,
};

use serde::Deserialize;
use sqlx::PgPool;
use std::sync::Arc;

use crate::db;
use crate::error::{AppError, Result};
use crate::metrics;
use crate::services::gpx_export;

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    pub format: Option<String>,
}

/// Export a track in the requested format.
///
/// GET /api/tracks/{id}/export?format=gpx|kml|geojson
///
/// Returns a downloadable file with full track data.
pub async fn export_track(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
    Query(query): Query<ExportQuery>,
) -> Result<impl IntoResponse> {
    let track = db::get_track_detail(&pool, track_id)
        .await?
        .ok_or(AppError::NotFound)?;

    let format = query.format.as_deref().unwrap_or("gpx");

    match format {
        "gpx" => {
            let gpx_content = gpx_export::generate_gpx(&track);
            let filename = gpx_export::sanitize_filename(&track.name);

            metrics::record_track_export("gpx");
            metrics::observe_track_export_duration("gpx", 0.0);

            let mut headers = HeaderMap::new();
            headers.insert(
                axum::http::header::CONTENT_TYPE,
                "application/gpx+xml".parse().expect("valid header value"),
            );
            headers.insert(
                axum::http::header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}.gpx\"", filename)
                    .parse()
                    .expect("valid header value"),
            );

            Ok((headers, gpx_content))
        }
        "kml" => {
            let kml_content = crate::services::kml_export::generate_kml(&track);
            let filename = gpx_export::sanitize_filename(&track.name);

            metrics::record_track_export("kml");
            metrics::observe_track_export_duration("kml", 0.0);

            let mut headers = HeaderMap::new();
            headers.insert(
                axum::http::header::CONTENT_TYPE,
                "application/vnd.google-earth.kml+xml"
                    .parse()
                    .expect("valid header value"),
            );
            headers.insert(
                axum::http::header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}.kml\"", filename)
                    .parse()
                    .expect("valid header value"),
            );

            Ok((headers, kml_content))
        }
        "geojson" => {
            let geojson = crate::services::geojson_export::generate_geojson(&track);
            let filename = gpx_export::sanitize_filename(&track.name);

            metrics::record_track_export("geojson");
            metrics::observe_track_export_duration("geojson", 0.0);

            let mut headers = HeaderMap::new();
            headers.insert(
                axum::http::header::CONTENT_TYPE,
                "application/geo+json".parse().expect("valid header value"),
            );
            headers.insert(
                axum::http::header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}.json\"", filename)
                    .parse()
                    .expect("valid header value"),
            );

            Ok((headers, geojson))
        }
        _ => Err(AppError::BadRequest(format!(
            "Unsupported export format: {format}. Use gpx, kml, or geojson."
        ))),
    }
}
