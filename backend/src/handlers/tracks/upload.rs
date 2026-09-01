//! Track upload handler.
//!
//! Handles POST /api/tracks/upload and POST /api/tracks for file-based track uploads.

use axum::{Json, extract::State, http::StatusCode};
use axum_extra::extract::Multipart;
use sqlx::PgPool;
use std::sync::Arc;
use tracing::{error, warn};

use crate::error::{AppError, Result};
use crate::models::TrackUploadResponse;
use crate::track_upload;

/// Upload a GPX or KML track file.
///
/// POST /api/tracks/upload  (multipart/form-data)
/// POST /api/tracks         (multipart/form-data)
///
/// Accepts a file upload with optional metadata fields:
/// - `file`: the GPX or KML file (required)
/// - `name`: track name (optional)
/// - `description`: track description (optional)
/// - `categories`: comma-separated categories (optional)
/// - `session_id`: anonymous session UUID (optional)
pub async fn upload_track(
    State(pool): State<Arc<PgPool>>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<TrackUploadResponse>)> {
    let mut name: Option<String> = None;
    let mut description: Option<String> = None;
    let mut categories: Vec<String> = Vec::new();
    let mut session_id: Option<uuid::Uuid> = None;
    let mut file_name: Option<String> = None;
    let mut file_bytes: Option<bytes::Bytes> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        warn!(error = ?e, "failed to read multipart field");
        AppError::BadRequest("failed to read multipart field".into())
    })? {
        let field_name = field.name().unwrap_or("").to_string();
        match field_name.as_str() {
            "file" => {
                file_name = field.file_name().map(|f| f.to_string());
                file_bytes = Some(field.bytes().await.map_err(|e| {
                    error!(error = ?e, "failed to read file bytes");
                    AppError::BadRequest("failed to read file bytes".into())
                })?);
            }
            "name" => {
                let text = field.text().await.map_err(|e| {
                    warn!(error = ?e, "failed to read name field");
                    AppError::BadRequest("failed to read name field".into())
                })?;
                if !text.is_empty() {
                    name = Some(text);
                }
            }
            "description" => {
                let text = field.text().await.map_err(|e| {
                    warn!(error = ?e, "failed to read description field");
                    AppError::BadRequest("failed to read description field".into())
                })?;
                if !text.is_empty() {
                    description = Some(text);
                }
            }
            "categories" => {
                let text = field.text().await.map_err(|e| {
                    warn!(error = ?e, "failed to read categories field");
                    AppError::BadRequest("failed to read categories field".into())
                })?;
                if !text.is_empty() {
                    categories = text
                        .split(',')
                        .map(|c| c.trim().to_string())
                        .filter(|c| !c.is_empty())
                        .collect();
                }
            }
            "session_id" => {
                let text = field.text().await.map_err(|e| {
                    warn!(error = ?e, "failed to read session_id field");
                    AppError::BadRequest("failed to read session_id field".into())
                })?;
                if !text.is_empty() {
                    session_id = uuid::Uuid::parse_str(&text).ok();
                }
            }
            _ => {
                // Skip unknown fields
            }
        }
    }

    let file_bytes = file_bytes.ok_or_else(|| {
        warn!("no file uploaded");
        AppError::BadRequest("no file uploaded".into())
    })?;
    let file_name = file_name.unwrap_or_else(|| "upload.gpx".to_string());

    // Default to "hiking" if no categories provided
    if categories.is_empty() {
        categories.push("hiking".to_string());
    }

    let request = track_upload::UploadRequest {
        name,
        description,
        categories,
        session_id,
        file_name,
        file_bytes,
    };

    let response = track_upload::upload(&pool, request).await?;

    Ok((StatusCode::CREATED, Json(response)))
}
