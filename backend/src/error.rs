//! Application-wide error type.
//!
//! `AppError` is the single domain error type for the backend. Every handler
//! returns `Result<T, AppError>`; every `db::` function converts its underlying
//! error into `AppError` via `From`. The `IntoResponse` impl is the only place
//! that maps a domain error to an HTTP response, so error handling stays
//! localized and consistent.

use crate::auth::AuthError;
use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
use thiserror::Error;

/// The result type for all backend operations. `Result` already enforces
/// `#[must_use]` via the standard library, so ignoring a return value is
/// a compile error.
pub type Result<T> = std::result::Result<T, AppError>;

/// The single domain error type for the backend.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum AppError {
    #[error("resource not found")]
    NotFound,

    #[error("access denied")]
    Forbidden,

    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("validation failed: {0}")]
    Validation(String),

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("authentication required: {0}")]
    Unauthorized(String),

    #[error("rate limit exceeded")]
    TooManyRequests,

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::BadRequest(err.to_string())
    }
}

impl From<axum::http::Error> for AppError {
    fn from(err: axum::http::Error) -> Self {
        AppError::Internal(anyhow::anyhow!(err.to_string()))
    }
}

impl From<String> for AppError {
    fn from(err: String) -> Self {
        AppError::BadRequest(err)
    }
}

/// Bridge for the legacy `StatusCode`-based validators (`input_validation`).
/// Maps the common handler status codes onto their `AppError` equivalents;
/// anything else becomes an internal error so no 500-class detail leaks.
impl From<StatusCode> for AppError {
    fn from(status: StatusCode) -> Self {
        match status {
            StatusCode::BAD_REQUEST => AppError::BadRequest("invalid request".into()),
            StatusCode::UNAUTHORIZED => AppError::Unauthorized("authentication required".into()),
            StatusCode::FORBIDDEN => AppError::Forbidden,
            StatusCode::NOT_FOUND => AppError::NotFound,
            StatusCode::CONFLICT => AppError::Conflict("resource conflict".into()),
            StatusCode::TOO_MANY_REQUESTS => AppError::TooManyRequests,
            _ => AppError::Internal(anyhow::anyhow!("unexpected status {status}")),
        }
    }
}

impl From<AuthError> for AppError {
    fn from(err: AuthError) -> Self {
        match err {
            AuthError::UserNotFound => AppError::NotFound,
            AuthError::Forbidden => AppError::Forbidden,
            AuthError::InvalidToken
            | AuthError::TokenExpired
            | AuthError::MissingAuth
            | AuthError::InvalidAuthHeader
            | AuthError::NoToken
            | AuthError::InvalidRefreshToken
            | AuthError::RefreshTokenRevoked
            | AuthError::TokenFamilyRevoked => AppError::Unauthorized(err.to_string()),
            AuthError::RateLimitExceeded | AuthError::RateLimited => AppError::TooManyRequests,
            AuthError::InvalidInput(msg) => AppError::Validation(msg),
            AuthError::OAuth2Error(_)
            | AuthError::InvalidOAuthState
            | AuthError::MissingIdToken
            | AuthError::InvalidIdToken
            | AuthError::MissingEmail
            | AuthError::PkceVerificationFailed
            | AuthError::EmailNotVerified => AppError::BadRequest(err.to_string()),
            AuthError::ConfigurationError(_)
            | AuthError::AuthNotConfigured
            | AuthError::DatabaseError(_)
            | AuthError::InternalError(_) => AppError::Internal(anyhow::anyhow!(err.to_string())),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match &self {
            AppError::NotFound => (StatusCode::NOT_FOUND, "Resource not found"),
            AppError::Forbidden => (StatusCode::FORBIDDEN, "Access denied"),
            AppError::BadRequest(msg) | AppError::Validation(msg) => {
                (StatusCode::BAD_REQUEST, msg.as_str())
            }
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg.as_str()),
            AppError::Unauthorized(_) => (StatusCode::UNAUTHORIZED, "Authentication required"),
            AppError::TooManyRequests => (StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded"),
            AppError::Database(_) => {
                tracing::error!(error = ?self, "database error occurred");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
            }
            AppError::Internal(_) => {
                tracing::error!(error = ?self, "internal error occurred");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
            }
        };

        let body = Json(json!({
            "error": error_message,
            "code": status.as_u16()
        }));

        (status, body).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status_of(err: AppError) -> StatusCode {
        err.into_response().status()
    }

    #[test]
    fn not_found_maps_to_404() {
        assert_eq!(status_of(AppError::NotFound), StatusCode::NOT_FOUND);
    }

    #[test]
    fn forbidden_maps_to_403() {
        assert_eq!(status_of(AppError::Forbidden), StatusCode::FORBIDDEN);
    }

    #[test]
    fn bad_request_maps_to_400() {
        assert_eq!(
            status_of(AppError::BadRequest("x".into())),
            StatusCode::BAD_REQUEST
        );
    }

    #[test]
    fn validation_maps_to_400() {
        assert_eq!(
            status_of(AppError::Validation("x".into())),
            StatusCode::BAD_REQUEST
        );
    }

    #[test]
    fn conflict_maps_to_409() {
        assert_eq!(
            status_of(AppError::Conflict("x".into())),
            StatusCode::CONFLICT
        );
    }

    #[test]
    fn unauthorized_maps_to_401() {
        assert_eq!(
            status_of(AppError::Unauthorized("x".into())),
            StatusCode::UNAUTHORIZED
        );
    }

    #[test]
    fn too_many_requests_maps_to_429() {
        assert_eq!(
            status_of(AppError::TooManyRequests),
            StatusCode::TOO_MANY_REQUESTS
        );
    }

    #[test]
    fn database_maps_to_500() {
        assert_eq!(
            status_of(AppError::Database(sqlx::Error::RowNotFound)),
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }

    #[test]
    fn internal_maps_to_500() {
        assert_eq!(
            status_of(AppError::Internal(anyhow::anyhow!("boom"))),
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }

    #[test]
    fn auth_error_conversions() {
        assert!(matches!(
            AppError::from(AuthError::UserNotFound),
            AppError::NotFound
        ));
        assert!(matches!(
            AppError::from(AuthError::Forbidden),
            AppError::Forbidden
        ));
        assert!(matches!(
            AppError::from(AuthError::InvalidToken),
            AppError::Unauthorized(_)
        ));
        assert!(matches!(
            AppError::from(AuthError::RateLimited),
            AppError::TooManyRequests
        ));
        assert!(matches!(
            AppError::from(AuthError::InvalidInput("n".into())),
            AppError::Validation(_)
        ));
    }
}
