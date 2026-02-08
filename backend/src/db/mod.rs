// Database operations module
// Split into focused submodules for better maintainability

mod api_usage;
mod tracks;
mod users;

// Re-export API usage functions
pub use api_usage::{
    get_api_usage_stats, get_today_api_usage, is_daily_limit_exceeded, record_api_usage,
};

// Re-export track-related functions and types
pub use tracks::{
    InsertTrackFromEditorParams, InsertTrackParams, UpdateElevationParams, UpdateSlopeParams,
    delete_track, duplicate_track, get_track_by_id, get_track_detail, get_track_detail_adaptive,
    get_track_ownership, insert_track, insert_track_from_editor, list_public_tracks_for_sitemap,
    list_tracks, list_tracks_geojson, publish_track, search_tracks, track_exists,
    update_track_categories, update_track_description, update_track_elevation,
    update_track_geometry, update_track_name, update_track_slope,
};

// Re-export user-related functions and types
pub use users::{
    BulkVisibilityResult, DeleteAccountResult, User, UserTrackSummary, bulk_delete_tracks,
    bulk_toggle_track_visibility, count_users, delete_user_account, get_user_by_email,
    get_user_by_google_sub, get_user_by_id, get_user_poi_count, get_user_track_count,
    list_user_tracks, migrate_session_pois, migrate_session_tracks, update_track_visibility,
    update_user_nickname, update_user_roles, upsert_user,
};
