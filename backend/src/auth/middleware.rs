//! Authentication middleware for Axum.
//!
//! Provides extractors for authenticated and optionally authenticated routes.
//!
//! Implements FR-AUTH-004: Session Management (token validation)

use axum::{RequestPartsExt, extract::FromRequestParts, http::request::Parts};
use axum_extra::extract::cookie::CookieJar;
use uuid::Uuid;

use super::errors::AuthError;
use super::jwt::{Claims, validate_access_token};

/// Authenticated user extracted from request.
///
/// Use this extractor for routes that require authentication.
/// The request will be rejected with 401 Unauthorized if:
/// - No access token is present
/// - The token is invalid or expired
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub email: String,
    pub name: Option<String>,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
    pub roles: Vec<String>,
    pub claims: Claims,
}

impl AuthUser {
    /// Check if the user has a specific role.
    pub fn has_role(&self, role: &str) -> bool {
        self.roles.iter().any(|r| r == role)
    }

    /// Check if the user is an admin.
    pub fn is_admin(&self) -> bool {
        self.has_role("admin")
    }
}

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // Try to get token from Authorization header first
        let token = if let Some(auth_header) = parts.headers.get("Authorization") {
            let auth_str = auth_header.to_str().map_err(|_| AuthError::InvalidToken)?;
            auth_str.strip_prefix("Bearer ").map(|t| t.to_string())
        } else {
            None
        };

        // Fall back to cookie if no Authorization header
        let token = match token {
            Some(t) => t,
            None => {
                // Try axum_extra CookieJar
                let cookies: CookieJar = parts.extract().await.map_err(|_| AuthError::NoToken)?;

                cookies
                    .get("access_token")
                    .map(|c| c.value().to_string())
                    .ok_or(AuthError::NoToken)?
            }
        };

        // Validate the token
        let claims = validate_access_token(&token)?;

        // Parse user_id from subject
        let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AuthError::InvalidToken)?;

        Ok(AuthUser {
            user_id,
            email: claims.email.clone(),
            name: if claims.name.is_empty() {
                None
            } else {
                Some(claims.name.clone())
            },
            nickname: claims.nickname.clone(),
            avatar_url: claims.avatar_url.clone(),
            roles: claims.roles.clone(),
            claims,
        })
    }
}

/// Optional authenticated user extracted from request.
///
/// Use this extractor for routes that work for both authenticated
/// and unauthenticated users (e.g., viewing public tracks).
///
/// Returns `None` if no valid token is present, instead of rejecting.
#[derive(Debug, Clone)]
pub struct OptionalAuthUser(pub Option<AuthUser>);

impl OptionalAuthUser {
    /// Get the user if authenticated.
    pub fn user(&self) -> Option<&AuthUser> {
        self.0.as_ref()
    }

    /// Get the user ID if authenticated.
    pub fn user_id(&self) -> Option<Uuid> {
        self.0.as_ref().map(|u| u.user_id)
    }

    /// Check if the user is authenticated.
    pub fn is_authenticated(&self) -> bool {
        self.0.is_some()
    }
}

impl<S> FromRequestParts<S> for OptionalAuthUser
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        match AuthUser::from_request_parts(parts, state).await {
            Ok(user) => Ok(OptionalAuthUser(Some(user))),
            Err(_) => Ok(OptionalAuthUser(None)),
        }
    }
}

/// Extract client IP address from request.
///
/// Checks X-Forwarded-For header first (for proxied requests),
/// then falls back to the connection info.
pub fn extract_client_ip(parts: &Parts) -> String {
    // Check X-Forwarded-For header
    if let Some(forwarded) = parts.headers.get("X-Forwarded-For")
        && let Ok(value) = forwarded.to_str()
        && let Some(ip) = value.split(',').next()
    {
        return ip.trim().to_string();
    }

    // Check X-Real-IP header
    if let Some(real_ip) = parts.headers.get("X-Real-IP")
        && let Ok(value) = real_ip.to_str()
    {
        return value.trim().to_string();
    }

    // Fallback to unknown
    "unknown".to_string()
}

