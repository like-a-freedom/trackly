//! HTTP request handlers module.
//!
//! This module contains all Axum handlers for the API:
//! - Track handlers (CRUD, upload, export)
//! - POI handlers
//! - Auth handlers (login, logout, refresh)
//! - Observability (map interactions, health)
//! - Sitemap generation

mod auth;
mod observability;
mod pois;
mod rate_limit;
mod sitemap;
mod tracks;
mod util;

// Re-export auth handlers
pub use auth::{
    AuthResponse, BulkDeleteResponse, BulkTrackRequest, BulkVisibilityResponse,
    DeleteAccountResponse, LoginResponse, MigrateSessionResponse, OAuthConfigResponse,
    RefreshResponse, UserResponse, UserTracksResponse, bulk_delete_tracks, bulk_toggle_visibility,
    delete_account, get_current_user, google_callback, google_login, list_account_tracks, logout,
    logout_all, migrate_session_tracks, oauth_config, refresh_token, update_nickname,
    update_track_visibility,
};

// Re-export observability handlers
pub use observability::{health, record_map_interaction};

// Re-export sitemap handler
pub use sitemap::sitemap;

// Re-export all track handlers
pub use tracks::*;

// Re-export POI handlers
pub use pois::*;
