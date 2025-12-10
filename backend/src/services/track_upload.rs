use crate::{
    db,
    input_validation::{
        sanitize_input, validate_file_extension, validate_file_size, validate_text_field,
        MAX_CATEGORIES, MAX_CATEGORY_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_FIELD_SIZE,
        MAX_NAME_LENGTH,
    },
    metrics,
    models::{ParsedTrackData, ParsedWaypoint, TrackUploadResponse},
    poi_deduplication::PoiDeduplicationService,
    services::enrichment_queue,
    track_utils::{self, extract_coordinates_from_geojson, parse_gpx_full, parse_gpx_minimal},
};
use axum::http::StatusCode;
use bytes::Bytes;
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Instant;
use tracing::{error, info, warn};
use uuid::Uuid;

pub struct TrackUploadRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub categories: Vec<String>,
    pub session_id: Option<Uuid>,
    pub file_name: String,
    pub file_bytes: Bytes,
}

pub struct TrackUploadService {
    pool: Arc<PgPool>,
}

impl TrackUploadService {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }

    #[tracing::instrument(skip(self, request), fields(endpoint = "upload_track_service", file_name = %request.file_name))]
    pub async fn upload_track(
        &self,
        request: TrackUploadRequest,
    ) -> Result<TrackUploadResponse, StatusCode> {
        let pipeline_start = Instant::now();
        self.validate_request(&request)?;
        validate_file_size(request.file_bytes.len())?;
        let extension = validate_file_extension(&request.file_name)?;

        let parsed_data = self
            .parse_and_check_duplicates(&request.file_bytes, &extension)
            .await?;

        let track_id = Uuid::new_v4();
        let sanitized_name = request
            .name
            .as_ref()
            .map(|n| sanitize_input(n))
            .or_else(|| Some(sanitize_input(&request.file_name)))
            .unwrap_or_else(|| "Unnamed track".to_string());
        let sanitized_description = request.description.as_ref().map(|d| sanitize_input(d));
        let sanitized_categories: Vec<String> = request
            .categories
            .into_iter()
            .map(|c| sanitize_input(&c))
            .collect();
        let category_refs: Vec<&str> = sanitized_categories.iter().map(|c| c.as_str()).collect();

        let elevation_profile_json = parsed_data
            .elevation_profile
            .as_ref()
            .and_then(|profile| serde_json::to_value(profile).ok());
        let hr_data_json = parsed_data
            .hr_data
            .as_ref()
            .and_then(|data| serde_json::to_value(data).ok());
        let time_data_json = parsed_data
            .time_data
            .as_ref()
            .and_then(|data| serde_json::to_value(data).ok());
        let temp_data_json = parsed_data
            .temp_data
            .as_ref()
            .and_then(|data| serde_json::to_value(data).ok());
        let speed_data_json = parsed_data
            .speed_data
            .as_ref()
            .and_then(|data| serde_json::to_value(data).ok());
        let pace_data_json = parsed_data
            .pace_data
            .as_ref()
            .and_then(|data| serde_json::to_value(data).ok());

        db::insert_track(db::InsertTrackParams {
            pool: &self.pool,
            id: track_id,
            name: &sanitized_name,
            description: sanitized_description.clone(),
            categories: &category_refs,
            auto_classifications: &parsed_data.auto_classifications,
            geom_geojson: &parsed_data.geom_geojson,
            length_km: parsed_data.length_km,
            elevation_profile_json,
            hr_data_json,
            temp_data_json,
            time_data_json,
            elevation_gain: parsed_data.elevation_gain,
            elevation_loss: parsed_data.elevation_loss,
            elevation_min: parsed_data.elevation_min,
            elevation_max: parsed_data.elevation_max,
            elevation_enriched: Some(false),
            elevation_enriched_at: None,
            elevation_dataset: Some("original_gpx".to_string()),
            elevation_api_calls: Some(0),
            slope_min: parsed_data.slope_min,
            slope_max: parsed_data.slope_max,
            slope_avg: parsed_data.slope_avg,
            slope_histogram: parsed_data.slope_histogram.clone(),
            slope_segments: parsed_data.slope_segments.clone(),
            avg_speed: parsed_data.avg_speed,
            avg_hr: parsed_data.avg_hr,
            hr_min: parsed_data.hr_min,
            hr_max: parsed_data.hr_max,
            moving_time: parsed_data.moving_time,
            pause_time: parsed_data.pause_time,
            moving_avg_speed: parsed_data.moving_avg_speed,
            moving_avg_pace: parsed_data.moving_avg_pace,
            duration_seconds: parsed_data.duration_seconds,
            hash: &parsed_data.hash,
            recorded_at: parsed_data.recorded_at,
            session_id: request.session_id,
            speed_data_json,
            pace_data_json,
        })
        .await
        .map_err(|e| {
            error!(?e, "[upload_track_service] failed to insert track");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        metrics::observe_track_length_km("anonymous", parsed_data.length_km);
        for category in &sanitized_categories {
            metrics::record_track_category(category);
        }

        self.maybe_start_elevation_enrichment(track_id, &parsed_data)
            .await;
        self.process_waypoints(track_id, parsed_data.waypoints.clone())
            .await;

        metrics::observe_track_pipeline_latency("success", pipeline_start.elapsed().as_secs_f64());

        info!(
            track_id = %track_id,
            length_km = parsed_data.length_km,
            endpoint = "upload_track_service",
            "track persisted"
        );

        Ok(TrackUploadResponse {
            id: track_id,
            url: format!("/tracks/{track_id}"),
        })
    }

    fn validate_request(&self, request: &TrackUploadRequest) -> Result<(), StatusCode> {
        if let Some(name) = &request.name {
            validate_text_field(name, MAX_NAME_LENGTH, "name")?;
        }
        if let Some(description) = &request.description {
            validate_text_field(description, MAX_DESCRIPTION_LENGTH, "description")?;
        }
        validate_text_field(&request.categories.join(","), MAX_FIELD_SIZE, "categories")?;

        if request.categories.len() > MAX_CATEGORIES {
            warn!(
                endpoint = "upload_track_service",
                categories = request.categories.len(),
                max = MAX_CATEGORIES,
                "too many categories"
            );
            return Err(StatusCode::BAD_REQUEST);
        }

        for category in &request.categories {
            validate_text_field(category, MAX_CATEGORY_LENGTH, "category")?;
        }

        Ok(())
    }

    async fn parse_and_check_duplicates(
        &self,
        file_bytes: &Bytes,
        extension: &str,
    ) -> Result<ParsedTrackData, StatusCode> {
        match extension {
            "gpx" => {
                let minimal_start = Instant::now();
                let minimal = parse_gpx_minimal(file_bytes.as_ref()).map_err(|e| {
                    warn!(
                        error = ?e,
                        endpoint = "upload_track_service",
                        stage = "gpx_minimal",
                        "failed to parse gpx"
                    );
                    StatusCode::UNPROCESSABLE_ENTITY
                })?;
                metrics::observe_track_parse_duration(
                    "gpx_minimal",
                    minimal_start.elapsed().as_secs_f64(),
                );

                let dedup_db_start = Instant::now();
                if db::track_exists(&self.pool, &minimal.hash)
                    .await
                    .map_err(|e| {
                        error!(?e, "[upload_track_service] db error on dedup");
                        StatusCode::INTERNAL_SERVER_ERROR
                    })?
                    .is_some()
                {
                    metrics::record_track_deduplicated("gpx_hash_match");
                    warn!(
                        hash = %minimal.hash,
                        endpoint = "upload_track_service",
                        "duplicate track detected by hash"
                    );
                    return Err(StatusCode::CONFLICT);
                }
                let dedup_elapsed = dedup_db_start.elapsed().as_secs_f64();
                metrics::observe_db_query("track_exists", dedup_elapsed);
                if dedup_elapsed > 0.5 {
                    warn!(
                        "[upload_track_service] track_exists DB dedup check took {:.3}s",
                        dedup_elapsed
                    );
                }
                let full_parse_start = Instant::now();
                let parsed = parse_gpx_full(file_bytes.as_ref()).map_err(|e| {
                    warn!(
                        error = ?e,
                        endpoint = "upload_track_service",
                        stage = "gpx_full",
                        "failed to parse gpx"
                    );
                    StatusCode::UNPROCESSABLE_ENTITY
                })?;
                let full_elapsed = full_parse_start.elapsed().as_secs_f64();
                metrics::observe_track_parse_duration("gpx_full", full_elapsed);
                if full_elapsed > 2.0 {
                    warn!(
                        "[upload_track_service] full gpx parse took {:.2}s",
                        full_elapsed
                    );
                }
                Ok(parsed)
            }
            "kml" => {
                let kml_parse_start = Instant::now();
                let parsed = track_utils::parse_kml(file_bytes.as_ref()).map_err(|e| {
                    warn!(
                        error = ?e,
                        endpoint = "upload_track_service",
                        stage = "kml_full",
                        "failed to parse kml"
                    );
                    StatusCode::UNPROCESSABLE_ENTITY
                })?;
                let kml_full_elapsed = kml_parse_start.elapsed().as_secs_f64();
                metrics::observe_track_parse_duration("kml_full", kml_full_elapsed);
                if kml_full_elapsed > 2.0 {
                    warn!(
                        "[upload_track_service] full kml parse took {:.2}s",
                        kml_full_elapsed
                    );
                }

                let dedup_db_start = Instant::now();
                if db::track_exists(&self.pool, &parsed.hash)
                    .await
                    .map_err(|e| {
                        error!(?e, "[upload_track_service] db error on dedup");
                        StatusCode::INTERNAL_SERVER_ERROR
                    })?
                    .is_some()
                {
                    metrics::record_track_deduplicated("kml_hash_match");
                    warn!(
                        hash = %parsed.hash,
                        endpoint = "upload_track_service",
                        "duplicate track detected by hash"
                    );
                    return Err(StatusCode::CONFLICT);
                }
                metrics::observe_db_query("track_exists", dedup_db_start.elapsed().as_secs_f64());

                Ok(parsed)
            }
            _ => {
                warn!(
                    endpoint = "upload_track_service",
                    extension, "unsupported file type"
                );
                Err(StatusCode::BAD_REQUEST)
            }
        }
    }

    async fn maybe_start_elevation_enrichment(
        &self,
        track_id: Uuid,
        parsed_data: &ParsedTrackData,
    ) {
        if !self.track_needs_enrichment(parsed_data) {
            metrics::record_track_enrich_status("skipped_not_needed");
            return;
        }

        let coordinates = match extract_coordinates_from_geojson(&parsed_data.geom_geojson) {
            Ok(coords) if !coords.is_empty() => coords,
            Ok(_) => {
                info!(track_id = %track_id, endpoint = "upload_track_service", "no coordinates for enrichment");
                metrics::record_track_enrich_status("skipped_no_coords");
                return;
            }
            Err(e) => {
                warn!(
                    track_id = %track_id,
                    error = ?e,
                    endpoint = "upload_track_service",
                    "failed to extract coordinates for enrichment"
                );
                metrics::record_track_enrich_status("failed_extract_coords");
                return;
            }
        };

        let job = enrichment_queue::EnrichmentJob {
            track_id,
            coordinates,
        };

        match enrichment_queue::enqueue(job.clone()).await {
            Ok(()) => {
                metrics::record_track_enrich_status("queued");
                return;
            }
            Err(enrichment_queue::EnqueueError::Full) => {
                info!(%track_id, "enrichment queue is full; running inline fallback");
                metrics::record_track_enrich_status("queue_full");
            }
            Err(enrichment_queue::EnqueueError::NotInitialized) => {
                info!(%track_id, "enrichment queue not initialized; running inline fallback");
            }
        }

        enrichment_queue::spawn_immediate_enrichment(Arc::clone(&self.pool), job);
    }

    fn track_needs_enrichment(&self, parsed_data: &ParsedTrackData) -> bool {
        parsed_data.elevation_gain.is_none()
            || parsed_data.elevation_gain == Some(0.0)
            || parsed_data.elevation_loss.is_none()
            || parsed_data.elevation_loss == Some(0.0)
    }

    async fn process_waypoints(&self, track_id: Uuid, waypoints: Vec<ParsedWaypoint>) {
        if waypoints.is_empty() {
            return;
        }

        info!(
            track_id = %track_id,
            waypoints = waypoints.len(),
            endpoint = "upload_track_service",
            "processing waypoints"
        );

        let poi_start = Instant::now();
        if let Err(e) =
            PoiDeduplicationService::link_pois_to_track(&self.pool, track_id, waypoints).await
        {
            error!(track_id = %track_id, error = ?e, endpoint = "upload_track_service", "failed to link POIs");
        }
        let elapsed = poi_start.elapsed().as_secs_f64();
        crate::metrics::observe_poi_link_duration("process_waypoints", elapsed);
        if elapsed > 1.0 {
            warn!(
                track_id = %track_id,
                duration_secs = elapsed,
                endpoint = "upload_track_service",
                "processing POIs took longer than expected"
            );
        }
    }
}
