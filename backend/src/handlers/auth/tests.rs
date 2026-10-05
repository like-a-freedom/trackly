use super::*;
use axum::http::HeaderValue;

#[test]
fn extract_client_ip_from_forwarded_for() {
    let mut headers = HeaderMap::new();
    headers.insert(
        "X-Forwarded-For",
        "203.0.113.10, 70.41.3.18".parse().unwrap(),
    );

    let ip = extract_client_ip_from_headers(&headers);

    assert_eq!(ip, Some("203.0.113.10".to_string()));
}

#[test]
fn extract_client_ip_from_real_ip() {
    let mut headers = HeaderMap::new();
    headers.insert("X-Real-IP", "198.51.100.42".parse().unwrap());

    let ip = extract_client_ip_from_headers(&headers);

    assert_eq!(ip, Some("198.51.100.42".to_string()));
}

#[test]
fn extract_client_ip_ignores_unknown() {
    let mut headers = HeaderMap::new();
    headers.insert("X-Forwarded-For", "unknown".parse().unwrap());

    let ip = extract_client_ip_from_headers(&headers);

    assert_eq!(ip, None);
}

#[test]
fn extract_client_ip_none_when_missing() {
    let headers = HeaderMap::new();

    let ip = extract_client_ip_from_headers(&headers);

    assert_eq!(ip, None);
}

#[test]
fn test_user_response_from_user() {
    let user = db::User {
        id: uuid::Uuid::new_v4(),
        google_sub: "google123".to_string(),
        email: "test@example.com".to_string(),
        name: Some("Test User".to_string()),
        nickname: Some("testuser".to_string()),
        avatar_url: Some("https://example.com/avatar.jpg".to_string()),
        roles: vec!["user".to_string()],
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        last_login_at: Some(chrono::Utc::now()),
    };

    let response: UserResponse = user.into();

    assert_eq!(response.email, "test@example.com");
    assert_eq!(response.name, "Test User");
    assert_eq!(response.nickname, Some("testuser".to_string()));
    assert_eq!(
        response.avatar_url,
        Some("https://example.com/avatar.jpg".to_string())
    );
    assert!(response.roles.contains(&"user".to_string()));
}

#[test]
fn test_callback_request_deserialization() {
    let json = r#"{
        "code": "test_code_123",
        "state": "test_state_456",
        "pkce_verifier": "test_verifier_789"
    }"#;

    let request: CallbackRequest = serde_json::from_str(json).unwrap();

    assert_eq!(request.code, "test_code_123");
    assert_eq!(request.state, "test_state_456");
    assert_eq!(request.pkce_verifier, "test_verifier_789");
}

#[test]
fn test_update_nickname_request_deserialization() {
    let json = r#"{"nickname": "newnickname"}"#;
    let request: UpdateNicknameRequest = serde_json::from_str(json).unwrap();

    assert_eq!(request.nickname, Some("newnickname".to_string()));
}

#[test]
fn test_auth_response_serialization() {
    let user = UserResponse {
        id: uuid::Uuid::new_v4().to_string(),
        email: "test@example.com".to_string(),
        name: "Test User".to_string(),
        nickname: Some("testuser".to_string()),
        avatar_url: None,
        roles: vec!["user".to_string()],
    };

    let response = AuthResponse {
        user,
        access_token: "test_token".to_string(),
        expires_in: 1800,
        is_new_user: true,
    };

    let json = serde_json::to_string(&response).unwrap();
    let deserialized: serde_json::Value = serde_json::from_str(&json).unwrap();

    assert_eq!(deserialized["expires_in"], 1800);
    assert_eq!(deserialized["is_new_user"], true);
    assert_eq!(deserialized["user"]["email"], "test@example.com");
}

#[test]
fn test_delete_account_response_serialization() {
    let response = DeleteAccountResponse {
        message: "Account deleted successfully".to_string(),
        tracks_deleted: 5,
        pois_deleted: 10,
    };

    let json = serde_json::to_string(&response).unwrap();
    assert!(json.contains("Account deleted successfully"));
    assert!(json.contains("5"));
    assert!(json.contains("10"));
}

#[test]
fn test_migrate_session_response_serialization() {
    let response = MigrateSessionResponse {
        tracks_migrated: 3,
        pois_migrated: 7,
    };

    let json = serde_json::to_string(&response).unwrap();
    assert!(json.contains("3"));
    assert!(json.contains("7"));
}

#[test]
fn test_extract_refresh_token_from_cookie() {
    let mut headers = HeaderMap::new();
    headers.insert(
        "cookie",
        "refresh_token=abc123; other=value".parse().unwrap(),
    );

    let token = extract_refresh_token_from_cookie(&headers);

    assert_eq!(token, Some("abc123".to_string()));
}

#[test]
fn test_extract_refresh_token_with_multiple_cookies() {
    let mut headers = HeaderMap::new();
    headers.insert(
        "cookie",
        "session=xyz; refresh_token=mytoken123; user=admin"
            .parse()
            .unwrap(),
    );

    let token = extract_refresh_token_from_cookie(&headers);

    assert_eq!(token, Some("mytoken123".to_string()));
}

