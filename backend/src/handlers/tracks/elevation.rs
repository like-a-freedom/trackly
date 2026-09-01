//! Elevation enrichment handlers.
//!
//! - POST /api/tracks/{id}/enrich-elevation → enrich_elevation
//! - POST /api/elevation/preview            → preview_elevation

use axum::{
    Json,
    extract::{Path, State},
};

use sqlx::PgPool;
use std::sync::Arc;
use tracing::info;

use crate::db;
use crate::error::{AppError, Result};
use crate::models::{ElevationPreviewRequest, ElevationPreviewResponse, EnrichElevationRequest};
use crate::track_utils::ElevationEnrichmentService;
use crate::track_utils::extract_coordinates_from_geojson;

/// Trigger elevation enrichment for a track.
///
/// POST /api/tracks/{id}/enrich-elevation
///
/// Calls the elevation API to enrich the track with elevation data
/// (gain, loss, profile). Can be forced even if already enriched.
pub async fn enrich_elevation(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
    Json(request): Json<EnrichElevationRequest>,
) -> Result<Json<serde_json::Value>> {
    let track = db::get_track_by_id(&pool, track_id)
        .await?
        .ok_or(AppError::NotFound)?;

    // Check if already enriched (unless forced)
    let force = request.force.unwrap_or(false);
    if track.elevation_enriched == Some(true) && !force {
        return Ok(Json(serde_json::json!({
            "id": track_id.to_string(),
            "message": "Track already has elevation data. Use force=true to re-enrich.",
            "elevation_gain": track.elevation_gain,
            "elevation_loss": track.elevation_loss,
        })));
    }

    let coordinates = extract_coordinates_from_geojson(&track.geom_geojson)
        .map_err(|e| AppError::BadRequest(format!("Invalid geometry: {e}")))?;

    if coordinates.is_empty() {
        return Err(AppError::BadRequest(
            "No coordinates found in track geometry".into(),
        ));
    }

    let outcome = crate::services::enrichment::run_enrichment(&pool, track_id, coordinates).await;

    match outcome {
        crate::services::enrichment::EnrichmentOutcome::Success { gain, loss } => {
            info!(track_id = %track_id, "elevation enrichment succeeded");
            Ok(Json(serde_json::json!({
                "id": track_id.to_string(),
                "message": "Elevation data enriched successfully",
                "elevation_gain": gain,
                "elevation_loss": loss,
            })))
        }
        crate::services::enrichment::EnrichmentOutcome::FailedRemote => Err(AppError::Internal(
            anyhow::anyhow!("Elevation API request failed"),
        )),
        crate::services::enrichment::EnrichmentOutcome::FailedUpdateDb => Err(AppError::Internal(
            anyhow::anyhow!("Failed to save elevation data"),
        )),
        crate::services::enrichment::EnrichmentOutcome::FailedSlope => {
            // Elevation saved but slope failed - partial success
            info!(track_id = %track_id, "elevation saved but slope calculation failed");
            Ok(Json(serde_json::json!({
                "id": track_id.to_string(),
                "message": "Elevation data saved but slope calculation failed",
            })))
        }
    }
}

/// Preview elevation for a set of coordinates without saving.
///
/// POST /api/elevation/preview
///
/// Returns elevation profile, gain, and loss for the given coordinates.
pub async fn preview_elevation(
    Json(request): Json<ElevationPreviewRequest>,
) -> Result<Json<ElevationPreviewResponse>> {
    if request.coordinates.is_empty() {
        return Err(AppError::BadRequest("No coordinates provided".into()));
    }

    let service = ElevationEnrichmentService::new();
    // Convert [f64; 2] arrays to (f64, f64) tuples
    let coords: Vec<(f64, f64)> = request
        .coordinates
        .into_iter()
        .map(|[lat, lon]| (lat, lon))
        .collect();
    let result = service
        .enrich_track_elevation(coords)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Elevation API error: {e}")))?;

    let elevation_gain = result.metrics.elevation_gain;
    let elevation_loss = result.metrics.elevation_loss;
    let elevation_min = result.metrics.elevation_min;
    let elevation_max = result.metrics.elevation_max;
    let elevation_profile = result.elevation_profile.unwrap_or_default();
    let dataset = result.dataset;

    Ok(Json(ElevationPreviewResponse {
        elevation_profile,
        elevation_gain,
        elevation_loss,
        elevation_min,
        elevation_max,
        elevation_dataset: dataset,
    }))
}
