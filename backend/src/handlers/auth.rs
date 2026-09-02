//! Authentication API handlers.
//!
//! Implements the authentication REST API endpoints:
//! - POST /auth/google/login - Get OAuth authorization URL
//! - POST /auth/google/callback - Exchange auth code for tokens
//! - POST /auth/refresh - Refresh access token
//! - POST /auth/logout - Revoke refresh token
//! - POST /auth/logout-all - Revoke all refresh tokens
//! - GET /api/account/me - Get current user info
//! - PATCH /auth/me/nickname - Update nickname
//! - POST /auth/migrate-session-tracks - Migrate anonymous tracks
//! - DELETE /api/account - Delete user account

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode, header::SET_COOKIE},
    response::IntoResponse,
};

use cookie::{Cookie, SameSite};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::info;

use crate::auth::{
    self, AuthError, AuthUser, OptionalAuthUser, TokenUser, check_suspicious_activity,
    create_access_token, create_refresh_token, exchange_code_for_user, generate_authorization_url,
    get_config, is_auth_configured, is_new_ip_for_user, is_rate_limited, record_login_attempt,
    revoke_all_user_tokens, revoke_refresh_token, rotate_refresh_token, validate_refresh_token,
};
use crate::db::{self, User};
use crate::error::{AppError, Result};
use crate::metrics;

/// Response for OAuth login initiation.
#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub authorization_url: String,
    pub state: String,
    pub pkce_verifier: String,
}

/// Response for successful authentication.
#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub user: UserResponse,
    pub access_token: String,
    pub expires_in: u64,
    pub is_new_user: bool,
}

/// User information response.
#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
    pub roles: Vec<String>,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id.to_string(),
            email: user.email,
            name: user.name,
            nickname: user.nickname,
            avatar_url: user.avatar_url,
            roles: user.roles,
        }
    }
}

/// Set access and refresh token cookies on the response headers.
fn set_auth_cookies(
    headers: &mut HeaderMap,
    access_token: &str,
    refresh_token: &str,
    config: &crate::auth::AuthConfig,
) {
    let refresh_cookie = Cookie::build(("refresh_token", refresh_token.to_owned()))
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Strict)
        .path("/auth")
        .max_age(cookie::time::Duration::seconds(
            config.refresh_token_expiry_secs as i64,
        ))
        .build();
    headers.insert(SET_COOKIE, refresh_cookie.to_string().parse().expect("valid cookie header"));

    let access_cookie = Cookie::build(("access_token", access_token.to_owned()))
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Strict)
        .path("/")
        .max_age(cookie::time::Duration::seconds(
            config.access_token_expiry_secs as i64,
        ))
        .build();
    headers.append(SET_COOKIE, access_cookie.to_string().parse().expect("valid cookie header"));
}

/// Clear access and refresh token cookies (set to empty with ZERO max-age).
fn clear_auth_cookies(headers: &mut HeaderMap) {
    let clear_refresh = Cookie::build(("refresh_token", ""))
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Strict)
        .path("/auth")
        .max_age(cookie::time::Duration::ZERO)
        .build();
    headers.insert(SET_COOKIE, clear_refresh.to_string().parse().expect("valid cookie header"));

    let clear_access = Cookie::build(("access_token", ""))
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Strict)
        .path("/")
        .max_age(cookie::time::Duration::ZERO)
        .build();
    headers.append(SET_COOKIE, clear_access.to_string().parse().expect("valid cookie header"));
}

/// Request for OAuth callback.
#[derive(Debug, Deserialize)]
pub struct CallbackRequest {
    pub code: String,
    pub state: String,
    pub pkce_verifier: String,
}

/// Response for token refresh.
#[derive(Debug, Serialize)]
pub struct RefreshResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
}

/// Response for OAuth config (public, no secrets).
#[derive(Debug, Serialize)]
pub struct OAuthConfigResponse {
    pub client_id: String,
    pub redirect_uri: String,
}

/// Get OAuth configuration for frontend.
///
/// GET /auth/oauth-config
///
/// Returns public OAuth configuration (client_id, redirect_uri) for the frontend
/// to construct the authorization URL.
/// Returns 503 Service Unavailable if auth is not configured.
pub async fn oauth_config() -> Result<Json<OAuthConfigResponse>> {
    if !is_auth_configured() {
        return Err(AppError::from(AuthError::AuthNotConfigured));
    }
    let config = get_config();
    Ok(Json(OAuthConfigResponse {
        client_id: config.google_client_id.clone(),
        redirect_uri: config.google_redirect_uri.clone(),
    }))
}

