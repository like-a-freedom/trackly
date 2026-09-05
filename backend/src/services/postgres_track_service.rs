use crate::error::Result;
use crate::models::TrackUploadResponse;
use crate::services::track_editor::{
    CreateTrackFromEditorRequest, DuplicateTrackRequest, UpdateTrackGeometryRequest, create_track,
    duplicate_track, update_track_geometry,
};
use crate::services::track_service::TrackService;
use async_trait::async_trait;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

/// PostgreSQL implementation of TrackService.
///
/// Wraps the existing service functions to provide a service interface.
/// This allows for gradual migration of callers from direct service calls.
pub struct PostgresTrackService {
    pool: Arc<PgPool>,
}

impl PostgresTrackService {
    /// Create a new PostgreSQL track service
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }

    /// Get a reference to the underlying connection pool
    pub fn pool(&self) -> &Arc<PgPool> {
        &self.pool
    }
}

#[async_trait]
impl TrackService for PostgresTrackService {
    async fn create_track_from_editor(
        &self,
        request: CreateTrackFromEditorRequest,
        user_id: Option<Uuid>,
    ) -> Result<TrackUploadResponse> {
        create_track(&self.pool, request, user_id).await
    }

    async fn update_track_geometry(
        &self,
        track_id: Uuid,
        request: UpdateTrackGeometryRequest,
        _user_id: Option<Uuid>,
    ) -> Result<()> {
        update_track_geometry(&self.pool, track_id, request).await
    }

    async fn duplicate_track(
        &self,
        track_id: Uuid,
        request: DuplicateTrackRequest,
        user_id: Option<Uuid>,
    ) -> Result<TrackUploadResponse> {
        duplicate_track(&self.pool, track_id, request, user_id).await
    }
}