#[test]
fn test_nickname_validation() {
    // Test valid nickname
    let valid = "validuser123";
    assert!(!valid.is_empty() && valid.len() <= 50);

    // Test empty nickname
    let empty = "   ";
    assert!(empty.trim().is_empty());

    // Test long nickname
    let long_nickname = "a".repeat(51);
    assert!(long_nickname.len() > 50);
}

#[test]
fn test_migrate_session_request_deserialization() {
    let session_id = uuid::Uuid::new_v4();
    let json = format!(r#"{{"session_id": "{}"}}"#, session_id);

    let request: MigrateSessionRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(request.session_id, session_id.to_string());
}

#[test]
fn test_oauth_config_response_serialization() {
    let response = OAuthConfigResponse {
        client_id: "test-client-id.apps.googleusercontent.com".to_string(),
        redirect_uri: "http://localhost:5173/auth/callback".to_string(),
    };

    let json = serde_json::to_string(&response).unwrap();
    assert!(json.contains("test-client-id"));
    assert!(json.contains("localhost:5173"));
}

#[test]
fn test_login_response_serialization() {
    let response = LoginResponse {
        authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=test"
            .to_string(),
        state: "random_state_123".to_string(),
        pkce_verifier: "random_verifier_456".to_string(),
    };

    let json = serde_json::to_string(&response).unwrap();
    assert!(json.contains("google.com"));
    assert!(json.contains("random_state_123"));
    assert!(json.contains("random_verifier_456"));
}

#[test]
fn test_refresh_response_serialization() {
    let response = RefreshResponse {
        access_token: "test_access_token".to_string(),
        refresh_token: "test_refresh_token".to_string(),
        expires_in: 1800,
    };

    let json = serde_json::to_string(&response).unwrap();
    let deserialized: serde_json::Value = serde_json::from_str(&json).unwrap();

    assert_eq!(deserialized["expires_in"], 1800);
    assert!(
        deserialized["access_token"]
            .as_str()
            .unwrap()
            .contains("test_access")
    );
}

#[test]
fn test_extract_client_ip_prefers_forwarded_for() {
    let mut headers = HeaderMap::new();
    headers.insert(
        "X-Forwarded-For",
        HeaderValue::from_static("203.0.113.10, 70.41.3.18, 10.0.0.1"),
    );
    headers.insert("X-Real-IP", HeaderValue::from_static("198.51.100.42"));

    let ip = extract_client_ip_from_headers(&headers);

    // Should prefer the first IP from X-Forwarded-For
    assert_eq!(ip, Some("203.0.113.10".to_string()));
}

#[test]
fn test_extract_client_ip_uses_real_ip_when_no_forwarded_for() {
    let mut headers = HeaderMap::new();
    headers.insert("X-Real-IP", HeaderValue::from_static("198.51.100.42"));

    let ip = extract_client_ip_from_headers(&headers);

    assert_eq!(ip, Some("198.51.100.42".to_string()));
}

#[test]
fn test_extract_client_ip_handles_whitespace() {
    let mut headers = HeaderMap::new();
    headers.insert(
        "X-Forwarded-For",
        HeaderValue::from_static("  203.0.113.10  , 70.41.3.18  "),
    );

    let ip = extract_client_ip_from_headers(&headers);

    assert_eq!(ip, Some("203.0.113.10".to_string()));
}

#[test]
fn test_extract_client_ip_handles_unknown() {
    let mut headers = HeaderMap::new();
    headers.insert("X-Forwarded-For", HeaderValue::from_static("unknown"));

    let ip = extract_client_ip_from_headers(&headers);

    assert_eq!(ip, None);
}

#[test]
fn test_extract_refresh_token_returns_none_when_missing() {
    let mut headers = HeaderMap::new();
    headers.insert(
        "cookie",
        HeaderValue::from_static("session=xyz; user=admin"),
    );

    let token = extract_refresh_token_from_cookie(&headers);

    assert_eq!(token, None);
}

#[test]
fn test_extract_refresh_token_returns_none_when_no_cookie_header() {
    let headers = HeaderMap::new();
    let token = extract_refresh_token_from_cookie(&headers);

    assert_eq!(token, None);
}

#[test]
fn test_nickname_validation_empty() {
    // Test empty nickname after trimming
    let nickname = Some("   ".to_string());

    if let Some(ref n) = nickname {
        assert!(n.trim().is_empty());
    }
}

#[test]
fn test_nickname_validation_length() {
    // Test nickname too long
    let long_nickname = "a".repeat(51);
    assert!(long_nickname.len() > 50);

    // Test valid length
    let valid_nickname = "a".repeat(50);
    assert_eq!(valid_nickname.len(), 50);
}

#[test]
fn test_user_response_id_is_string() {
    let user_id = uuid::Uuid::new_v4();
    let user = db::User {
        id: user_id,
        google_sub: "google123".to_string(),
        email: "test@example.com".to_string(),
        name: None,
        nickname: None,
        avatar_url: None,
        roles: vec![],
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        last_login_at: None,
    };

    let response: UserResponse = user.into();

    // Verify ID is converted to string
    assert_eq!(response.id, user_id.to_string());
}

#[test]
fn test_update_profile_request_deserialization() {
    let json = r#"{"name": "New Name", "nickname": "newnick"}"#;
    let request: UpdateProfileRequest = serde_json::from_str(json).unwrap();

    assert_eq!(request.name, Some("New Name".to_string()));
    assert_eq!(request.nickname, Some("newnick".to_string()));
}

#[test]
fn test_update_profile_request_name_only() {
    let json = r#"{"name": "Just Name"}"#;
    let request: UpdateProfileRequest = serde_json::from_str(json).unwrap();

    assert_eq!(request.name, Some("Just Name".to_string()));
    assert_eq!(request.nickname, None);
}

#[test]
fn test_update_profile_request_nickname_only() {
    let json = r#"{"nickname": "justnick"}"#;
    let request: UpdateProfileRequest = serde_json::from_str(json).unwrap();

    assert_eq!(request.name, None);
    assert_eq!(request.nickname, Some("justnick".to_string()));
}

#[test]
fn test_update_profile_request_empty() {
    let json = r#"{}"#;
    let request: UpdateProfileRequest = serde_json::from_str(json).unwrap();

    assert_eq!(request.name, None);
    assert_eq!(request.nickname, None);
}

#[test]
fn test_profile_response_serialization() {
    let response = UserResponse {
        id: "test-id".to_string(),
        email: "test@example.com".to_string(),
        name: "Test User".to_string(),
        nickname: Some("testnick".to_string()),
        avatar_url: Some("https://example.com/avatar.jpg".to_string()),
        roles: vec![],
    };

    let json = serde_json::to_string(&response).unwrap();
    let deserialized: serde_json::Value = serde_json::from_str(&json).unwrap();

    assert_eq!(deserialized["id"], "test-id");
    assert_eq!(deserialized["email"], "test@example.com");
    assert_eq!(deserialized["name"], "Test User");
    assert_eq!(deserialized["nickname"], "testnick");
    assert_eq!(deserialized["avatar_url"], "https://example.com/avatar.jpg");
}

#[test]
fn test_profile_response_with_defaults() {
    let response = UserResponse {
        id: "test-id".to_string(),
        email: "test@example.com".to_string(),
        name: String::new(),
        nickname: None,
        avatar_url: None,
        roles: vec![],
    };

    let json = serde_json::to_string(&response).unwrap();
    let deserialized: serde_json::Value = serde_json::from_str(&json).unwrap();

    // name should always be a string (not null)
    assert_eq!(deserialized["name"], "");
    // nullable fields should be null
    assert!(deserialized["nickname"].is_null());
    assert!(deserialized["avatar_url"].is_null());
}

#[test]
fn test_callback_request_with_special_characters() {
    // Test that special characters in code/verifier are handled
    let json = r#"{
        "code": "4/0AdY47j...special!@#chars",
        "state": "state_with-special.chars",
        "pkce_verifier": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    }"#;

    let request: CallbackRequest = serde_json::from_str(json).unwrap();

    assert!(request.code.contains("special"));
    assert!(request.state.contains("-"));
    assert!(request.pkce_verifier.contains("_"));
}

