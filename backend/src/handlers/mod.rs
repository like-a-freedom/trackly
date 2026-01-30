//! HTTP request handlers module.
//!
//! This module contains all Axum handlers for the API:
//! - Track handlers (CRUD, upload, export)
//! - POI handlers
//! - Auth handlers (login, logout, refresh)

mod auth;
mod tracks;

// Re-export auth handlers
pub use auth::{
    AuthResponse, DeleteAccountResponse, LoginResponse, MigrateSessionResponse,
    OAuthConfigResponse, RefreshResponse, UserResponse, UserTracksResponse, delete_account,
    get_current_user, google_callback, google_login, list_account_tracks, logout, logout_all,
    migrate_session_tracks, oauth_config, refresh_token, update_nickname, update_track_visibility,
};

// Re-export all existing track/poi handlers
pub use tracks::*;
