use crate::{
    db,
    input_validation::{
        sanitize_input, validate_file_extension, validate_file_size, validate_text_field,
        MAX_CATEGORIES, MAX_CATEGORY_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_FIELD_SIZE,
        MAX_NAME_LENGTH,
    },
    models::{ParsedTrackData, ParsedWaypoint, TrackUploadResponse},
    poi_deduplication::PoiDeduplicationService,
    track_utils::{
        self, extract_coordinates_from_geojson, parse_gpx_full, parse_gpx_minimal,
        ElevationEnrichmentService,
    },
};
use axum::http::StatusCode;
use bytes::Bytes;
use sqlx::PgPool;
use std::sync::Arc;
use tokio::task;
use tracing::{error, info};
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

    pub async fn upload_track(
        &self,
        request: TrackUploadRequest,
    ) -> Result<TrackUploadResponse, StatusCode> {
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

        self.maybe_start_elevation_enrichment(track_id, &parsed_data);
        self.process_waypoints(track_id, parsed_data.waypoints.clone())
            .await;

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
            error!(
                "Too many categories: {} > {}",
                request.categories.len(),
                MAX_CATEGORIES
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
                let minimal = parse_gpx_minimal(file_bytes.as_ref()).map_err(|e| {
                    error!(?e, "[upload_track_service] failed to parse gpx minimally");
                    StatusCode::UNPROCESSABLE_ENTITY
                })?;

                if db::track_exists(&self.pool, &minimal.hash)
                    .await
                    .map_err(|e| {
                        error!(?e, "[upload_track_service] db error on dedup");
                        StatusCode::INTERNAL_SERVER_ERROR
                    })?
                    .is_some()
                {
                    return Err(StatusCode::CONFLICT);
                }

                parse_gpx_full(file_bytes.as_ref()).map_err(|e| {
                    error!(?e, "[upload_track_service] failed to parse gpx fully");
                    StatusCode::UNPROCESSABLE_ENTITY
                })
            }
            "kml" => {
                let parsed = track_utils::parse_kml(file_bytes.as_ref()).map_err(|e| {
                    error!(?e, "[upload_track_service] failed to parse kml");
                    StatusCode::UNPROCESSABLE_ENTITY
                })?;

                if db::track_exists(&self.pool, &parsed.hash)
                    .await
                    .map_err(|e| {
                        error!(?e, "[upload_track_service] db error on dedup");
                        StatusCode::INTERNAL_SERVER_ERROR
                    })?
                    .is_some()
                {
                    return Err(StatusCode::CONFLICT);
                }

                Ok(parsed)
            }
            _ => {
                error!(
                    "[upload_track_service] unsupported file type: {}",
                    extension
                );
                Err(StatusCode::BAD_REQUEST)
            }
        }
    }

    fn maybe_start_elevation_enrichment(&self, track_id: Uuid, parsed_data: &ParsedTrackData) {
        if !self.track_needs_enrichment(parsed_data) {
            return;
        }

        let coordinates = match extract_coordinates_from_geojson(&parsed_data.geom_geojson) {
            Ok(coords) if !coords.is_empty() => coords,
            Ok(_) => {
                info!(%track_id, "[upload_track_service] no coordinates for enrichment");
                return;
            }
            Err(e) => {
                error!(
                    "[upload_track_service] failed to extract coordinates for enrichment: {}",
                    e
                );
                return;
            }
        };

        let pool = Arc::clone(&self.pool);
        task::spawn(async move {
            let enrichment_service = ElevationEnrichmentService::new();
            match enrichment_service
                .enrich_track_elevation(coordinates.clone())
                .await
            {
                Ok(result) => {
                    if let Err(e) = db::update_track_elevation(
                        &pool,
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
                    {
                        error!(?track_id, "Failed to update enriched elevation data: {}", e);
                        return;
                    }

                    if let Some(profile) = result.elevation_profile {
                        use crate::track_utils::slope::recalculate_slope_metrics;

                        let slope_result = recalculate_slope_metrics(
                            &coordinates,
                            &profile,
                            &format!("Track {}", track_id),
                        );

                        if let Err(e) = db::update_track_slope(
                            &pool,
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
                            error!(?track_id, "Failed to update slope data: {}", e);
                        }
                    }
                }
                Err(e) => {
                    error!(?track_id, "Failed to auto-enrich track elevation: {}", e);
                }
            }
        });
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
            ?track_id,
            "[upload_track_service] Processing {} waypoints",
            waypoints.len()
        );

        if let Err(e) =
            PoiDeduplicationService::link_pois_to_track(&self.pool, track_id, waypoints).await
        {
            error!(?track_id, ?e, "[upload_track_service] Failed to link POIs");
        }
    }
}
