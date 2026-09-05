use crate::db::InsertTrackParams;
use crate::error::AppError;
use crate::models::{TrackDetail, TrackListItem, TrackSearchResult};
use async_trait::async_trait;
use uuid::Uuid;

/// Repository trait for track data access.
///
/// This trait abstracts the data source for tracks, allowing:
/// - Easy testing with mock implementations
/// - Swapping storage backends without changing business logic
/// - Clear boundaries between data access and business logic
#[async_trait]
pub trait TrackRepository: Send + Sync {
    /// Find a track by its ID
    async fn find_by_id(&self, id: Uuid) -> Result<Option<TrackDetail>, AppError>;

    /// List tracks with optional filtering
    async fn list_tracks(&self, params: ListTracksParams) -> Result<Vec<TrackListItem>, AppError>;

    /// Insert a new track
    async fn insert(&self, params: InsertTrackParams<'_>) -> Result<Uuid, AppError>;

    /// Update track metadata
    async fn update_metadata(
        &self,
        id: Uuid,
        params: UpdateTrackMetadataParams,
    ) -> Result<(), AppError>;

    /// Update track geometry
    async fn update_geometry(
        &self,
        id: Uuid,
        params: UpdateTrackGeometryParams,
    ) -> Result<(), AppError>;

    /// Delete a track
    async fn delete(&self, id: Uuid) -> Result<bool, AppError>;

    /// Check if a track exists by hash
    async fn exists_by_hash(&self, hash: &str) -> Result<Option<Uuid>, AppError>;

    /// Get track ownership information
    async fn get_ownership(&self, id: Uuid) -> Result<Option<TrackOwnership>, AppError>;

    /// Search tracks by query string
    async fn search(&self, query: &str) -> Result<Vec<TrackSearchResult>, AppError>;

    /// List tracks as GeoJSON for map display
    async fn list_geojson(&self, params: ListGeoJsonParams) -> Result<serde_json::Value, AppError>;
}

/// Parameters for listing tracks
pub struct ListTracksParams {
    pub limit: i64,
    pub offset: i64,
    pub sort: Option<String>,
    pub order: Option<String>,
    pub user_id: Option<Uuid>,
    pub categories: Option<Vec<String>>,
    pub session_id: Option<Uuid>,
}

/// Parameters for updating track metadata
pub struct UpdateTrackMetadataParams {
    pub name: Option<String>,
    pub description: Option<String>,
    pub categories: Option<Vec<String>>,
}

/// Parameters for updating track geometry
pub struct UpdateTrackGeometryParams {
    pub geom_geojson: serde_json::Value,
    pub length_km: f64,
    pub segment_meta: Option<serde_json::Value>,
}

/// Parameters for listing tracks as GeoJSON
pub struct ListGeoJsonParams {
    pub bbox: Option<BBox>,
    pub zoom: Option<i32>,
    pub mode: Option<String>,
    pub categories: Option<Vec<String>>,
    pub session_id: Option<Uuid>,
    pub mine: bool,
}

/// Bounding box for spatial queries
pub struct BBox {
    pub min_lng: f64,
    pub min_lat: f64,
    pub max_lng: f64,
    pub max_lat: f64,
}

/// Track ownership information
pub struct TrackOwnership {
    pub user_id: Option<Uuid>,
    pub session_id: Option<Uuid>,
    pub is_public: bool,
}
