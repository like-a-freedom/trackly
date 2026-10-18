//! Authentication configuration from environment variables.

use once_cell::sync::Lazy;
use std::env;
use tracing::warn;

/// Minimum accepted length, in bytes, of the JWT signing secret.
///
/// An HMAC-SHA256 key shorter than the digest adds no security margin. `from_env`
/// documents this minimum, but nothing enforced it, so a short key was accepted.
const MIN_JWT_SECRET_BYTES: usize = 32;

/// Read an environment variable, treating a blank value as unset.
///
/// `env::var` yields `Ok("")` for a variable that is present but empty, so emptiness
/// must be checked explicitly: a blank credential has to mean "not configured",
/// never "configured with an empty value". Present-but-blank values are logged,
/// because silently disabling authentication would hide a misconfiguration.
fn non_blank_env(name: &str) -> Option<String> {
    match env::var(name) {
        Ok(value) if value.trim().is_empty() => {
            warn!(
                variable = name,
                "blank auth credential ignored; authentication stays disabled"
            );
            None
        }
        Ok(value) => Some(value),
        Err(_) => None,
    }
}

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
    /// Prefer [`Self::try_from_env`], which validates the credentials. This
    /// constructor is private so the fail-closed check cannot be bypassed.
    ///
    /// # Panics
    /// Panics if required environment variables are missing.
    fn from_env() -> Self {
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
    ///
    /// Fails closed. Absent variables are the normal "dev without auth" case; a
    /// variable that is *present but blank*, or a `JWT_SECRET` shorter than
    /// [`MIN_JWT_SECRET_BYTES`], also disables auth instead of enabling it with an
    /// empty client id / signing key, or panicking at startup on a partial setup.
    pub fn try_from_env() -> Option<Self> {
        non_blank_env("GOOGLE_CLIENT_ID")?;
        non_blank_env("GOOGLE_CLIENT_SECRET")?;
        non_blank_env("GOOGLE_REDIRECT_URI")?;

        // The signing key must be at least as long as the HMAC-SHA256 digest.
        let jwt_secret = non_blank_env("JWT_SECRET")?;
        if jwt_secret.trim().len() < MIN_JWT_SECRET_BYTES {
            warn!(
                variable = "JWT_SECRET",
                min_bytes = MIN_JWT_SECRET_BYTES,
                "auth credential too short; authentication stays disabled"
            );
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

    /// A complete, valid set of auth credentials.
    const VALID_VARS: [(&str, &str); 4] = [
        ("GOOGLE_CLIENT_ID", "test-client-id"),
        ("GOOGLE_CLIENT_SECRET", "test-client-secret"),
        ("GOOGLE_REDIRECT_URI", "http://localhost/callback"),
        ("JWT_SECRET", "a-very-secure-secret-key-32-bytes!"),
    ];

    /// Run `f` with valid credentials in place, except for `name` set to `value`.
    fn with_override<T>(name: &str, value: &str, f: impl FnOnce() -> T) -> T {
        let vars: Vec<(&str, Option<&str>)> = VALID_VARS
            .iter()
            .map(|(key, valid)| (*key, Some(if *key == name { value } else { *valid })))
            .collect();
        temp_env::with_vars(vars, f)
    }

    #[test]
    fn test_default_values() {
        // When env vars are not set, try_from_env returns None
        temp_env::with_vars_unset(
            vec![
                "GOOGLE_CLIENT_ID",
                "GOOGLE_CLIENT_SECRET",
                "GOOGLE_REDIRECT_URI",
                "JWT_SECRET",
            ],
            || {
                assert!(AuthConfig::try_from_env().is_none());
            },
        );
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

    /// Regression: a blank value is *present* (`env::var` yields `Ok("")`), not
    /// missing, so gating on `env::var(..).is_err()` used to *enable* auth with an
    /// empty client id and an empty signing key.
    #[test]
    fn blank_credentials_do_not_configure_auth() {
        for name in [
            "GOOGLE_CLIENT_ID",
            "GOOGLE_CLIENT_SECRET",
            "GOOGLE_REDIRECT_URI",
            "JWT_SECRET",
        ] {
            let configured = with_override(name, "", || AuthConfig::try_from_env().is_some());
            assert!(!configured, "{name} = \"\" must not enable authentication");
        }
    }

    #[test]
    fn whitespace_only_credentials_do_not_configure_auth() {
        for name in [
            "GOOGLE_CLIENT_ID",
            "GOOGLE_CLIENT_SECRET",
            "GOOGLE_REDIRECT_URI",
            "JWT_SECRET",
        ] {
            let configured = with_override(name, "   ", || AuthConfig::try_from_env().is_some());
            assert!(
                !configured,
                "{name} = \"   \" must not enable authentication"
            );
        }
    }

    /// The documented requirement is a 32-byte minimum, so 31 bytes must be refused.
    #[test]
    fn short_jwt_secret_does_not_configure_auth() {
        let secret = "a".repeat(31);
        assert!(!with_override("JWT_SECRET", &secret, || {
            AuthConfig::try_from_env().is_some()
        }));
    }

    /// Regression: a partial configuration (client id + signing key, no secret or
    /// redirect URI) used to pass `try_from_env` and then panic inside `from_env`,
    /// aborting startup instead of disabling authentication.
    #[test]
    fn partial_credentials_do_not_configure_auth() {
        temp_env::with_vars(
            vec![
                ("GOOGLE_CLIENT_ID", Some("test-client-id")),
                ("GOOGLE_CLIENT_SECRET", None),
                ("GOOGLE_REDIRECT_URI", None),
                ("JWT_SECRET", Some("a-very-secure-secret-key-32-bytes!")),
            ],
            || assert!(AuthConfig::try_from_env().is_none()),
        );
    }

    #[test]
    fn minimum_length_secret_configures_auth() {
        let secret = "a".repeat(32);
        let config = with_override("JWT_SECRET", &secret, AuthConfig::try_from_env)
            .expect("a 32-byte secret must configure auth");

        assert_eq!(config.google_client_id, "test-client-id");
        assert_eq!(config.jwt_secret, secret);
    }
}