/// Initiate Google OAuth login.
///
/// GET /auth/google/login
///
/// Returns the OAuth authorization URL to redirect the user to.
pub async fn google_login() -> Result<Json<LoginResponse>> {
    if !is_auth_configured() {
        return Err(AppError::from(AuthError::AuthNotConfigured));
    }
    let auth_url = generate_authorization_url()?;

    Ok(Json(LoginResponse {
        authorization_url: auth_url.url,
        state: auth_url.state,
        pkce_verifier: auth_url.pkce_verifier,
    }))
}

/// Handle Google OAuth callback.
///
/// POST /auth/google/callback
///
/// Exchanges authorization code for tokens, creates/updates user,
/// and returns JWT access token and refresh token.
pub async fn google_callback(
    State(pool): State<Arc<PgPool>>,
    headers: HeaderMap,
    Json(request): Json<CallbackRequest>,
) -> Result<impl IntoResponse> {
    if !is_auth_configured() {
        return Err(AppError::from(AuthError::AuthNotConfigured));
    }
    let client_ip = extract_client_ip_from_headers(&headers); // Option<String>

    // Check rate limiting
    if is_rate_limited(&pool, client_ip.as_deref()).await? {
        record_login_attempt(
            &pool,
            client_ip.as_deref(),
            None,
            false,
            Some("rate_limited"),
        )
        .await?;
        metrics::record_auth_rate_limit("login");
        metrics::record_auth_login_attempt("google", false);
        return Err(AppError::from(AuthError::RateLimited));
    }

    // Exchange code for user info
    let oauth_user = match exchange_code_for_user(
        &request.code,
        "", // nonce not used in simplified OAuth2 flow
        &request.pkce_verifier,
    )
    .await
    {
        Ok(user) => user,
        Err(e) => {
            record_login_attempt(
                &pool,
                client_ip.as_deref(),
                None,
                false,
                Some(&e.to_string()),
            )
            .await?;
            metrics::record_auth_login_attempt("google", false);
            // Check suspicious activity even for failed attempts
            check_suspicious_activity(&pool, client_ip.as_deref(), None, false).await?;
            return Err(AppError::from(e));
        }
    };

    // Upsert user in database
    let (user, is_new_user) = db::upsert_user(&pool, &oauth_user).await?;

    // Check if this is a new IP for the user
    let is_new_ip =
        !is_new_user && is_new_ip_for_user(&pool, user.id, client_ip.as_deref()).await?;

    // Record successful login
    record_login_attempt(&pool, client_ip.as_deref(), Some(user.id), true, None).await?;
    metrics::record_auth_login_attempt("google", true);
    metrics::inc_auth_active_sessions();

    // Check for suspicious activity patterns
    check_suspicious_activity(&pool, client_ip.as_deref(), Some(user.id), is_new_ip).await?;

    // Track new user registration
    if is_new_user {
        metrics::record_auth_user_registration("google");
    }

    // Generate tokens
    let token_user = TokenUser {
        user_id: user.id,
        email: user.email.clone(),
        name: user.name.clone().unwrap_or_default(),
        nickname: user.nickname.clone(),
        avatar_url: user.avatar_url.clone(),
    };

    let access_token = create_access_token(&token_user)?;
    let (refresh_token, _family_id) = create_refresh_token(&pool, user.id, None).await?;

    let config = get_config();

    // Build response with cookies
    let mut headers = HeaderMap::new();
    set_auth_cookies(&mut headers, &access_token, &refresh_token, config);

    info!(
        user_id = %user.id,
        is_new_user = is_new_user,
        "User authenticated via Google OAuth"
    );

    let response = AuthResponse {
        user: user.into(),
        access_token,
        expires_in: config.access_token_expiry_secs,
        is_new_user,
    };

    Ok((headers, Json(response)))
}

