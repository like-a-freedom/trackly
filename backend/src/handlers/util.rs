//! Shared handler helpers: ownership checks and DB error mapping.

use crate::auth::OptionalAuthUser;
use crate::error::AppError;
use axum::http::StatusCode;
use uuid::Uuid;

/// Map a database error to a safe, generic `AppError`.
/// Internal details are never exposed to the client.
pub fn handle_db_error(err: sqlx::Error) -> AppError {
    match err {
        sqlx::Error::RowNotFound => AppError::NotFound,
        _ => AppError::Database(err),
    }
}

/// Check if the request has ownership of a track.
///
/// Ownership check priority:
/// 1. If user is authenticated (JWT), check user_id matches track.user_id
/// 2. Otherwise, check session_id matches track.session_id (anonymous ownership)
///
/// Returns Ok(()) if ownership is confirmed, Err(FORBIDDEN) otherwise.
pub fn check_track_ownership(
    track_user_id: Option<Uuid>,
    track_session_id: Option<Uuid>,
    auth_user: &OptionalAuthUser,
    request_session_id: Option<Uuid>,
) -> Result<(), StatusCode> {
    // Authenticated user check - takes priority
    if let Some(user) = auth_user.user() {
        if track_user_id == Some(user.user_id) {
            return Ok(());
        }
        // User is authenticated but doesn't own the track
        return Err(StatusCode::FORBIDDEN);
    }

    // Anonymous session check
    if let Some(req_session) = request_session_id
        && track_session_id == Some(req_session)
    {
        return Ok(());
    }

    Err(StatusCode::FORBIDDEN)
}

/// Verify that the caller owns the track (async convenience wrapper).
///
/// Fetches ownership from the database, then delegates to
/// [`check_track_ownership`]. Returns `Ok(())` on success or
/// `Err(AppError::Forbidden)` on failure.
pub async fn verify_track_owner(
    pool: &std::sync::Arc<sqlx::PgPool>,
    track_id: uuid::Uuid,
    auth_user: &OptionalAuthUser,
    session_id: Option<uuid::Uuid>,
) -> Result<(), AppError> {
    let (track_session_id, track_user_id) = crate::db::get_track_ownership(pool, track_id)
        .await
        .map_err(handle_db_error)?;
    check_track_ownership(track_user_id, track_session_id, auth_user, session_id)
        .map_err(|_| AppError::Forbidden)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::AuthUser;

    fn make_auth_user(user_id: Uuid) -> OptionalAuthUser {
        OptionalAuthUser(Some(AuthUser {
            user_id,
            email: "test@example.com".to_string(),
            name: Some("Test".to_string()),
            nickname: None,
            avatar_url: None,
            roles: vec!["user".to_string()],
            claims: crate::auth::Claims {
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

    #[test]
    fn test_check_track_ownership_with_authenticated_user() {
        let user_id = Uuid::new_v4();
        let track_user_id = Some(user_id);
        let track_session_id = Some(Uuid::new_v4());

        let auth_user = make_auth_user(user_id);
        let result = check_track_ownership(track_user_id, track_session_id, &auth_user, None);
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn test_check_track_ownership_wrong_user() {
        let user_id = Uuid::new_v4();
        let other_user = Uuid::new_v4();
        let track_session_id = Some(Uuid::new_v4());

        let auth_user = make_auth_user(other_user);
        let result = check_track_ownership(
            Some(user_id),
            track_session_id,
            &auth_user,
            Some(Uuid::new_v4()),
        );
        assert_eq!(result, Err(StatusCode::FORBIDDEN));
    }

    #[test]
    fn test_check_track_ownership_with_session() {
        let session_id = Uuid::new_v4();

        let auth_user = OptionalAuthUser(None);
        let result = check_track_ownership(None, Some(session_id), &auth_user, Some(session_id));
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn test_check_track_ownership_wrong_session() {
        let session_id = Uuid::new_v4();

        let auth_user = OptionalAuthUser(None);
        let result =
            check_track_ownership(None, Some(session_id), &auth_user, Some(Uuid::new_v4()));
        assert_eq!(result, Err(StatusCode::FORBIDDEN));
    }

    #[test]
    fn test_check_track_ownership_no_auth() {
        let auth_user = OptionalAuthUser(None);
        let result =
            check_track_ownership(Some(Uuid::new_v4()), Some(Uuid::new_v4()), &auth_user, None);
        assert_eq!(result, Err(StatusCode::FORBIDDEN));
    }

    #[test]
    fn test_handle_db_error_not_found() {
        let error = sqlx::Error::RowNotFound;
        assert!(matches!(handle_db_error(error), AppError::NotFound));
    }
}
