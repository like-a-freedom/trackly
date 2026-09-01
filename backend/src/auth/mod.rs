//! Authentication and authorization module for Trackly.
//!
//! This module provides:
//! - JWT access token generation and validation
//! - OAuth2/OIDC integration with Google
//! - Refresh token management with rotation
//! - Authentication middleware for protected routes

pub mod config;
pub mod errors;
pub mod jwt;
pub mod middleware;
pub mod oauth;
pub mod refresh;

// Re-export commonly used types
pub use config::{AuthConfig, get_config, is_auth_configured};
pub use errors::AuthError;
pub use jwt::{Claims, TokenUser, create_access_token, validate_access_token};
pub use middleware::{
    AuthUser, OptionalAuthUser,
};
pub use oauth::{
    AuthorizationUrl, OAuthUser, check_suspicious_activity,
    exchange_code_for_user, generate_authorization_url, is_new_ip_for_user, is_rate_limited,
    record_login_attempt,
};
pub use refresh::{
    RefreshToken, create_refresh_token, generate_token, hash_token,
    revoke_all_user_tokens, revoke_refresh_token, revoke_token_family, rotate_refresh_token,
    validate_refresh_token,
};
