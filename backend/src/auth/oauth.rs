//! Google OAuth2 integration using oauth2 crate.
//!
//! Implements FR-AUTH-002: OAuth2/OIDC Flow (Google Provider)
//!
//! This is a simplified implementation using the oauth2 crate directly,
//! with userinfo endpoint for user claims.

use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge,
    PkceCodeVerifier, RedirectUrl, Scope, TokenResponse, TokenUrl, basic::BasicClient,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;

use super::config::get_config;
use super::errors::AuthError;

/// Google OAuth endpoints.
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v3/userinfo";

/// OAuth authorization URL with PKCE.
#[derive(Debug, Serialize)]
pub struct AuthorizationUrl {
    pub url: String,
    pub state: String,
    pub pkce_verifier: String,
}

/// Generate an authorization URL for Google OAuth.
///
/// Returns the URL to redirect the user to, plus PKCE and state values
/// that must be stored (e.g., in session or cookie) for verification.
pub fn generate_authorization_url() -> Result<AuthorizationUrl, AuthError> {
    let config = get_config();

    let auth_url = AuthUrl::new(GOOGLE_AUTH_URL.to_string())
        .map_err(|e| AuthError::OAuth2Error(e.to_string()))?;
    let redirect_url = RedirectUrl::new(config.google_redirect_uri.clone())
        .map_err(|e| AuthError::OAuth2Error(e.to_string()))?;

    let client = BasicClient::new(ClientId::new(config.google_client_id.clone()))
        .set_auth_uri(auth_url)
        .set_redirect_uri(redirect_url);

    // Generate PKCE challenge
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    // Build authorization URL
    let (auth_url, csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("email".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .add_scope(Scope::new("openid".to_string()))
        .set_pkce_challenge(pkce_challenge)
        .url();

    Ok(AuthorizationUrl {
        url: auth_url.to_string(),
        state: csrf_token.secret().clone(),
        pkce_verifier: pkce_verifier.secret().clone(),
    })
}

/// Verified user info from OAuth callback.
#[derive(Debug, Clone)]
pub struct OAuthUser {
    pub google_sub: String,
    pub email: String,
    pub email_verified: bool,
    pub name: Option<String>,
    pub given_name: Option<String>,
    pub family_name: Option<String>,
    pub picture: Option<String>,
}

/// OAuth callback request (from frontend).
#[derive(Debug, Deserialize)]
pub struct OAuthCallbackRequest {
    pub code: String,
    pub state: String,
    pub pkce_verifier: String,
}

/// Google userinfo response.
#[derive(Debug, Deserialize)]
struct GoogleUserInfo {
    sub: String,
    email: String,
    email_verified: Option<bool>,
    name: Option<String>,
    given_name: Option<String>,
    family_name: Option<String>,
    picture: Option<String>,
}

/// Exchange authorization code for tokens and verify user identity.
///
/// # Arguments
/// * `code` - Authorization code from OAuth callback
/// * `pkce_verifier` - PKCE code verifier
///
/// # Returns
/// * `OAuthUser` - Verified user information
pub async fn exchange_code_for_user(
    code: &str,
    _nonce: &str, // Kept for API compatibility
    pkce_verifier: &str,
) -> Result<OAuthUser, AuthError> {
    let config = get_config();

    let auth_url = AuthUrl::new(GOOGLE_AUTH_URL.to_string())
        .map_err(|e| AuthError::OAuth2Error(e.to_string()))?;
    let token_url = TokenUrl::new(GOOGLE_TOKEN_URL.to_string())
        .map_err(|e| AuthError::OAuth2Error(e.to_string()))?;
    let redirect_url = RedirectUrl::new(config.google_redirect_uri.clone())
        .map_err(|e| AuthError::OAuth2Error(e.to_string()))?;

    let client = BasicClient::new(ClientId::new(config.google_client_id.clone()))
        .set_client_secret(ClientSecret::new(config.google_client_secret.clone()))
        .set_auth_uri(auth_url)
        .set_token_uri(token_url)
        .set_redirect_uri(redirect_url);

    let pkce_verifier = PkceCodeVerifier::new(pkce_verifier.to_string());

    // Create HTTP client for oauth2
    let http_client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| AuthError::OAuth2Error(format!("HTTP client error: {}", e)))?;

    // Exchange authorization code for tokens
    let token_result = client
        .exchange_code(AuthorizationCode::new(code.to_string()))
        .set_pkce_verifier(pkce_verifier)
        .request_async(&http_client)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to exchange authorization code");
            AuthError::OAuth2Error(format!("Token exchange failed: {}", e))
        })?;

    let access_token = token_result.access_token().secret();

    // Fetch user info from Google
    let user_info: GoogleUserInfo = http_client
        .get(GOOGLE_USERINFO_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| AuthError::OAuth2Error(format!("Userinfo request failed: {}", e)))?
        .json()
        .await
        .map_err(|e| AuthError::OAuth2Error(format!("Userinfo parse failed: {}", e)))?;

    // Check email verification
    if !user_info.email_verified.unwrap_or(false) {
        tracing::warn!(email = %user_info.email, "Email not verified");
        return Err(AuthError::EmailNotVerified);
    }

    tracing::info!(
        google_sub = %user_info.sub,
        email = %user_info.email,
        "User authenticated via Google OAuth"
    );

    Ok(OAuthUser {
        google_sub: user_info.sub,
        email: user_info.email,
        email_verified: user_info.email_verified.unwrap_or(false),
        name: user_info.name,
        given_name: user_info.given_name,
        family_name: user_info.family_name,
        picture: user_info.picture,
    })
}

