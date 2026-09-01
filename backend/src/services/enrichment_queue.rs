use crate::metrics;
use once_cell::sync::OnceCell;
use sqlx::PgPool;
use std::future::Future;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::sync::mpsc::error::TrySendError;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tokio::time::{Duration, timeout};
use tracing::{debug, error, info};
use uuid::Uuid;

const ENQUEUE_GRACE_MS: u64 = 20;

static ENRICHMENT_QUEUE: OnceCell<EnrichmentQueue> = OnceCell::new();

#[derive(Clone, Debug)]
pub struct EnrichmentJob {
    pub track_id: Uuid,
    pub coordinates: Vec<(f64, f64)>,
}

struct QueuedJob {
    job: EnrichmentJob,
    _permit: OwnedSemaphorePermit,
}

#[derive(Clone)]
pub struct EnrichmentQueue {
    sender: mpsc::Sender<QueuedJob>,
    permits: Arc<Semaphore>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum EnqueueError {
    NotInitialized,
    Full,
}

impl EnrichmentQueue {
    async fn enqueue_with_grace(
        &self,
        job: EnrichmentJob,
        grace: Duration,
    ) -> Result<(), EnqueueError> {
        let permit = match self.permits.clone().try_acquire_owned() {
            Ok(permit) => permit,
            Err(_) => {
                if grace.is_zero() {
                    return Err(EnqueueError::Full);
                }

                match timeout(grace, self.permits.clone().acquire_owned()).await {
                    Ok(Ok(permit)) => permit,
                    Ok(Err(_)) => return Err(EnqueueError::NotInitialized),
                    Err(_) => return Err(EnqueueError::Full),
                }
            }
        };

        let queued = QueuedJob {
            job,
            _permit: permit,
        };

        match self.sender.try_send(queued) {
            Ok(()) => Ok(()),
            Err(TrySendError::Closed(queued)) => {
                drop(queued);
                Err(EnqueueError::NotInitialized)
            }
            Err(TrySendError::Full(queued)) => {
                if grace.is_zero() {
                    return Err(EnqueueError::Full);
                }

                match timeout(grace, self.sender.send(queued)).await {
                    Ok(Ok(())) => Ok(()),
                    Ok(Err(_)) => Err(EnqueueError::NotInitialized),
                    Err(_) => Err(EnqueueError::Full),
                }
            }
        }
    }

    pub async fn enqueue(&self, job: EnrichmentJob) -> Result<(), EnqueueError> {
        self.enqueue_with_grace(job, Duration::from_millis(ENQUEUE_GRACE_MS))
            .await
    }

    pub async fn try_enqueue(&self, job: EnrichmentJob) -> Result<(), EnqueueError> {
        self.enqueue_with_grace(job, Duration::from_millis(0)).await
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

pub async fn enqueue(job: EnrichmentJob) -> Result<(), EnqueueError> {
    ENRICHMENT_QUEUE
        .get()
        .cloned()
        .ok_or(EnqueueError::NotInitialized)?
        .enqueue(job)
        .await
}

pub async fn try_enqueue(job: EnrichmentJob) -> Result<(), EnqueueError> {
    ENRICHMENT_QUEUE
        .get()
        .cloned()
        .ok_or(EnqueueError::NotInitialized)?
        .try_enqueue(job)
        .await
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
    let permits = Arc::new(Semaphore::new(capacity));
    let (sender, mut receiver) = mpsc::channel::<QueuedJob>(capacity);
    let processor = Arc::new(processor);

    tokio::spawn(async move {
        while let Some(QueuedJob { job, _permit }) = receiver.recv().await {
            (processor)(job).await;
        }
    });

    EnrichmentQueue { sender, permits }
}

async fn run_enrichment_job(pool: Arc<PgPool>, job: EnrichmentJob) {
    let _task_guard = metrics::BackgroundTaskGuard::new();
    debug!(track_id = %job.track_id, endpoint = "enrichment_queue", "starting enrichment job");

    let outcome = super::enrichment::run_enrichment(&pool, job.track_id, job.coordinates).await;

    match &outcome {
        super::enrichment::EnrichmentOutcome::Success { gain, loss } => {
            info!(
                track_id = %job.track_id,
                gain_m = gain.unwrap_or(0.0),
                loss_m = loss.unwrap_or(0.0),
                endpoint = "enrichment_queue",
                "enrichment job completed"
            );
        }
        super::enrichment::EnrichmentOutcome::FailedRemote => {
            error!(?job.track_id, "elevation API failed");
        }
        super::enrichment::EnrichmentOutcome::FailedUpdateDb => {
            error!(?job.track_id, "failed to persist enrichment");
        }
        super::enrichment::EnrichmentOutcome::FailedSlope => {
            error!(?job.track_id, "slope update failed (elevation saved)");
        }
    }
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
    use tokio::time::{Duration, sleep};

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
            .await
            .unwrap();
        queue
            .enqueue(EnrichmentJob {
                track_id: second,
                coordinates: vec![(1.0, 1.0)],
            })
            .await
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
            .await
            .unwrap();

        let result = queue
            .try_enqueue(EnrichmentJob {
                track_id: Uuid::new_v4(),
                coordinates: vec![(1.0, 1.0)],
            })
            .await;

        assert_eq!(result, Err(EnqueueError::Full));
    }
}
