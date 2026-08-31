//! User database operations.
//!
//! Implements user CRUD operations for the authentication system.

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::{AuthError, OAuthUser};

/// User entity from database.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub google_sub: String,
    pub email: String,
    pub name: Option<String>,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
    pub roles: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_login_at: Option<DateTime<Utc>>,
}

impl User {
    /// Check if user has a specific role.
    pub fn has_role(&self, role: &str) -> bool {
        self.roles.iter().any(|r| r == role)
    }

    /// Check if user is admin.
    pub fn is_admin(&self) -> bool {
        self.has_role("admin")
    }
}

/// Create or update a user from OAuth login.
///
/// If the user exists (by google_sub), updates their profile info.
/// Otherwise, creates a new user.
///
/// Returns the user and whether they were newly created.
pub async fn upsert_user(
    pool: &Arc<PgPool>,
    oauth_user: &OAuthUser,
) -> Result<(User, bool), AuthError> {
    // Try to find existing user
    let existing = get_user_by_google_sub(pool, &oauth_user.google_sub).await?;

    if let Some(_user) = existing {
        // Update existing user
        let updated: User = sqlx::query_as(
            r#"
            UPDATE users
            SET
                email = $1,
                name = $2,
                avatar_url = $3,
                last_login_at = NOW(),
                updated_at = NOW()
            WHERE google_sub = $4
            RETURNING
                user_id AS id,
                google_sub,
                email,
                name,
                nickname,
                avatar_url,
                roles,
                created_at,
                updated_at,
                last_login_at
            "#,
        )
        .bind(&oauth_user.email)
        .bind(&oauth_user.name)
        .bind(&oauth_user.picture)
        .bind(&oauth_user.google_sub)
        .fetch_one(&**pool)
        .await?;

        tracing::info!(user_id = %updated.id, email = %updated.email, "Existing user logged in");
        Ok((updated, false))
    } else {
        // Create new user
        let user_id = Uuid::new_v4();
        let user: User = sqlx::query_as(
            r#"
            INSERT INTO users (user_id, google_sub, email, name, avatar_url, last_login_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING
                user_id AS id,
                google_sub,
                email,
                name,
                nickname,
                avatar_url,
                roles,
                created_at,
                updated_at,
                last_login_at
            "#,
        )
        .bind(user_id)
        .bind(&oauth_user.google_sub)
        .bind(&oauth_user.email)
        .bind(&oauth_user.name)
        .bind(&oauth_user.picture)
        .fetch_one(&**pool)
        .await?;

        tracing::info!(user_id = %user.id, email = %user.email, "New user created");
        Ok((user, true))
    }
}

/// Get a user by their ID.
pub async fn get_user_by_id(pool: &Arc<PgPool>, user_id: Uuid) -> Result<Option<User>, AuthError> {
    let user: Option<User> = sqlx::query_as(
        r#"
        SELECT
            user_id AS id,
            google_sub,
            email,
            name,
            nickname,
            avatar_url,
            roles,
            created_at,
            updated_at,
            last_login_at
        FROM users
        WHERE user_id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(&**pool)
    .await?;

    Ok(user)
}

/// Get a user by their Google subject ID.
pub async fn get_user_by_google_sub(
    pool: &Arc<PgPool>,
    google_sub: &str,
) -> Result<Option<User>, AuthError> {
    let user: Option<User> = sqlx::query_as(
        r#"
        SELECT
            user_id AS id,
            google_sub,
            email,
            name,
            nickname,
            avatar_url,
            roles,
            created_at,
            updated_at,
            last_login_at
        FROM users
        WHERE google_sub = $1
        "#,
    )
    .bind(google_sub)
    .fetch_optional(&**pool)
    .await?;

    Ok(user)
}

/// Get a user by their email address.
pub async fn get_user_by_email(pool: &Arc<PgPool>, email: &str) -> Result<Option<User>, AuthError> {
    let user: Option<User> = sqlx::query_as(
        r#"
        SELECT
            user_id AS id,
            google_sub,
            email,
            name,
            nickname,
            avatar_url,
            roles,
            created_at,
            updated_at,
            last_login_at
        FROM users
        WHERE email = $1
        "#,
    )
    .bind(email)
    .fetch_optional(&**pool)
    .await?;

    Ok(user)
}

/// Update a user's nickname.
pub async fn update_user_nickname(
    pool: &Arc<PgPool>,
    user_id: Uuid,
    nickname: Option<&str>,
) -> Result<User, AuthError> {
    let user: User = sqlx::query_as(
        r#"
        UPDATE users
        SET nickname = $1, updated_at = NOW()
        WHERE user_id = $2
        RETURNING
            user_id AS id,
            google_sub,
            email,
            name,
            nickname,
            avatar_url,
            roles,
            created_at,
            updated_at,
            last_login_at
        "#,
    )
    .bind(nickname)
    .bind(user_id)
    .fetch_one(&**pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::RowNotFound => AuthError::UserNotFound,
        _ => AuthError::from(e),
    })?;

    Ok(user)
}

/// Update a user's roles (admin only).
pub async fn update_user_roles(
    pool: &Arc<PgPool>,
    user_id: Uuid,
    roles: &[String],
) -> Result<User, AuthError> {
    let user: User = sqlx::query_as(
        r#"
        UPDATE users
        SET roles = $1, updated_at = NOW()
        WHERE user_id = $2
        RETURNING
            user_id AS id,
            google_sub,
            email,
            name,
            nickname,
            avatar_url,
            roles,
            created_at,
            updated_at,
            last_login_at
        "#,
    )
    .bind(roles)
    .bind(user_id)
    .fetch_one(&**pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::RowNotFound => AuthError::UserNotFound,
        _ => AuthError::from(e),
    })?;

    Ok(user)
}