/// Track login attempt for rate limiting.
pub async fn record_login_attempt(
    pool: &Arc<PgPool>,
    ip_address: Option<&str>,
    user_id: Option<uuid::Uuid>,
    success: bool,
    failure_reason: Option<&str>,
) -> Result<(), AuthError> {
    sqlx::query(
        r#"
        INSERT INTO login_attempts (ip_address, user_id, success, failure_reason)
        VALUES ($1::inet, $2, $3, $4)
        "#,
    )
    .bind(ip_address)
    .bind(user_id)
    .bind(success)
    .bind(failure_reason)
    .execute(&**pool)
    .await?;

    Ok(())
}

/// Check if an IP address is rate limited.
///
/// Returns true if the IP has exceeded the rate limit (too many failed attempts).
pub async fn is_rate_limited(
    pool: &Arc<PgPool>,
    ip_address: Option<&str>,
) -> Result<bool, AuthError> {
    let config = get_config();

    // If IP not available, cannot be rate limited by IP
    let ip = match ip_address {
        Some(v) => v,
        None => return Ok(false),
    };

    // Count failed attempts in the last 15 minutes
    let count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)::bigint
        FROM login_attempts
        WHERE ip_address = $1::inet
          AND success = false
          AND timestamp > NOW() - INTERVAL '15 minutes'
        "#,
    )
    .bind(ip)
    .fetch_one(&**pool)
    .await?;

    let is_limited = count >= config.max_login_attempts_per_ip as i64;

    if is_limited {
        tracing::warn!(
            ip_address = %ip,
            failed_attempts = count,
            "IP address rate limited"
        );
    }

    Ok(is_limited)
}

/// FR-AUTH-006: Check for suspicious activity patterns and log alerts.
/// This function should be called after each login attempt.
pub async fn check_suspicious_activity(
    pool: &Arc<PgPool>,
    ip_address: Option<&str>,
    user_id: Option<uuid::Uuid>,
    is_new_ip_for_user: bool,
) -> Result<(), AuthError> {
    // Threshold for failed attempts per IP (configurable via env)
    let ip_threshold: i64 = std::env::var("SUSPICIOUS_FAILED_ATTEMPTS_IP")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(5);

    // Threshold for failed attempts per user (configurable via env)
    let user_threshold: i64 = std::env::var("SUSPICIOUS_FAILED_ATTEMPTS_USER")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(3);

    // Check failed attempts from IP in last 15 minutes
    if let Some(ip) = ip_address {
        let ip_failed_count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*)::bigint
            FROM login_attempts
            WHERE ip_address = $1::inet
              AND success = false
              AND timestamp > NOW() - INTERVAL '15 minutes'
            "#,
        )
        .bind(ip)
        .fetch_one(&**pool)
        .await?;

        if ip_failed_count > ip_threshold {
            tracing::warn!(
                target: "security",
                ip_address = %ip,
                failed_attempts = ip_failed_count,
                threshold = ip_threshold,
                alert_type = "suspicious_ip_activity",
                "SECURITY ALERT: High number of failed login attempts from IP"
            );
        }
    }

    // Check failed attempts for user in last 15 minutes
    if let Some(uid) = user_id {
        let user_failed_count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*)::bigint
            FROM login_attempts
            WHERE user_id = $1
              AND success = false
              AND timestamp > NOW() - INTERVAL '15 minutes'
            "#,
        )
        .bind(uid)
        .fetch_one(&**pool)
        .await?;

        if user_failed_count > user_threshold {
            tracing::warn!(
                target: "security",
                user_id = %uid,
                failed_attempts = user_failed_count,
                threshold = user_threshold,
                alert_type = "suspicious_user_activity",
                "SECURITY ALERT: High number of failed login attempts for user"
            );
        }

        // Log successful login from new IP (informational)
        if is_new_ip_for_user {
            tracing::info!(
                target: "security",
                user_id = %uid,
                ip_address = %ip_address.unwrap_or("unknown"),
                alert_type = "new_ip_login",
                "User logged in from a new IP address"
            );
        }
    }

    Ok(())
}

