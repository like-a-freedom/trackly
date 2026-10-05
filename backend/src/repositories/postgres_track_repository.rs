use crate::db::InsertTrackParams;
use crate::error::AppError;
use crate::models::{TrackDetail, TrackListItem, TrackSearchResult};
use crate::repositories::*;
use async_trait::async_trait;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

/// PostgreSQL implementation of TrackRepository.
///
/// Wraps the existing db functions to provide a repository interface.
/// This allows for gradual migration of callers from direct db access.
pub struct PostgresTrackRepository {
    pool: Arc<PgPool>,
}

impl PostgresTrackRepository {
    /// Create a new PostgreSQL track repository
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }

    /// Get a reference to the underlying connection pool
    pub fn pool(&self) -> &Arc<PgPool> {
        &self.pool
    }
}

#[async_trait]
impl TrackRepository for PostgresTrackRepository {
    async fn find_by_id(&self, id: Uuid) -> Result<Option<TrackDetail>, AppError> {
        crate::db::get_track_detail(&self.pool, id)
            .await
            .map_err(AppError::from)
    }

    async fn list_tracks(&self, params: ListTracksParams) -> Result<Vec<TrackListItem>, AppError> {
        let query = crate::models::TrackListQuery {
            categories: params.categories,
            min_length: None,
            max_length: None,
            elevation_gain_min: None,
            elevation_gain_max: None,
            slope_min: None,
            slope_max: None,
            owner_session_id: params.session_id,
            owner_user_id: params.user_id,
            mine: if params.user_id.is_some() {
                Some(true)
            } else {
                None
            },
        };
        crate::db::list_tracks(&self.pool, &query)
            .await
            .map_err(AppError::from)
    }

    async fn insert(&self, params: InsertTrackParams<'_>) -> Result<Uuid, AppError> {
        let id = params.id;
        crate::db::insert_track(params).await?;
        Ok(id)
    }

    async fn update_metadata(
        &self,
        id: Uuid,
        params: UpdateTrackMetadataParams,
    ) -> Result<(), AppError> {
        if let Some(name) = params.name {
            crate::db::update_track_name(&self.pool, id, &name).await?;
        }
        if let Some(description) = params.description {
            crate::db::update_track_description(&self.pool, id, &description).await?;
        }
        if let Some(categories) = params.categories {
            crate::db::update_track_categories(&self.pool, id, &categories).await?;
        }
        Ok(())
    }

    async fn update_geometry(
        &self,
        id: Uuid,
        params: UpdateTrackGeometryParams,
    ) -> Result<(), AppError> {
        crate::db::update_track_geometry(
            &self.pool,
            id,
            &params.geom_geojson,
            params.length_km,
            crate::db::GeometryUpdateOptions {
                waypoints: None,
                segment_meta: params.segment_meta,
                pois: None,
                session_id: None,
            },
            "", // hash - empty for updates
        )
        .await
        .map_err(AppError::from)
    }

    async fn delete(&self, id: Uuid) -> Result<bool, AppError> {
        let rows_affected = crate::db::delete_track(&self.pool, id)
            .await
            .map_err(AppError::from)?;
        Ok(rows_affected > 0)
    }

    async fn exists_by_hash(&self, hash: &str) -> Result<Option<Uuid>, AppError> {
        crate::db::track_exists(&self.pool, hash)
            .await
            .map_err(AppError::from)
    }

    async fn get_ownership(&self, id: Uuid) -> Result<Option<TrackOwnership>, AppError> {
        match crate::db::get_track_ownership(&self.pool, id).await {
            Ok((session_id, user_id)) => Ok(Some(TrackOwnership {
                user_id,
                session_id,
                is_public: false,
            })),
            Err(sqlx::Error::RowNotFound) => Ok(None),
            Err(e) => Err(AppError::from(e)),
        }
    }

    async fn search(&self, query: &str) -> Result<Vec<TrackSearchResult>, AppError> {
        crate::db::search_tracks(&self.pool, query)
            .await
            .map_err(AppError::from)
    }

    async fn list_geojson(&self, params: ListGeoJsonParams) -> Result<serde_json::Value, AppError> {
        let bbox_str = params
            .bbox
            .map(|b| format!("{},{},{},{}", b.min_lng, b.min_lat, b.max_lng, b.max_lat));
        let zoom_f64 = params.zoom.map(|z| z as f64);

        let query = crate::models::TrackGeoJsonQuery {
            bbox: bbox_str,
            zoom: zoom_f64,
            mode: params.mode.clone(),
            categories: params.categories,
            min_length: None,
            max_length: None,
            elevation_gain_min: None,
            elevation_gain_max: None,
            slope_min: None,
            slope_max: None,
            owner_session_id: params.session_id,
            owner_user_id: None,
            mine: Some(params.mine),
        };

        let result = crate::db::list_tracks_geojson(
            &self.pool,
            query.bbox.as_deref(),
            query.zoom,
            query.mode.as_deref(),
            &query,
        )
        .await
        .map_err(AppError::from)?;

        serde_json::to_value(result)
            .map_err(|e| AppError::Internal(anyhow::Error::msg(e.to_string())))
    }
}
