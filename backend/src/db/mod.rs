// Database operations module
// Split into focused submodules for better maintainability

mod api_usage;
mod tracks;

// Re-export API usage functions
pub use api_usage::{
    get_api_usage_stats, get_today_api_usage, is_daily_limit_exceeded, record_api_usage,
};

// Re-export track-related functions and types
pub use tracks::{
    delete_track, get_track_by_id, get_track_detail, get_track_detail_adaptive, insert_track,
    list_tracks, list_tracks_geojson, search_tracks, track_exists, update_track_categories,
    update_track_description, update_track_elevation, update_track_name, update_track_slope,
    InsertTrackParams, UpdateElevationParams, UpdateSlopeParams,
};
