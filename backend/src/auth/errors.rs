//! Authentication error types.

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
use thiserror::Error;

/// Authentication and authorization errors.
#[derive(Debug, Error)]
pub enum AuthError {
    #[error("Invalid or expired access token")]
    InvalidToken,

    #[error("Token has expired")]
    TokenExpired,

    #[error("Missing authorization header")]
    MissingAuth,

    #[error("Invalid authorization header format")]
    InvalidAuthHeader,

    #[error("Invalid or expired refresh token")]
    InvalidRefreshToken,

    #[error("Refresh token has been revoked")]
    RefreshTokenRevoked,

    #[error("Token family has been revoked (potential replay attack)")]
    TokenFamilyRevoked,

    #[error("OAuth2 error: {0}")]
    OAuth2Error(String),

    #[error("Invalid OAuth2 state parameter")]
    InvalidOAuthState,

    #[error("Missing ID token in OAuth response")]
    MissingIdToken,

    #[error("Invalid ID token")]
    InvalidIdToken,

    #[error("Missing email in ID token")]
    MissingEmail,

    #[error("PKCE verification failed")]
    PkceVerificationFailed,

    #[error("User not found")]
    UserNotFound,

    #[error("Forbidden: insufficient permissions")]
    Forbidden,

    #[error("Rate limit exceeded")]
    RateLimitExceeded,

    #[error("Rate limited: too many login attempts")]
    RateLimited,

    #[error("Email not verified")]
    EmailNotVerified,

    #[error("No authentication token provided")]
    NoToken,

    #[error("Configuration error: {0}")]
    ConfigurationError(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Internal error: {0}")]
    InternalError(String),
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, error_message) = match &self {
            AuthError::InvalidToken | AuthError::TokenExpired => {
                (StatusCode::UNAUTHORIZED, "Invalid or expired token")
            }
            AuthError::MissingAuth | AuthError::InvalidAuthHeader => {
                (StatusCode::UNAUTHORIZED, "Authentication required")
            }
            AuthError::InvalidRefreshToken | AuthError::RefreshTokenRevoked => {
                (StatusCode::UNAUTHORIZED, "Invalid refresh token")
            }
            AuthError::TokenFamilyRevoked => {
                // Security: Potential replay attack detected
                tracing::warn!("Token family revocation triggered - potential replay attack");
                (StatusCode::UNAUTHORIZED, "Session invalidated for security")
            }
            AuthError::OAuth2Error(_) | AuthError::InvalidOAuthState => {
                (StatusCode::BAD_REQUEST, "OAuth authentication failed")
            }
            AuthError::MissingIdToken | AuthError::InvalidIdToken | AuthError::MissingEmail => {
                (StatusCode::BAD_REQUEST, "Invalid OAuth response")
            }
            AuthError::PkceVerificationFailed => {
                (StatusCode::BAD_REQUEST, "PKCE verification failed")
            }
            AuthError::UserNotFound => (StatusCode::NOT_FOUND, "User not found"),
            AuthError::Forbidden => (StatusCode::FORBIDDEN, "Access denied"),
            AuthError::RateLimitExceeded | AuthError::RateLimited => {
                (StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded")
            }
            AuthError::EmailNotVerified => (StatusCode::BAD_REQUEST, "Email address not verified"),
            AuthError::NoToken => (StatusCode::UNAUTHORIZED, "Authentication required"),
            AuthError::ConfigurationError(_) => {
                tracing::error!(error = %self, "Auth configuration error");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
            }
            AuthError::InvalidInput(msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            AuthError::DatabaseError(_) | AuthError::InternalError(_) => {
                tracing::error!(error = %self, "Internal auth error");
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

impl From<sqlx::Error> for AuthError {
    fn from(err: sqlx::Error) -> Self {
        AuthError::DatabaseError(err.to_string())
    }
}

impl From<jsonwebtoken::errors::Error> for AuthError {
    fn from(err: jsonwebtoken::errors::Error) -> Self {
        use jsonwebtoken::errors::ErrorKind;
        match err.kind() {
            ErrorKind::ExpiredSignature => AuthError::TokenExpired,
            _ => AuthError::InvalidToken,
        }
    }
}
