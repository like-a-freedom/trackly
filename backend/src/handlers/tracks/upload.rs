//! Track upload handler.
//!
//! Handles POST /api/tracks/upload and POST /api/tracks for file-based track uploads.

use axum::{Json, extract::State, http::StatusCode};
use axum_extra::extract::Multipart;
use sqlx::PgPool;
use std::sync::Arc;
use tracing::{error, warn};

use crate::auth::OptionalAuthUser;
use crate::error::{AppError, Result};
use crate::metrics;
use crate::models::TrackUploadResponse;
use crate::track_upload;

/// Resolve the persisted owner for an upload.
///
/// Authentication always wins: an authenticated upload must not retain the
/// anonymous session sent by the browser as a second ownership path.
fn resolve_upload_owner(
    auth_user: &OptionalAuthUser,
    session_id: Option<uuid::Uuid>,
) -> (Option<uuid::Uuid>, Option<uuid::Uuid>) {
    let user_id = auth_user.user().map(|user| user.user_id);
    let session_id = if user_id.is_some() { None } else { session_id };
    (session_id, user_id)
}

/// Upload a GPX or KML track file.
///
/// POST /api/tracks/upload  (multipart/form-data)
/// POST /api/tracks         (multipart/form-data)
///
/// Accepts a file upload with optional metadata fields:
/// - `file`: the GPX or KML file (required)
/// - `name`: track name (optional)
/// - `description`: track description (optional)
/// - `categories`: comma-separated categories (at least one required)
/// - `session_id`: anonymous session UUID (optional)
pub async fn upload_track(
    State(pool): State<Arc<PgPool>>,
    auth_user: OptionalAuthUser,
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

    if categories.is_empty() {
        return Err(AppError::BadRequest("Select at least one category".into()));
    }

    let (session_id, user_id) = resolve_upload_owner(&auth_user, session_id);

    let request = track_upload::UploadRequest {
        name,
        description,
        categories,
        session_id,
        user_id,
        file_name,
        file_bytes,
    };

    let response = track_upload::upload(&pool, request).await?;

    // Record session engagement heartbeat (upload = highest weight in engagement_score_7d).
    // `session_id` is `Option<Uuid>` (Copy) and is only present for anonymous uploads.
    metrics::record_session_activity(session_id, "upload");

    Ok((StatusCode::CREATED, Json(response)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::{AuthUser, Claims};
    use uuid::Uuid;

    fn authenticated(user_id: Uuid) -> OptionalAuthUser {
        OptionalAuthUser(Some(AuthUser {
            user_id,
            email: "test@example.com".to_string(),
            name: Some("Test".to_string()),
            nickname: None,
            avatar_url: None,
            roles: vec!["user".to_string()],
            claims: Claims {
                sub: user_id.to_string(),
                email: "test@example.com".to_string(),
                name: "Test".to_string(),
                nickname: None,
                avatar_url: None,
                roles: vec!["user".to_string()],
                exp: 0,
                iat: 0,
                iss: "trackly-app".to_string(),
                aud: "trackly-web".to_string(),
            },
        }))
    }

    #[tokio::test]
    async fn upload_without_categories_is_rejected_before_database_access() {
        use axum::{Router, body::Body, http::Request, routing::post};
        use tower::ServiceExt;
        let pool = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://test:test@127.0.0.1:1/test")
            .unwrap();
        for categories in [
            "",
            "\r\n--boundary\r\nContent-Disposition: form-data; name=\"categories\"\r\n\r\n , ",
        ] {
            let body = format!(
                "--boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"track.gpx\"\r\nContent-Type: application/gpx+xml\r\n\r\n<gpx/>{categories}\r\n--boundary--\r\n"
            );
            let response = Router::new()
                .route("/upload", post(upload_track))
                .with_state(Arc::new(pool.clone()))
                .oneshot(
                    Request::post("/upload")
                        .header("content-type", "multipart/form-data; boundary=boundary")
                        .body(Body::from(body))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        }
    }

    #[test]
    fn authenticated_upload_uses_account_owner_only() {
        let user_id = Uuid::new_v4();
        let session_id = Some(Uuid::new_v4());

        let (owner_session, owner_user) = resolve_upload_owner(&authenticated(user_id), session_id);

        assert_eq!(owner_user, Some(user_id));
        assert_eq!(owner_session, None);
    }

    #[test]
    fn anonymous_upload_keeps_session_owner() {
        let session_id = Some(Uuid::new_v4());

        let (owner_session, owner_user) = resolve_upload_owner(&OptionalAuthUser(None), session_id);

        assert_eq!(owner_user, None);
        assert_eq!(owner_session, session_id);
    }
}