/// Refresh access token.
///
/// POST /auth/refresh
///
/// Uses refresh token from HttpOnly cookie to get a new access token.
/// Implements token rotation for security.
pub async fn refresh_token(
    State(pool): State<Arc<PgPool>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse> {
    if !is_auth_configured() {
        return Err(AppError::from(AuthError::AuthNotConfigured));
    }
    let start = std::time::Instant::now();

    // Extract refresh token from cookie
    let refresh_token = match extract_refresh_token_from_cookie(&headers) {
        Some(t) => t,
        // No refresh token cookie means user is not authenticated yet - return 204 No Content
        None => {
            let resp = axum::http::Response::builder()
                .status(axum::http::StatusCode::NO_CONTENT)
                .body(axum::body::Body::empty())
                .expect("valid response");
            return Ok(resp);
        }
    };

    // Validate refresh token
    let token = match validate_refresh_token(&pool, &refresh_token).await {
        Ok(t) => {
            metrics::observe_auth_token_validation("success", start.elapsed().as_secs_f64());
            t
        }
        Err(AuthError::TokenExpired) => {
            metrics::observe_auth_token_validation("expired", start.elapsed().as_secs_f64());
            metrics::record_auth_token_refresh("expired");
            return Err(AppError::from(AuthError::TokenExpired));
        }
        Err(AuthError::RefreshTokenRevoked) | Err(AuthError::TokenFamilyRevoked) => {
            metrics::observe_auth_token_validation("invalid", start.elapsed().as_secs_f64());
            metrics::record_auth_token_refresh("revoked");
            return Err(AppError::from(AuthError::RefreshTokenRevoked));
        }
        Err(e) => {
            metrics::observe_auth_token_validation("invalid", start.elapsed().as_secs_f64());
            metrics::record_auth_token_refresh("invalid");
            return Err(AppError::from(e));
        }
    };

    // Rotate the token
    let new_refresh_token = rotate_refresh_token(&pool, &token).await?;
    metrics::record_auth_token_refresh("success");

    // Get user info for new access token
    let user = db::get_user_by_id(&pool, token.user_id)
        .await?
        .ok_or(AppError::from(AuthError::UserNotFound))?;

    let token_user = TokenUser {
        user_id: user.id,
        email: user.email,
        name: user.name.unwrap_or_default(),
        nickname: user.nickname,
        avatar_url: user.avatar_url,
    };

    let access_token = create_access_token(&token_user)?;
    let config = get_config();

    // Set cookies
    let mut headers = HeaderMap::new();
    set_auth_cookies(&mut headers, &access_token, &new_refresh_token, config);

    let response = RefreshResponse {
        access_token,
        refresh_token: new_refresh_token,
        expires_in: config.access_token_expiry_secs,
    };

    let mut builder = axum::http::Response::builder().status(axum::http::StatusCode::OK);
    // Copy over headers
    for (name, value) in headers.iter() {
        if let Ok(s) = value.to_str() {
            builder = builder.header(name.as_str(), s);
        }
    }
    let body = serde_json::to_string(&response).expect("serializable response");
    let resp = builder.body(axum::body::Body::from(body)).expect("valid response");
    Ok(resp)
}

/// Logout - revoke refresh token.
///
/// POST /auth/logout
pub async fn logout(
    State(pool): State<Arc<PgPool>>,
    auth_user: OptionalAuthUser,
    headers: HeaderMap,
) -> Result<impl IntoResponse> {
    // Extract refresh token from cookie (optional, user might not have one)
    if let Some(refresh_token) = extract_refresh_token_from_cookie(&headers) {
        // Revoke the specific refresh token
        let token_hash = auth::hash_token(&refresh_token);
        revoke_refresh_token(&pool, &token_hash).await?;
        metrics::dec_auth_active_sessions();
    }

    if let Some(user) = auth_user.user() {
        info!(user_id = %user.user_id, "User logged out");
    }

    // Clear cookies
    let mut headers = HeaderMap::new();
    clear_auth_cookies(&mut headers);

    Ok((headers, StatusCode::NO_CONTENT))
}

/// Logout from all devices - revoke all refresh tokens.
///
/// POST /auth/logout-all
pub async fn logout_all(
    State(pool): State<Arc<PgPool>>,
    auth_user: AuthUser,
) -> Result<impl IntoResponse> {
    revoke_all_user_tokens(&pool, auth_user.user_id).await?;

    info!(user_id = %auth_user.user_id, "User logged out from all devices");

    // Clear cookies
    let mut headers = HeaderMap::new();
    clear_auth_cookies(&mut headers);

    Ok((headers, StatusCode::NO_CONTENT))
}

/// Get current user info.
///
/// GET /api/account/me
pub async fn get_current_user(
    State(pool): State<Arc<PgPool>>,
    auth_user: AuthUser,
) -> Result<Json<UserResponse>> {
    let user = db::get_user_by_id(&pool, auth_user.user_id)
        .await?
        .ok_or(AppError::from(AuthError::UserNotFound))?;

    Ok(Json(user.into()))
}

/// Update current user's nickname.
///
/// PATCH /auth/me/nickname
#[derive(Debug, Deserialize)]
pub struct UpdateNicknameRequest {
    pub nickname: Option<String>,
}

pub async fn update_nickname(
    State(pool): State<Arc<PgPool>>,
    auth_user: AuthUser,
    Json(request): Json<UpdateNicknameRequest>,
) -> Result<Json<UserResponse>> {
    // Validate nickname
    if let Some(ref nickname) = request.nickname {
        if nickname.len() > 50 {
            return Err(AppError::from(AuthError::InvalidInput(
                "Nickname too long (max 50 chars)".into(),
            )));
        }
        if nickname.trim().is_empty() {
            return Err(AppError::from(AuthError::InvalidInput(
                "Nickname cannot be empty".into(),
            )));
        }
    }

    let user =
        db::update_user_nickname(&pool, auth_user.user_id, request.nickname.as_deref()).await?;

    Ok(Json(user.into()))
}

/// Request for session track migration.
#[derive(Debug, Deserialize)]
pub struct MigrateSessionRequest {
    pub session_id: String,
}

/// Response for session track migration.
#[derive(Debug, Serialize)]
pub struct MigrateSessionResponse {
    pub tracks_migrated: u64,
    pub pois_migrated: u64,
}

/// Migrate anonymous session tracks to user account.
///
/// POST /auth/migrate-session-tracks
///
/// Implements FR-TRACK-001: Session track migration
pub async fn migrate_session_tracks(
    State(pool): State<Arc<PgPool>>,
    auth_user: AuthUser,
    Json(request): Json<MigrateSessionRequest>,
) -> Result<Json<MigrateSessionResponse>> {
    // Parse session_id
    let session_id = uuid::Uuid::parse_str(&request.session_id).map_err(|_| {
        metrics::record_auth_session_migration("failed");
        AppError::from(AuthError::InvalidInput(
            "Invalid session_id format (expected UUID)".into(),
        ))
    })?;

    // Migrate tracks
    let tracks_migrated = db::migrate_session_tracks(&pool, auth_user.user_id, session_id).await?;

    // Migrate POIs
    let pois_migrated = db::migrate_session_pois(&pool, auth_user.user_id, session_id).await?;

    metrics::record_auth_session_migration("success");

    info!(
        user_id = %auth_user.user_id,
        session_id = %session_id,
        tracks_migrated = tracks_migrated,
        pois_migrated = pois_migrated,
        "Session data migrated to user account"
    );

    Ok(Json(MigrateSessionResponse {
        tracks_migrated,
        pois_migrated,
    }))
}

/// Response for account deletion.
#[derive(Debug, Serialize)]
pub struct DeleteAccountResponse {
    pub message: String,
    pub tracks_deleted: u64,
    pub pois_deleted: u64,
}

/// Delete user account.
///
/// DELETE /api/account
///
/// Implements FR-DELETE-001: Account Deletion Flow
pub async fn delete_account(
    State(pool): State<Arc<PgPool>>,
    auth_user: AuthUser,
) -> Result<impl IntoResponse> {
    let result = match db::delete_user_account(&pool, auth_user.user_id).await {
        Ok(r) => {
            metrics::record_auth_account_deletion("success");
            r
        }
        Err(e) => {
            metrics::record_auth_account_deletion("failed");
            return Err(e);
        }
    };

    info!(
        user_id = %auth_user.user_id,
        tracks_deleted = result.tracks_deleted,
        pois_deleted = result.pois_deleted,
        "User account deleted"
    );

    // Clear cookies
    let mut headers = HeaderMap::new();
    clear_auth_cookies(&mut headers);

    let response = DeleteAccountResponse {
        message: "Account deleted successfully".to_string(),
        tracks_deleted: result.tracks_deleted,
        pois_deleted: result.pois_deleted,
    };

    Ok((headers, Json(response)))
}

/// Helper to extract refresh token from HttpOnly cookie.
fn extract_refresh_token_from_cookie(headers: &HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(|cookies| {
            cookies.split(';').find_map(|cookie| {
                let cookie = cookie.trim();
                if cookie.starts_with("refresh_token=") {
                    Some(cookie.trim_start_matches("refresh_token=").to_string())
                } else {
                    None
                }
            })
        })
}

/// Helper to extract client IP from headers.
fn extract_client_ip_from_headers(headers: &HeaderMap) -> Option<String> {
    // Check X-Forwarded-For
    if let Some(forwarded) = headers.get("X-Forwarded-For")
        && let Ok(value) = forwarded.to_str()
        && let Some(ip) = value.split(',').next()
    {
        let ip = ip.trim();
        if ip.is_empty() || ip.eq_ignore_ascii_case("unknown") {
            // Unknown placeholder — treat as absent
        } else {
            return Some(ip.to_string());
        }
    }

    // Check X-Real-IP
    if let Some(real_ip) = headers.get("X-Real-IP")
        && let Ok(value) = real_ip.to_str()
    {
        let ip = value.trim();
        if !ip.is_empty() && !ip.eq_ignore_ascii_case("unknown") {
            return Some(ip.to_string());
        }
    }

    None
}

#[cfg(test)]
mod tests;