/// Require a specific role.
///
/// Use after `AuthUser` extractor to enforce role-based access.
pub fn require_role(user: &AuthUser, role: &str) -> Result<(), AuthError> {
    if user.has_role(role) {
        Ok(())
    } else {
        Err(AuthError::Forbidden)
    }
}

/// Require admin role.
pub fn require_admin(user: &AuthUser) -> Result<(), AuthError> {
    require_role(user, "admin")
}

/// Check if the user owns a resource.
pub fn require_owner(user: &AuthUser, owner_id: Option<Uuid>) -> Result<(), AuthError> {
    match owner_id {
        Some(id) if id == user.user_id => Ok(()),
        Some(_) => Err(AuthError::Forbidden),
        None => Err(AuthError::Forbidden), // Resource has no owner
    }
}

/// Check if the user can access a resource.
///
/// Access is allowed if:
/// - The resource is public (is_public = true)
/// - The user owns the resource
/// - The user is an admin
pub fn can_access_resource(
    user: Option<&AuthUser>,
    owner_id: Option<Uuid>,
    is_public: bool,
) -> bool {
    // Public resources are accessible to everyone
    if is_public {
        return true;
    }

    // Must be authenticated to access private resources
    let user = match user {
        Some(u) => u,
        None => return false,
    };

    // Admins can access everything
    if user.is_admin() {
        return true;
    }

    // Check ownership
    match owner_id {
        Some(id) => id == user.user_id,
        None => false, // Anonymous private resource - only admin
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_user(roles: Vec<String>) -> AuthUser {
        AuthUser {
            user_id: Uuid::new_v4(),
            email: "test@example.com".to_string(),
            name: Some("Test User".to_string()),
            nickname: Some("tester".to_string()),
            avatar_url: None,
            roles,
            claims: Claims {
                sub: Uuid::new_v4().to_string(),
                email: "test@example.com".to_string(),
                name: "Test User".to_string(),
                nickname: Some("tester".to_string()),
                avatar_url: None,
                roles: vec![],
                exp: 0,
                iat: 0,
                iss: "test".to_string(),
                aud: "test".to_string(),
            },
        }
    }

    #[test]
    fn test_has_role() {
        let user = make_test_user(vec!["user".to_string(), "moderator".to_string()]);

        assert!(user.has_role("user"));
        assert!(user.has_role("moderator"));
        assert!(!user.has_role("admin"));
    }

    #[test]
    fn test_is_admin() {
        let regular_user = make_test_user(vec!["user".to_string()]);
        let admin_user = make_test_user(vec!["user".to_string(), "admin".to_string()]);

        assert!(!regular_user.is_admin());
        assert!(admin_user.is_admin());
    }

    #[test]
    fn test_can_access_resource() {
        let user_id = Uuid::new_v4();
        let other_user_id = Uuid::new_v4();

        let mut user = make_test_user(vec!["user".to_string()]);
        user.user_id = user_id;

        let mut admin = make_test_user(vec!["admin".to_string()]);
        admin.user_id = other_user_id;

        // Public resource - accessible to everyone
        assert!(can_access_resource(None, Some(user_id), true));
        assert!(can_access_resource(Some(&user), Some(other_user_id), true));

        // Private resource - owner can access
        assert!(can_access_resource(Some(&user), Some(user_id), false));

        // Private resource - non-owner cannot access
        assert!(!can_access_resource(
            Some(&user),
            Some(other_user_id),
            false
        ));

        // Private resource - unauthenticated cannot access
        assert!(!can_access_resource(None, Some(user_id), false));

        // Admin can access any private resource
        assert!(can_access_resource(Some(&admin), Some(user_id), false));
    }

    #[test]
    fn test_require_role() {
        let user = make_test_user(vec!["user".to_string()]);

        assert!(require_role(&user, "user").is_ok());
        assert!(require_role(&user, "admin").is_err());
    }
}