/// Count total users in the system.
pub async fn count_users(pool: &Arc<PgPool>) -> Result<i64, AuthError> {
    let count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*)::bigint FROM users"#)
        .fetch_one(&**pool)
        .await?;

    Ok(count)
}

/// Associate existing anonymous tracks with a user.
///
/// This is used after OAuth login to claim tracks that were created
/// with a session_id but no user_id.
///
/// Implements FR-TRACK-001: Session track migration
pub async fn migrate_session_tracks(
    pool: &Arc<PgPool>,
    user_id: Uuid,
    session_id: Uuid,
) -> Result<u64, AuthError> {
    // Update tracks that have this session_id but no user_id
    let result = sqlx::query(
        r#"
        UPDATE tracks
        SET user_id = $1, updated_at = NOW()
        WHERE session_id = $2 AND user_id IS NULL
        "#,
    )
    .bind(user_id)
    .bind(session_id)
    .execute(&**pool)
    .await?;

    let migrated = result.rows_affected();

    if migrated > 0 {
        tracing::info!(
            user_id = %user_id,
            session_id = %session_id,
            tracks_migrated = migrated,
            "Session tracks migrated to user account"
        );
    }

    Ok(migrated)
}

/// Migrate POIs from session to user account.
pub async fn migrate_session_pois(
    pool: &Arc<PgPool>,
    user_id: Uuid,
    session_id: Uuid,
) -> Result<u64, AuthError> {
    let result = sqlx::query(
        r#"
        UPDATE pois
        SET user_id = $1, updated_at = NOW()
        WHERE session_id = $2 AND user_id IS NULL
        "#,
    )
    .bind(user_id)
    .bind(session_id)
    .execute(&**pool)
    .await?;

    let migrated = result.rows_affected();

    if migrated > 0 {
        tracing::info!(
            user_id = %user_id,
            session_id = %session_id,
            pois_migrated = migrated,
            "Session POIs migrated to user account"
        );
    }

    Ok(migrated)
}

/// Get count of user's tracks.
pub async fn get_user_track_count(pool: &Arc<PgPool>, user_id: Uuid) -> Result<i64, AuthError> {
    let count: i64 =
        sqlx::query_scalar(r#"SELECT COUNT(*)::bigint FROM tracks WHERE user_id = $1"#)
            .bind(user_id)
            .fetch_one(&**pool)
            .await?;

    Ok(count)
}

/// Get count of user's POIs.
pub async fn get_user_poi_count(pool: &Arc<PgPool>, user_id: Uuid) -> Result<i64, AuthError> {
    let count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*)::bigint FROM pois WHERE user_id = $1"#)
        .bind(user_id)
        .fetch_one(&**pool)
        .await?;

    Ok(count)
}

/// Delete a user account and all associated data.
///
/// Implements FR-DELETE-001: Account Deletion Flow
///
/// This performs a cascading delete:
/// 1. Delete all tracks owned by the user (cascades to track_points, pois links)
/// 2. Delete all POIs owned by the user
/// 3. Delete all refresh tokens
/// 4. Delete the user record
///
/// Returns the counts of deleted items.
#[derive(Debug)]
pub struct DeleteAccountResult {
    pub tracks_deleted: u64,
    pub pois_deleted: u64,
    pub tokens_deleted: u64,
}

