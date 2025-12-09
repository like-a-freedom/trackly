use crate::{
    db, metrics,
    track_utils::{
        elevation_enrichment::EnrichmentResult, slope::recalculate_slope_metrics,
        ElevationEnrichmentService,
    },
};
use once_cell::sync::OnceCell;
use sqlx::PgPool;
use std::future::Future;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::mpsc;
use tokio::sync::mpsc::error::TrySendError;
use tracing::{error, info};
use uuid::Uuid;

static ENRICHMENT_QUEUE: OnceCell<EnrichmentQueue> = OnceCell::new();

#[derive(Clone, Debug)]
pub struct EnrichmentJob {
    pub track_id: Uuid,
    pub coordinates: Vec<(f64, f64)>,
}

#[derive(Clone)]
pub struct EnrichmentQueue {
    sender: mpsc::Sender<EnrichmentJob>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum EnqueueError {
    NotInitialized,
    Full,
}

#[derive(Debug)]
enum PersistError {
    Elevation(sqlx::Error),
    Slope(sqlx::Error),
}

impl EnrichmentQueue {
    pub fn enqueue(&self, job: EnrichmentJob) -> Result<(), EnqueueError> {
        self.sender.try_send(job).map_err(|err| match err {
            TrySendError::Full(_) => EnqueueError::Full,
            TrySendError::Closed(_) => EnqueueError::NotInitialized,
        })
    }
}

pub fn init_enrichment_queue(pool: Arc<PgPool>) {
    let capacity = std::env::var("ENRICHMENT_QUEUE_CAPACITY")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(128);

    let handle = start_queue(capacity, move |job| {
        let pool = Arc::clone(&pool);
        async move {
            run_enrichment_job(pool, job).await;
        }
    });

    if ENRICHMENT_QUEUE.set(handle).is_err() {
        info!("enrichment queue already initialized, skipping re-init");
    } else {
        info!(capacity, "enrichment queue initialized");
    }
}

pub fn enqueue(job: EnrichmentJob) -> Result<(), EnqueueError> {
    ENRICHMENT_QUEUE
        .get()
        .cloned()
        .ok_or(EnqueueError::NotInitialized)?
        .enqueue(job)
}

pub fn spawn_immediate_enrichment(pool: Arc<PgPool>, job: EnrichmentJob) {
    tokio::spawn(async move {
        run_enrichment_job(pool, job).await;
    });
}

fn start_queue<F, Fut>(capacity: usize, processor: F) -> EnrichmentQueue
where
    F: Fn(EnrichmentJob) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    let (sender, mut receiver) = mpsc::channel::<EnrichmentJob>(capacity);
    let processor = Arc::new(processor);

    tokio::spawn(async move {
        while let Some(job) = receiver.recv().await {
            (processor)(job).await;
        }
    });

    EnrichmentQueue { sender }
}

async fn run_enrichment_job(pool: Arc<PgPool>, job: EnrichmentJob) {
    let _task_guard = metrics::BackgroundTaskGuard::new();
    let enrich_start = Instant::now();
    let coordinates = job.coordinates;
    let enrichment_service = ElevationEnrichmentService::new().with_pool(Arc::clone(&pool));

    match enrichment_service
        .enrich_track_elevation(coordinates.clone())
        .await
    {
        Ok(result) => {
            match persist_enrichment_result(&pool, job.track_id, &coordinates, &result).await {
                Ok(()) => {
                    metrics::record_track_enrich_status("success");
                    metrics::observe_track_enrich_duration(
                        "success",
                        enrich_start.elapsed().as_secs_f64(),
                    );
                }
                Err(PersistError::Elevation(e)) => {
                    error!(?job.track_id, "Failed to persist enrichment result: {e}");
                    metrics::record_track_enrich_status("failed_update_db");
                    metrics::observe_track_enrich_duration(
                        "failed_update_db",
                        enrich_start.elapsed().as_secs_f64(),
                    );
                }
                Err(PersistError::Slope(e)) => {
                    error!(?job.track_id, "Failed to update slope data: {e}");
                    metrics::record_track_enrich_status("failed_update_slope");
                    metrics::observe_track_enrich_duration(
                        "failed_update_slope",
                        enrich_start.elapsed().as_secs_f64(),
                    );
                }
            }
        }
        Err(e) => {
            error!(?job.track_id, "Failed to auto-enrich track elevation: {e}");
            metrics::record_track_enrich_status("failed_remote");
            metrics::observe_track_enrich_duration(
                "failed_remote",
                enrich_start.elapsed().as_secs_f64(),
            );
        }
    }
}

async fn persist_enrichment_result(
    pool: &Arc<PgPool>,
    track_id: Uuid,
    coordinates: &[(f64, f64)],
    result: &EnrichmentResult,
) -> Result<(), PersistError> {
    db::update_track_elevation(
        pool,
        track_id,
        db::UpdateElevationParams {
            elevation_gain: result.metrics.elevation_gain,
            elevation_loss: result.metrics.elevation_loss,
            elevation_min: result.metrics.elevation_min,
            elevation_max: result.metrics.elevation_max,
            elevation_enriched: true,
            elevation_enriched_at: Some(result.enriched_at.naive_utc()),
            elevation_dataset: Some(result.dataset.clone()),
            elevation_profile: result.elevation_profile.clone(),
            elevation_api_calls: result.api_calls_used,
        },
    )
    .await
    .map_err(PersistError::Elevation)?;

    if let Some(profile) = &result.elevation_profile {
        let slope_start = Instant::now();
        let slope_result =
            recalculate_slope_metrics(coordinates, profile, &format!("Track {track_id}"));
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
            return Err(PersistError::Slope(e));
        } else {
            metrics::observe_slope_recalc("success", slope_duration);
        }
    }

    Ok(())
}

#[allow(dead_code)]
pub fn start_queue_for_tests<F, Fut>(capacity: usize, processor: F) -> EnrichmentQueue
where
    F: Fn(EnrichmentJob) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    start_queue(capacity, processor)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tokio::time::{sleep, Duration};

    #[tokio::test]
    async fn queue_processes_jobs_in_order() {
        let processed = Arc::new(Mutex::new(Vec::<Uuid>::new()));
        let queue = start_queue_for_tests(4, {
            let processed = processed.clone();
            move |job: EnrichmentJob| {
                let processed = processed.clone();
                async move {
                    processed.lock().await.push(job.track_id);
                }
            }
        });

        let first = Uuid::new_v4();
        let second = Uuid::new_v4();

        queue
            .enqueue(EnrichmentJob {
                track_id: first,
                coordinates: vec![(0.0, 0.0)],
            })
            .unwrap();
        queue
            .enqueue(EnrichmentJob {
                track_id: second,
                coordinates: vec![(1.0, 1.0)],
            })
            .unwrap();

        sleep(Duration::from_millis(50)).await;

        let items = processed.lock().await.clone();
        assert_eq!(items, vec![first, second]);
    }

    #[tokio::test]
    async fn queue_respects_capacity() {
        let queue = start_queue_for_tests(1, |_job| async move {});
        queue
            .enqueue(EnrichmentJob {
                track_id: Uuid::new_v4(),
                coordinates: vec![(0.0, 0.0)],
            })
            .unwrap();

        let result = queue.enqueue(EnrichmentJob {
            track_id: Uuid::new_v4(),
            coordinates: vec![(1.0, 1.0)],
        });

        assert_eq!(result, Err(EnqueueError::Full));
    }
}
