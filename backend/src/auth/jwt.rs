//! JWT (JSON Web Token) handling for access tokens.
//!
//! Implements FR-AUTH-002: Access Token Management

use chrono::{Duration, Utc};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::config::get_config;
use super::errors::AuthError;

/// JWT claims for access tokens.
///
/// Per FR-AUTH-002, the payload is minimal:
/// - sub: user_id (UUIDv7)
/// - email: user email
/// - name: user display name
/// - nickname: user-chosen nickname
/// - avatar_url: profile picture URL
/// - roles: user roles (currently just ["user"])
/// - exp: expiration timestamp
/// - iat: issued at timestamp
/// - iss: issuer (trackly-app)
/// - aud: audience (trackly-web)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    /// Subject (user_id as string)
    pub sub: String,
    /// User email
    pub email: String,
    /// User display name
    #[serde(default)]
    pub name: String,
    /// User-chosen nickname
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nickname: Option<String>,
    /// Profile picture URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    /// User roles
    #[serde(default)]
    pub roles: Vec<String>,
    /// Expiration time (Unix timestamp)
    pub exp: i64,
    /// Issued at (Unix timestamp)
    pub iat: i64,
    /// Issuer
    pub iss: String,
    /// Audience
    pub aud: String,
}

impl Claims {
    /// Get user_id as UUID
    pub fn user_id(&self) -> Result<Uuid, AuthError> {
        Uuid::parse_str(&self.sub).map_err(|_| AuthError::InvalidToken)
    }

    /// Check if the token is about to expire (within 5 minutes)
    pub fn is_expiring_soon(&self) -> bool {
        let now = Utc::now().timestamp();
        self.exp - now < 300 // 5 minutes
    }
}

/// User data for token creation
pub struct TokenUser {
    pub user_id: Uuid,
    pub email: String,
    pub name: String,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
}

/// Create a new JWT access token for a user.
///
/// # Arguments
/// * `user` - User data to encode in the token
///
/// # Returns
/// * `Ok(String)` - The encoded JWT
/// * `Err(AuthError)` - If encoding fails
pub fn create_access_token(user: &TokenUser) -> Result<String, AuthError> {
    let config = get_config();
    let now = Utc::now();
    let exp = now + Duration::seconds(config.jwt_expiry_secs as i64);

    let claims = Claims {
        sub: user.user_id.to_string(),
        email: user.email.clone(),
        name: user.name.clone(),
        nickname: user.nickname.clone(),
        avatar_url: user.avatar_url.clone(),
        roles: vec!["user".to_string()],
        exp: exp.timestamp(),
        iat: now.timestamp(),
        iss: "trackly-app".to_string(),
        aud: "trackly-web".to_string(),
    };

    let key = EncodingKey::from_secret(config.jwt_secret.as_bytes());
    let token = encode(&Header::default(), &claims, &key)?;

    Ok(token)
}

/// Validate a JWT access token and extract claims.
///
/// # Arguments
/// * `token` - The JWT string to validate
///
/// # Returns
/// * `Ok(Claims)` - The validated claims
/// * `Err(AuthError)` - If validation fails
pub fn validate_access_token(token: &str) -> Result<Claims, AuthError> {
    let config = get_config();
    let key = DecodingKey::from_secret(config.jwt_secret.as_bytes());

    let mut validation = Validation::default();
    validation.set_issuer(&["trackly-app"]);
    validation.set_audience(&["trackly-web"]);

    let token_data = decode::<Claims>(token, &key, &validation)?;

    Ok(token_data.claims)
}

/// Extract user_id from a validated JWT token string.
pub fn extract_user_id(token: &str) -> Result<Uuid, AuthError> {
    let claims = validate_access_token(token)?;
    claims.user_id()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_env() {
        // SAFETY: Tests are run serially and these environment variables
        // are only read during test initialization
        unsafe {
            std::env::set_var("GOOGLE_CLIENT_ID", "test-client-id");
            std::env::set_var("GOOGLE_CLIENT_SECRET", "test-secret");
            std::env::set_var("GOOGLE_REDIRECT_URI", "http://localhost/callback");
            std::env::set_var(
                "JWT_SECRET",
                "a-very-secure-secret-key-that-is-32-bytes-long!",
            );
            std::env::set_var("JWT_EXPIRY_SECS", "3600");
        }
    }

    #[test]
    fn test_create_and_validate_token() {
        setup_test_env();

        let user = TokenUser {
            user_id: Uuid::new_v4(),
            email: "test@example.com".to_string(),
            name: "Test User".to_string(),
            nickname: Some("tester".to_string()),
            avatar_url: Some("https://example.com/avatar.jpg".to_string()),
        };

        let token = create_access_token(&user).expect("Failed to create token");
        assert!(!token.is_empty());

        let claims = validate_access_token(&token).expect("Failed to validate token");
        assert_eq!(claims.email, "test@example.com");
        assert_eq!(claims.name, "Test User");
        assert_eq!(claims.nickname, Some("tester".to_string()));
        assert_eq!(claims.user_id().unwrap(), user.user_id);
        assert_eq!(claims.roles, vec!["user"]);
        assert_eq!(claims.iss, "trackly-app");
        assert_eq!(claims.aud, "trackly-web");
    }

    #[test]
    fn test_invalid_token() {
        setup_test_env();

        let result = validate_access_token("invalid.token.here");
        assert!(result.is_err());
    }

    #[test]
    fn test_token_expiry_check() {
        setup_test_env();

        let user = TokenUser {
            user_id: Uuid::new_v4(),
            email: "test@example.com".to_string(),
            name: "Test User".to_string(),
            nickname: None,
            avatar_url: None,
        };

        let token = create_access_token(&user).unwrap();
        let claims = validate_access_token(&token).unwrap();

        // Token should not be expiring soon (it's valid for 1 hour in tests)
        assert!(!claims.is_expiring_soon());
    }
}
