use crate::{db, metrics, track_utils::ElevationEnrichmentService};
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Instant;
use tracing::{debug, error, info};
use uuid::Uuid;

/// Canonical outcome of an elevation enrichment run.
///
/// Both the HTTP handler and the background queue match on this to decide
/// what metrics to emit and what HTTP response to return.
#[derive(Debug, PartialEq)]
pub enum EnrichmentOutcome {
    /// Elevation + slope persisted successfully.
    Success {
        gain: Option<f32>,
        loss: Option<f32>,
    },
    /// The upstream elevation API failed.
    FailedRemote,
    /// The DB write of elevation data failed.
    FailedUpdateDb,
    /// The slope calculation or its DB write failed (elevation is still saved).
    FailedSlope,
}

/// Unified enrichment pipeline: call remote API → persist → slope.
///
/// This is the **single** place that does all three steps + records metrics.
/// The HTTP handler (`handlers::tracks::enrich_elevation`) and the background
/// queue (`services::enrichment_queue::run_enrichment_job`) both delegate here.
pub async fn run_enrichment(
    pool: &Arc<PgPool>,
    track_id: Uuid,
    coordinates: Vec<(f64, f64)>,
) -> EnrichmentOutcome {
    let _task_guard = metrics::BackgroundTaskGuard::new();
    let enrich_start = Instant::now();

    debug!(track_id = %track_id, endpoint = "enrichment", "starting enrichment");

    // 1. Call remote API
    let enrichment_service = ElevationEnrichmentService::new();
    let enrichment_result = match enrichment_service
        .enrich_track_elevation(coordinates.clone())
        .await
    {
        Ok(r) => r,
        Err(e) => {
            error!(track_id = %track_id, "elevation API failed: {e}");
            let elapsed = enrich_start.elapsed().as_secs_f64();
            metrics::record_track_enrich_status("failed_remote");
            metrics::observe_track_enrich_duration("failed_remote", elapsed);
            return EnrichmentOutcome::FailedRemote;
        }
    };

    // 2. Persist elevation
    if let Err(e) = db::update_track_elevation(
        pool,
        track_id,
        db::UpdateElevationParams {
            elevation_gain: enrichment_result.metrics.elevation_gain,
            elevation_loss: enrichment_result.metrics.elevation_loss,
            elevation_min: enrichment_result.metrics.elevation_min,
            elevation_max: enrichment_result.metrics.elevation_max,
            elevation_enriched: true,
            elevation_enriched_at: Some(enrichment_result.enriched_at.naive_utc()),
            elevation_dataset: Some(enrichment_result.dataset.clone()),
            elevation_profile: enrichment_result.elevation_profile.clone(),
            elevation_api_calls: enrichment_result.api_calls_used,
        },
    )
    .await
    {
        error!(track_id = %track_id, "failed to persist elevation: {e}");
        let elapsed = enrich_start.elapsed().as_secs_f64();
        metrics::record_track_enrich_status("failed_update_db");
        metrics::observe_track_enrich_duration("failed_update_db", elapsed);
        return EnrichmentOutcome::FailedUpdateDb;
    }

    // 3. Slope calculation
    if let Some(profile) = &enrichment_result.elevation_profile {
        let slope_start = Instant::now();
        let slope_result =
            crate::track_utils::slope::recalculate_slope_metrics(&coordinates, profile, &format!("Track {track_id}"));
        let slope_duration = slope_start.elapsed().as_secs_f64();

        if let Err(e) = db::update_track_slope(
            pool,
            track_id,
            db::UpdateSlopeParams {
                slope_min: slope_result.slope_min,
                slope_max: slope_result.slope_max,
                slope_avg: slope_result.slope_avg,
                slope_histogram: slope_result.slope_histogram,
                slope_segments: slope_result.slope_segments,
            },
        )
        .await
        {
            metrics::observe_slope_recalc("db_error", slope_duration);
            error!(track_id = %track_id, "slope persist failed: {e}");
            let elapsed = enrich_start.elapsed().as_secs_f64();
            metrics::record_track_enrich_status("failed_update_slope");
            metrics::observe_track_enrich_duration("failed_update_slope", elapsed);
            return EnrichmentOutcome::FailedSlope;
        }
        metrics::observe_slope_recalc("success", slope_duration);
    }

    // 4. Record success
    let elapsed = enrich_start.elapsed().as_secs_f64();
    metrics::record_track_enrich_status("success");
    metrics::observe_track_enrich_duration("success", elapsed);

    info!(
        track_id = %track_id,
        gain_m = enrichment_result.metrics.elevation_gain.unwrap_or(0.0),
        loss_m = enrichment_result.metrics.elevation_loss.unwrap_or(0.0),
        "enrichment completed"
    );

    EnrichmentOutcome::Success {
        gain: enrichment_result.metrics.elevation_gain,
        loss: enrichment_result.metrics.elevation_loss,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outcome_variants_are_distinct() {
        let a = EnrichmentOutcome::Success { gain: None, loss: None };
        let b = EnrichmentOutcome::FailedRemote;
        let c = EnrichmentOutcome::FailedUpdateDb;
        let d = EnrichmentOutcome::FailedSlope;

        assert_ne!(a, b);
        assert_ne!(a, c);
        assert_ne!(a, d);
        assert_ne!(b, c);
        assert_ne!(b, d);
        assert_ne!(c, d);
    }

    #[test]
    fn success_preserves_gain_loss() {
        let outcome = EnrichmentOutcome::Success {
            gain: Some(42.0),
            loss: Some(17.0),
        };
        match outcome {
            EnrichmentOutcome::Success { gain, loss } => {
                assert_eq!(gain, Some(42.0_f32));
                assert_eq!(loss, Some(17.0_f32));
            }
            _ => panic!("expected Success"),
        }
    }
}