#[test]
fn refresh_cookie_targets_the_public_api_prefix() {
    let config = crate::auth::AuthConfig {
        google_client_id: "test".into(),
        google_client_secret: "test".into(),
        google_redirect_uri: "https://example.invalid/api/auth/callback".into(),
        jwt_secret: "test-secret-with-more-than-thirty-two-bytes".into(),
        jwt_expiry_secs: 1800,
        access_token_expiry_secs: 1800,
        refresh_token_expiry_secs: 604800,
        refresh_token_absolute_secs: 2592000,
        frontend_base_url: "https://example.invalid".into(),
        login_attempts_retention_days: 90,
        max_login_attempts_per_ip: 10,
    };
    let mut headers = HeaderMap::new();
    set_auth_cookies(&mut headers, "access", "refresh", &config);
    let cookies: Vec<_> = headers
        .get_all(SET_COOKIE)
        .iter()
        .map(|value| value.to_str().unwrap())
        .collect();
    let refresh = cookies
        .iter()
        .find(|value| value.starts_with("refresh_token="))
        .unwrap();
    assert!(refresh.contains("Path=/api/auth"));
    assert!(refresh.contains("HttpOnly"));
    assert!(refresh.contains("Secure"));
    clear_auth_cookies(&mut headers);
    assert!(headers.get_all(SET_COOKIE).iter().any(|value| {
        value.to_str().unwrap().starts_with("refresh_token=")
            && value.to_str().unwrap().contains("Path=/api/auth")
    }));
}