/// Check if this is a new IP for a given user.
pub async fn is_new_ip_for_user(
    pool: &Arc<PgPool>,
    user_id: uuid::Uuid,
    ip_address: Option<&str>,
) -> Result<bool, AuthError> {
    // If no IP is available, we cannot consider it a new IP
    let ip = match ip_address {
        Some(v) => v,
        None => return Ok(false),
    };
    let exists: bool = sqlx::query_scalar(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM login_attempts
            WHERE user_id = $1
              AND ip_address = $2::inet
              AND success = true
        )
        "#,
    )
    .bind(user_id)
    .bind(ip)
    .fetch_one(&**pool)
    .await?;

    Ok(!exists)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_oauth_user_fields() {
        let user = OAuthUser {
            google_sub: "123456".to_string(),
            email: "test@example.com".to_string(),
            email_verified: true,
            name: Some("Test User".to_string()),
            given_name: Some("Test".to_string()),
            family_name: Some("User".to_string()),
            picture: Some("https://example.com/pic.jpg".to_string()),
        };

        assert_eq!(user.google_sub, "123456");
        assert_eq!(user.email, "test@example.com");
        assert!(user.email_verified);
        assert_eq!(user.name, Some("Test User".to_string()));
    }

    #[test]
    fn test_authorization_url_serialization() {
        let auth_url = AuthorizationUrl {
            url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=test".to_string(),
            state: "random_state_123".to_string(),
            pkce_verifier: "random_verifier_456".to_string(),
        };

        let json = serde_json::to_string(&auth_url).unwrap();
        assert!(json.contains("accounts.google.com"));
        assert!(json.contains("random_state_123"));
        assert!(json.contains("random_verifier_456"));
    }

    #[test]
    fn test_oauth_callback_request_deserialization() {
        let json = r#"{
            "code": "test_code_123",
            "state": "test_state_456",
            "pkce_verifier": "test_verifier_789"
        }"#;

        let request: OAuthCallbackRequest = serde_json::from_str(json).unwrap();

        assert_eq!(request.code, "test_code_123");
        assert_eq!(request.state, "test_state_456");
        assert_eq!(request.pkce_verifier, "test_verifier_789");
    }

    #[test]
    fn test_google_user_info_deserialization() {
        let json = r#"{
            "sub": "123456",
            "email": "test@example.com",
            "email_verified": true,
            "name": "Test User",
            "given_name": "Test",
            "family_name": "User",
            "picture": "https://example.com/pic.jpg"
        }"#;

        let user_info: GoogleUserInfo = serde_json::from_str(json).unwrap();

        assert_eq!(user_info.sub, "123456");
        assert_eq!(user_info.email, "test@example.com");
        assert_eq!(user_info.email_verified, Some(true));
        assert_eq!(user_info.name, Some("Test User".to_string()));
        assert_eq!(user_info.given_name, Some("Test".to_string()));
        assert_eq!(user_info.family_name, Some("User".to_string()));
        assert_eq!(
            user_info.picture,
            Some("https://example.com/pic.jpg".to_string())
        );
    }

    #[test]
    fn test_google_user_info_minimal() {
        // Test with only required fields
        let json = r#"{
            "sub": "123456",
            "email": "test@example.com"
        }"#;

        let user_info: GoogleUserInfo = serde_json::from_str(json).unwrap();

        assert_eq!(user_info.sub, "123456");
        assert_eq!(user_info.email, "test@example.com");
        assert_eq!(user_info.email_verified, None);
        assert_eq!(user_info.name, None);
    }

    #[test]
    fn test_oauth_endpoints_constants() {
        // Verify OAuth endpoint URLs are correct
        assert_eq!(
            GOOGLE_AUTH_URL,
            "https://accounts.google.com/o/oauth2/v2/auth"
        );
        assert_eq!(GOOGLE_TOKEN_URL, "https://oauth2.googleapis.com/token");
        assert_eq!(
            GOOGLE_USERINFO_URL,
            "https://www.googleapis.com/oauth2/v3/userinfo"
        );
    }

    #[test]
    fn test_oauth_user_with_empty_optional_fields() {
        let user = OAuthUser {
            google_sub: "123456".to_string(),
            email: "test@example.com".to_string(),
            email_verified: false,
            name: None,
            given_name: None,
            family_name: None,
            picture: None,
        };

        assert_eq!(user.google_sub, "123456");
        assert_eq!(user.email, "test@example.com");
        assert!(!user.email_verified);
        assert!(user.name.is_none());
        assert!(user.given_name.is_none());
        assert!(user.family_name.is_none());
        assert!(user.picture.is_none());
    }
}