pub async fn delete_user_account(
    pool: &Arc<PgPool>,
    user_id: Uuid,
) -> Result<DeleteAccountResult, AuthError> {
    // Start transaction
    let mut tx = pool.begin().await?;

    // 1. Delete tracks (cascade handles track_pois, but we count them)
    let tracks_result = sqlx::query(r#"DELETE FROM tracks WHERE user_id = $1"#)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    let tracks_deleted = tracks_result.rows_affected();

    // 2. Delete POIs owned by user
    let pois_result = sqlx::query(r#"DELETE FROM pois WHERE user_id = $1"#)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    let pois_deleted = pois_result.rows_affected();

    // 3. Delete refresh tokens
    let tokens_result = sqlx::query(r#"DELETE FROM user_refresh_tokens WHERE user_id = $1"#)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    let tokens_deleted = tokens_result.rows_affected();

    // 4. Anonymize poi_audit_log entries (set user_id to NULL)
    sqlx::query(r#"UPDATE poi_audit_log SET user_id = NULL WHERE user_id = $1"#)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    // 5. Anonymize login_attempts entries
    sqlx::query(r#"UPDATE login_attempts SET user_id = NULL WHERE user_id = $1"#)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    // 6. Delete user record
    let user_result = sqlx::query(r#"DELETE FROM users WHERE user_id = $1"#)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    if user_result.rows_affected() == 0 {
        tx.rollback().await?;
        return Err(AuthError::UserNotFound);
    }

    // Commit transaction
    tx.commit().await?;

    tracing::info!(
        user_id = %user_id,
        tracks_deleted = tracks_deleted,
        pois_deleted = pois_deleted,
        tokens_deleted = tokens_deleted,
        "User account deleted"
    );

    Ok(DeleteAccountResult {
        tracks_deleted,
        pois_deleted,
        tokens_deleted,
    })
}

/// Track summary for user's account page (no geometry).
#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
pub struct UserTrackSummary {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub categories: Vec<String>,
    pub length_km: f64,
    pub elevation_gain: Option<f64>,
    pub elevation_loss: Option<f64>,
    pub is_public: bool,
    pub created_at: Option<DateTime<Utc>>,
    pub recorded_at: Option<DateTime<Utc>>,
}

/// List user's tracks for account page (summary only, no geometry).
///
/// Implements FR-TRACK-005: Track Listing in Account Page
pub async fn list_user_tracks(
    pool: &Arc<PgPool>,
    user_id: Uuid,
    sort: Option<&str>,
    order: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<(Vec<UserTrackSummary>, i64), AuthError> {
    // Build sort clause
    let sort_column = match sort {
        Some("name") => "name",
        Some("length_km") => "length_km",
        Some("elevation_gain") => "elevation_gain",
        _ => "created_at",
    };

    let sort_order = match order {
        Some("asc") => "ASC",
        _ => "DESC",
    };

    // Build dynamic query
    let query = build_user_tracks_query(sort_column, sort_order);

    let tracks: Vec<UserTrackSummary> = sqlx::query_as(&query)
        .bind(user_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&**pool)
        .await?;

    // Get total count
    let total: i64 =
        sqlx::query_scalar(r#"SELECT COUNT(*)::bigint FROM tracks WHERE user_id = $1"#)
            .bind(user_id)
            .fetch_one(&**pool)
            .await?;

    Ok((tracks, total))
}

fn build_user_tracks_query(sort_column: &str, sort_order: &str) -> String {
    format!(
        r#"
        SELECT
            id,
            name,
            description,
            categories,
            length_km,
            elevation_gain::float8 AS elevation_gain,
            elevation_loss::float8 AS elevation_loss,
            is_public,
            created_at,
            recorded_at
        FROM tracks
        WHERE user_id = $1
        ORDER BY {} {}
        LIMIT $2
        OFFSET $3
        "#,
        sort_column, sort_order
    )
}

/// Update track visibility (public/private).
///
/// Implements FR-TRACK-003: Track Visibility Control
pub async fn update_track_visibility(
    pool: &Arc<PgPool>,
    track_id: Uuid,
    user_id: Uuid,
    is_public: bool,
) -> Result<bool, AuthError> {
    let result = sqlx::query(
        r#"
        UPDATE tracks
        SET is_public = $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3
        "#,
    )
    .bind(is_public)
    .bind(track_id)
    .bind(user_id)
    .execute(&**pool)
    .await?;

    if result.rows_affected() == 0 {
        // Check if track exists
        let exists: bool =
            sqlx::query_scalar(r#"SELECT EXISTS(SELECT 1 FROM tracks WHERE id = $1)"#)
                .bind(track_id)
                .fetch_one(&**pool)
                .await?;

        if !exists {
            return Err(AuthError::InvalidInput("Track not found".into()));
        }

        // Track exists but user doesn't own it
        return Err(AuthError::Forbidden);
    }

    tracing::info!(
        track_id = %track_id,
        user_id = %user_id,
        is_public = is_public,
        "Track visibility updated"
    );

    Ok(true)
}

/// Result of a bulk visibility toggle operation.
#[derive(Debug, Clone, serde::Serialize, sqlx::FromRow)]
pub struct BulkVisibilityResult {
    pub id: Uuid,
    pub is_public: bool,
}

/// Toggle visibility for multiple tracks at once.
///
/// This toggles each track's visibility (public->private, private->public).
/// Only tracks owned by the user will be updated.
pub async fn bulk_toggle_track_visibility(
    pool: &Arc<PgPool>,
    user_id: Uuid,
    track_ids: &[Uuid],
) -> Result<Vec<BulkVisibilityResult>, AuthError> {
    if track_ids.is_empty() {
        return Ok(Vec::new());
    }

    // Toggle visibility for all specified tracks owned by the user
    let results: Vec<BulkVisibilityResult> = sqlx::query_as(
        r#"
        UPDATE tracks
        SET is_public = NOT is_public, updated_at = NOW()
        WHERE id = ANY($1) AND user_id = $2
        RETURNING id, is_public
        "#,
    )
    .bind(track_ids)
    .bind(user_id)
    .fetch_all(&**pool)
    .await?;

    tracing::info!(
        user_id = %user_id,
        requested = track_ids.len(),
        updated = results.len(),
        "Bulk track visibility toggled"
    );

    Ok(results)
}

/// Delete multiple tracks at once.
///
/// Only tracks owned by the user will be deleted.
/// Returns the list of deleted track IDs.
pub async fn bulk_delete_tracks(
    pool: &Arc<PgPool>,
    user_id: Uuid,
    track_ids: &[Uuid],
) -> Result<Vec<Uuid>, AuthError> {
    if track_ids.is_empty() {
        return Ok(Vec::new());
    }

    // Delete tracks owned by the user and return their IDs
    let deleted: Vec<(Uuid,)> = sqlx::query_as(
        r#"
        DELETE FROM tracks
        WHERE id = ANY($1) AND user_id = $2
        RETURNING id
        "#,
    )
    .bind(track_ids)
    .bind(user_id)
    .fetch_all(&**pool)
    .await?;

    let deleted_ids: Vec<Uuid> = deleted.into_iter().map(|(id,)| id).collect();

    tracing::info!(
        user_id = %user_id,
        requested = track_ids.len(),
        deleted = deleted_ids.len(),
        "Bulk tracks deleted"
    );

    Ok(deleted_ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_has_role() {
        let user = User {
            id: Uuid::new_v4(),
            google_sub: "test".to_string(),
            email: "test@example.com".to_string(),
            name: None,
            nickname: None,
            avatar_url: None,
            roles: vec!["user".to_string(), "moderator".to_string()],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            last_login_at: None,
        };

        assert!(user.has_role("user"));
        assert!(user.has_role("moderator"));
        assert!(!user.has_role("admin"));
    }

    #[test]
    fn test_user_is_admin() {
        let regular_user = User {
            id: Uuid::new_v4(),
            google_sub: "test".to_string(),
            email: "test@example.com".to_string(),
            name: None,
            nickname: None,
            avatar_url: None,
            roles: vec!["user".to_string()],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            last_login_at: None,
        };

        let admin_user = User {
            id: Uuid::new_v4(),
            google_sub: "admin".to_string(),
            email: "admin@example.com".to_string(),
            name: None,
            nickname: None,
            avatar_url: None,
            roles: vec!["user".to_string(), "admin".to_string()],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            last_login_at: None,
        };

        assert!(!regular_user.is_admin());
        assert!(admin_user.is_admin());
    }

    #[test]
    fn test_build_user_tracks_query_casts_elevation_fields() {
        let query = build_user_tracks_query("created_at", "DESC");

        assert!(query.contains("elevation_gain::float8"));
        assert!(query.contains("elevation_loss::float8"));
    }
}
