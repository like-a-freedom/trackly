use crate::error::Result;
use crate::models::TrackUploadResponse;
use crate::services::track_editor::{
    CreateTrackFromEditorRequest, DuplicateTrackRequest, UpdateTrackGeometryRequest,
};
use async_trait::async_trait;
use uuid::Uuid;

/// Service trait for track business operations.
///
/// This trait abstracts the business logic for track operations, allowing:
/// - Easy testing with mock implementations
/// - Swapping service implementations without changing handlers
/// - Clear boundaries between business logic and data access
#[async_trait]
pub trait TrackService: Send + Sync {
    /// Create a new track from editor-provided geometry
    async fn create_track_from_editor(
        &self,
        request: CreateTrackFromEditorRequest,
        user_id: Option<Uuid>,
    ) -> Result<TrackUploadResponse>;

    /// Update track geometry
    async fn update_track_geometry(
        &self,
        track_id: Uuid,
        request: UpdateTrackGeometryRequest,
        user_id: Option<Uuid>,
    ) -> Result<()>;

    /// Duplicate an existing track
    async fn duplicate_track(
        &self,
        track_id: Uuid,
        request: DuplicateTrackRequest,
        user_id: Option<Uuid>,
    ) -> Result<TrackUploadResponse>;
}
