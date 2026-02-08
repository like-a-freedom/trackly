//! Refresh token management with rotation and family-based revocation.
//!
//! Implements FR-AUTH-003: Refresh Token Management
//!
//! Security features:
//! - Tokens are 256-bit random strings (hex encoded)
//! - Only SHA-256 hash is stored in database
//! - Token rotation on each refresh (old token invalidated)
//! - Token family revocation on replay detection

use chrono::{DateTime, Duration, Utc};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use super::config::get_config;
use super::errors::AuthError;

/// Refresh token data from database.
#[derive(Debug, sqlx::FromRow)]
pub struct RefreshToken {
    pub id: Uuid,
    pub user_id: Uuid,
    pub family_id: Uuid,
    pub token_hash: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
}

/// Generate a cryptographically secure random token (256-bit, hex-encoded).
pub fn generate_token() -> String {
    let bytes: [u8; 32] = rand::random();
    hex::encode(bytes)
}

/// Hash a token using SHA-256.
pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

/// Create a new refresh token for a user.
///
/// # Arguments
/// * `pool` - Database connection pool
/// * `user_id` - The user's ID
/// * `family_id` - Optional family ID for token chain (new family if None)
///
/// # Returns
/// * `(plaintext_token, family_id)` - The plaintext token (to send to client) and family ID
pub async fn create_refresh_token(
    pool: &Arc<PgPool>,
    user_id: Uuid,
    family_id: Option<Uuid>,
) -> Result<(String, Uuid), AuthError> {
    let config = get_config();
    let token = generate_token();
    let token_hash = hash_token(&token);
    let family_id = family_id.unwrap_or_else(Uuid::new_v4);
    let expires_at = Utc::now() + Duration::seconds(config.refresh_token_expiry_secs as i64);

    sqlx::query(
        r#"
        INSERT INTO user_refresh_tokens (user_id, family_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(user_id)
    .bind(family_id)
    .bind(&token_hash)
    .bind(expires_at)
    .execute(&**pool)
    .await?;

    tracing::debug!(
        user_id = %user_id,
        family_id = %family_id,
        "Created new refresh token"
    );

    Ok((token, family_id))
}

/// Validate a refresh token and return the token record.
///
/// # Security
/// If a revoked token is presented (replay attack), the entire token family is revoked.
pub async fn validate_refresh_token(
    pool: &Arc<PgPool>,
    token: &str,
) -> Result<RefreshToken, AuthError> {
    let token_hash = hash_token(token);
    let config = get_config();

    // Find the token by hash
    let row: Option<RefreshToken> = sqlx::query_as(
        r#"
        SELECT id, user_id, family_id, token_hash, expires_at, created_at, revoked_at
        FROM user_refresh_tokens
        WHERE token_hash = $1
        "#,
    )
    .bind(&token_hash)
    .fetch_optional(&**pool)
    .await?;

    let token_record = row.ok_or(AuthError::InvalidRefreshToken)?;

    // Check if token was revoked (potential replay attack!)
    if token_record.revoked_at.is_some() {
        tracing::warn!(
            user_id = %token_record.user_id,
            family_id = %token_record.family_id,
            token_id = %token_record.id,
            "Replay attack detected! Revoking entire token family"
        );

        // Revoke the entire token family
        revoke_token_family(pool, token_record.family_id).await?;

        return Err(AuthError::TokenFamilyRevoked);
    }

    // Check expiration
    if token_record.expires_at < Utc::now() {
        return Err(AuthError::InvalidRefreshToken);
    }

    // Check absolute lifetime (from config)
    let absolute_expiry =
        token_record.created_at + Duration::seconds(config.refresh_token_absolute_secs as i64);
    if absolute_expiry < Utc::now() {
        return Err(AuthError::InvalidRefreshToken);
    }

    Ok(token_record)
}

/// Revoke a specific refresh token.
pub async fn revoke_refresh_token(pool: &Arc<PgPool>, token_hash: &str) -> Result<(), AuthError> {
    sqlx::query(
        r#"
        UPDATE user_refresh_tokens
        SET revoked_at = NOW()
        WHERE token_hash = $1 AND revoked_at IS NULL
        "#,
    )
    .bind(token_hash)
    .execute(&**pool)
    .await?;

    Ok(())
}

/// Revoke all tokens in a token family (chain revocation).
///
/// Used when a replay attack is detected.
pub async fn revoke_token_family(pool: &Arc<PgPool>, family_id: Uuid) -> Result<(), AuthError> {
    let result = sqlx::query(
        r#"
        UPDATE user_refresh_tokens
        SET revoked_at = NOW()
        WHERE family_id = $1 AND revoked_at IS NULL
        "#,
    )
    .bind(family_id)
    .execute(&**pool)
    .await?;

    tracing::warn!(
        family_id = %family_id,
        tokens_revoked = result.rows_affected(),
        "Token family revoked"
    );

    Ok(())
}

/// Revoke all refresh tokens for a user (logout from all devices).
pub async fn revoke_all_user_tokens(pool: &Arc<PgPool>, user_id: Uuid) -> Result<(), AuthError> {
    sqlx::query(
        r#"
        UPDATE user_refresh_tokens
        SET revoked_at = NOW()
        WHERE user_id = $1 AND revoked_at IS NULL
        "#,
    )
    .bind(user_id)
    .execute(&**pool)
    .await?;

    tracing::info!(user_id = %user_id, "All refresh tokens revoked");

    Ok(())
}

/// Rotate a refresh token (create new, revoke old).
///
/// Returns the new plaintext token.
pub async fn rotate_refresh_token(
    pool: &Arc<PgPool>,
    old_token: &RefreshToken,
) -> Result<String, AuthError> {
    // Revoke the old token
    revoke_refresh_token(pool, &old_token.token_hash).await?;

    // Create a new token in the same family
    let (new_token, _) =
        create_refresh_token(pool, old_token.user_id, Some(old_token.family_id)).await?;

    tracing::debug!(
        user_id = %old_token.user_id,
        family_id = %old_token.family_id,
        "Refresh token rotated"
    );

    Ok(new_token)
}

/// Clean up expired refresh tokens (should be run periodically).
pub async fn cleanup_expired_tokens(pool: &Arc<PgPool>) -> Result<u64, AuthError> {
    let result = sqlx::query(
        r#"
        DELETE FROM user_refresh_tokens
        WHERE expires_at < NOW() OR revoked_at < NOW() - INTERVAL '7 days'
        "#,
    )
    .execute(&**pool)
    .await?;

    let deleted = result.rows_affected();
    if deleted > 0 {
        tracing::info!(deleted = deleted, "Cleaned up expired refresh tokens");
    }

    Ok(deleted)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_token() {
        let token1 = generate_token();
        let token2 = generate_token();

        // Tokens should be 64 hex characters (256 bits)
        assert_eq!(token1.len(), 64);
        assert_eq!(token2.len(), 64);

        // Tokens should be different
        assert_ne!(token1, token2);
    }

    #[test]
    fn test_hash_token() {
        let token = "test-token";
        let hash1 = hash_token(token);
        let hash2 = hash_token(token);

        // Same token should produce same hash
        assert_eq!(hash1, hash2);

        // Hash should be 64 hex characters (SHA-256)
        assert_eq!(hash1.len(), 64);

        // Different tokens should produce different hashes
        let hash3 = hash_token("different-token");
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_hash_token_deterministic() {
        // Hashing should be deterministic
        let token = "my-secret-refresh-token";
        let hash1 = hash_token(token);
        let hash2 = hash_token(token);
        let hash3 = hash_token(token);

        assert_eq!(hash1, hash2);
        assert_eq!(hash2, hash3);
    }

    #[test]
    fn test_generate_token_hex_format() {
        let token = generate_token();

        // Token should only contain hex characters
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));

        // Token should be lowercase
        assert!(token.chars().all(|c| !c.is_ascii_uppercase()));
    }

    #[test]
    fn test_hash_token_empty() {
        // Empty string should produce valid hash
        let hash = hash_token("");
        assert_eq!(hash.len(), 64);
        assert!(!hash.is_empty());
    }

    #[test]
    fn test_hash_token_long_input() {
        // Long input should still produce valid hash
        let long_input = "a".repeat(1000);
        let hash = hash_token(&long_input);
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn test_generate_token_randomness() {
        // Generate multiple tokens and ensure they're all different
        let tokens: std::collections::HashSet<String> = (0..10).map(|_| generate_token()).collect();

        // All 10 tokens should be unique
        assert_eq!(tokens.len(), 10);
    }
}
