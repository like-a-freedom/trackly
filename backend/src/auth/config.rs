//! Authentication configuration from environment variables.

use once_cell::sync::Lazy;
use std::env;

/// Authentication configuration loaded from environment variables.
#[derive(Debug, Clone)]
pub struct AuthConfig {
    /// Google OAuth2 Client ID
    pub google_client_id: String,
    /// Google OAuth2 Client Secret
    pub google_client_secret: String,
    /// Google OAuth2 Redirect URI
    pub google_redirect_uri: String,
    /// JWT secret key for signing tokens (min 32 bytes)
    pub jwt_secret: String,
    /// JWT expiry in seconds (default: 1800 = 30 minutes)
    pub jwt_expiry_secs: u64,
    /// Access token expiry (same as JWT for convenience)
    pub access_token_expiry_secs: u64,
    /// Refresh token expiry in seconds (default: 604800 = 7 days)
    pub refresh_token_expiry_secs: u64,
    /// Refresh token absolute lifetime in seconds (default: 2592000 = 30 days)
    pub refresh_token_absolute_secs: u64,
    /// Frontend base URL for CORS and redirects
    pub frontend_base_url: String,
    /// Login attempts retention in days (default: 90)
    pub login_attempts_retention_days: u32,
    /// Max login attempts per IP in 15 minutes (default: 10)
    pub max_login_attempts_per_ip: u32,
}

impl AuthConfig {
    /// Load configuration from environment variables.
    ///
    /// # Panics
    /// Panics if required environment variables are missing.
    pub fn from_env() -> Self {
        let jwt_expiry = env::var("JWT_EXPIRY_SECS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(1800); // 30 minutes
        Self {
            google_client_id: env::var("GOOGLE_CLIENT_ID").expect("GOOGLE_CLIENT_ID must be set"),
            google_client_secret: env::var("GOOGLE_CLIENT_SECRET")
                .expect("GOOGLE_CLIENT_SECRET must be set"),
            google_redirect_uri: env::var("GOOGLE_REDIRECT_URI")
                .expect("GOOGLE_REDIRECT_URI must be set"),
            jwt_secret: env::var("JWT_SECRET").expect("JWT_SECRET must be set (min 32 bytes)"),
            jwt_expiry_secs: jwt_expiry,
            access_token_expiry_secs: jwt_expiry, // Same as JWT expiry
            refresh_token_expiry_secs: env::var("REFRESH_TOKEN_EXPIRY_SECS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(604800), // 7 days
            refresh_token_absolute_secs: env::var("REFRESH_TOKEN_ABSOLUTE_SECS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(2592000), // 30 days
            frontend_base_url: env::var("FRONTEND_BASE_URL")
                .unwrap_or_else(|_| "http://localhost:81".to_string()),
            login_attempts_retention_days: env::var("LOGIN_ATTEMPTS_RETENTION_DAYS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(90),
            max_login_attempts_per_ip: env::var("MAX_LOGIN_ATTEMPTS_PER_IP")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(10),
        }
    }

    /// Load configuration from environment, returning None if auth is not configured.
    /// This allows the application to run without auth in development.
    pub fn try_from_env() -> Option<Self> {
        // Check if the minimum required variables are set
        if env::var("GOOGLE_CLIENT_ID").is_err() || env::var("JWT_SECRET").is_err() {
            return None;
        }
        Some(Self::from_env())
    }
}

/// Global auth configuration (lazy-loaded).
pub static AUTH_CONFIG: Lazy<Option<AuthConfig>> = Lazy::new(AuthConfig::try_from_env);

/// Get the auth configuration, panicking if not configured.
pub fn get_config() -> &'static AuthConfig {
    AUTH_CONFIG
        .as_ref()
        .expect("Auth not configured - set GOOGLE_CLIENT_ID and JWT_SECRET")
}

/// Check if authentication is configured.
pub fn is_auth_configured() -> bool {
    AUTH_CONFIG.is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_values() {
        // When env vars are not set, try_from_env returns None
        temp_env::with_vars_unset(vec!["GOOGLE_CLIENT_ID", "JWT_SECRET"], || {
            assert!(AuthConfig::try_from_env().is_none());
        });
    }

    #[test]
    fn test_config_from_env() {
        temp_env::with_vars(
            vec![
                ("GOOGLE_CLIENT_ID", Some("test-client-id")),
                ("GOOGLE_CLIENT_SECRET", Some("test-secret")),
                ("GOOGLE_REDIRECT_URI", Some("http://localhost/callback")),
                ("JWT_SECRET", Some("a-very-secure-secret-key-32-bytes!")),
                ("JWT_EXPIRY_SECS", Some("3600")),
            ],
            || {
                let config = AuthConfig::from_env();
                assert_eq!(config.google_client_id, "test-client-id");
                assert_eq!(config.jwt_expiry_secs, 3600);
                assert_eq!(config.refresh_token_expiry_secs, 604800); // default
            },
        );
    }
}
