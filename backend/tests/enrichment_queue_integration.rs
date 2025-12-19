use backend::services::enrichment_queue::{start_queue_for_tests, EnqueueError, EnrichmentJob};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};
use uuid::Uuid;

#[tokio::test]
async fn processes_jobs_across_batches() {
    let processed = Arc::new(Mutex::new(Vec::<Uuid>::new()));
    let queue = start_queue_for_tests(2, {
        let processed = processed.clone();
        move |job: EnrichmentJob| {
            let processed = processed.clone();
            async move {
                processed.lock().await.push(job.track_id);
            }
        }
    });

    let ids: Vec<Uuid> = (0..3).map(|_| Uuid::new_v4()).collect();
    for id in &ids {
        queue
            .enqueue(EnrichmentJob {
                track_id: *id,
                coordinates: vec![(0.0, 0.0)],
            })
            .await
            .unwrap();
    }

    sleep(Duration::from_millis(60)).await;

    let stored = processed.lock().await.clone();
    assert_eq!(stored, ids);
}

#[tokio::test]
async fn fails_when_queue_is_full() {
    let queue = start_queue_for_tests(1, |_job| async move {
        sleep(Duration::from_millis(30)).await;
    });

    queue
        .enqueue(EnrichmentJob {
            track_id: Uuid::new_v4(),
            coordinates: vec![(0.0, 0.0)],
        })
        .await
        .unwrap();

    let second = queue
        .try_enqueue(EnrichmentJob {
            track_id: Uuid::new_v4(),
            coordinates: vec![(1.0, 1.0)],
        })
        .await;

    assert_eq!(second, Err(EnqueueError::Full));
}
