use crate::{
    db,
    error::{AppError, Result},
    input_validation::{
        MAX_FIELD_SIZE, sanitize_input, validate_file_extension, validate_file_size,
        validate_text_field, validate_track_fields,
    },
    metrics,
    models::{ParsedTrackData, ParsedWaypoint, TrackUploadResponse},
    poi_deduplication,
    services::enrichment_queue,
    track_utils::{self, extract_coordinates_from_geojson, parse_gpx, parse_gpx_minimal},
};
use bytes::Bytes;
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Instant;
use tracing::{error, info, warn};
use uuid::Uuid;

pub struct UploadRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub categories: Vec<String>,
    pub session_id: Option<Uuid>,
    pub file_name: String,
    pub file_bytes: Bytes,
}

/// Resolve the track's display name.
///
/// A supplied name wins. Otherwise fall back to the file name with its
/// extension removed — "KOFA Routes.gpx" becomes "KOFA Routes" — because the
/// name is shown as the track's identity in the UI, not as a file reference.
fn derive_track_name(supplied: Option<&str>, file_name: &str) -> String {
    if let Some(name) = supplied.map(sanitize_input).filter(|n| !n.is_empty()) {
        return name;
    }

    // Only strip the extension when something remains in front of it:
    // ".gpx" is a dotfile with no stem, so rsplit_once yields an empty stem
    // and the whole name is the better answer than nothing at all.
    let stem = match file_name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() && !ext.is_empty() => stem,
        _ => file_name,
    };

    let derived = sanitize_input(stem);
    if derived.is_empty() {
        "Unnamed track".to_string()
    } else {
        derived
    }
}

#[tracing::instrument(skip(pool, request), fields(endpoint = "upload_track_service", file_name = %request.file_name))]
pub async fn upload(pool: &Arc<PgPool>, request: UploadRequest) -> Result<TrackUploadResponse> {
    let pipeline_start = Instant::now();
    validate_request(&request)?;
    validate_file_size(request.file_bytes.len())?;
    let extension = validate_file_extension(&request.file_name)?;

    let parsed_data = parse_and_check_duplicates(pool, &request.file_bytes, &extension).await?;

    let track_id = Uuid::new_v4();
    let sanitized_name = derive_track_name(request.name.as_deref(), &request.file_name);
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
        pool,
        id: track_id,
        name: &sanitized_name,
        description: sanitized_description.clone(),
        categories: &category_refs,
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
        AppError::Internal(e.into())
    })?;

    metrics::observe_track_length_km("anonymous", parsed_data.length_km);
    for category in &sanitized_categories {
        metrics::record_track_category(category);
    }

    maybe_start_elevation_enrichment(pool, track_id, &parsed_data).await;
    process_waypoints(pool, track_id, parsed_data.waypoints.clone()).await;

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

fn validate_request(request: &UploadRequest) -> Result<()> {
    if request.categories.is_empty() {
        warn!(endpoint = "upload_track_service", "no categories selected");
        return Err(AppError::BadRequest("no categories selected".into()));
    }

    validate_text_field(&request.categories.join(","), MAX_FIELD_SIZE, "categories")?;
    validate_track_fields(
        request.name.as_deref(),
        request.description.as_deref(),
        &request.categories,
    )?;

    Ok(())
}

async fn parse_and_check_duplicates(
    pool: &Arc<PgPool>,
    file_bytes: &Bytes,
    extension: &str,
) -> Result<ParsedTrackData> {
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
                AppError::BadRequest("invalid gpx file".into())
            })?;
            metrics::observe_track_parse_duration(
                "gpx_minimal",
                minimal_start.elapsed().as_secs_f64(),
            );

            let dedup_db_start = Instant::now();
            if db::track_exists(pool, &minimal.hash).await?.is_some() {
                metrics::record_track_deduplicated("gpx_hash_match");
                warn!(
                    hash = %minimal.hash,
                    endpoint = "upload_track_service",
                    "duplicate track detected by hash"
                );
                return Err(AppError::Conflict("duplicate track detected".into()));
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
            let parsed = parse_gpx(file_bytes.as_ref()).map_err(|e| {
                warn!(
                    error = ?e,
                    endpoint = "upload_track_service",
                    stage = "gpx_full",
                    "failed to parse gpx"
                );
                AppError::BadRequest("invalid gpx file".into())
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
                AppError::BadRequest("invalid kml file".into())
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
            if db::track_exists(pool, &parsed.hash).await?.is_some() {
                metrics::record_track_deduplicated("kml_hash_match");
                warn!(
                    hash = %parsed.hash,
                    endpoint = "upload_track_service",
                    "duplicate track detected by hash"
                );
                return Err(AppError::Conflict("duplicate track detected".into()));
            }
            metrics::observe_db_query("track_exists", dedup_db_start.elapsed().as_secs_f64());

            Ok(parsed)
        }
        _ => {
            warn!(
                endpoint = "upload_track_service",
                extension, "unsupported file type"
            );
            Err(AppError::BadRequest("unsupported file type".into()))
        }
    }
}

async fn maybe_start_elevation_enrichment(
    pool: &Arc<PgPool>,
    track_id: Uuid,
    parsed_data: &ParsedTrackData,
) {
    if !track_needs_enrichment(parsed_data) {
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

    enrichment_queue::spawn_immediate_enrichment(Arc::clone(pool), job);
}

fn track_needs_enrichment(parsed_data: &ParsedTrackData) -> bool {
    parsed_data.elevation_gain.is_none()
        || parsed_data.elevation_gain == Some(0.0)
        || parsed_data.elevation_loss.is_none()
        || parsed_data.elevation_loss == Some(0.0)
}

async fn process_waypoints(pool: &Arc<PgPool>, track_id: Uuid, waypoints: Vec<ParsedWaypoint>) {
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
    if let Err(e) = poi_deduplication::link_pois_to_track(pool, track_id, waypoints).await {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upload_request_fields_compile() {
        let _req = UploadRequest {
            name: None,
            description: None,
            categories: vec!["hiking".into()],
            session_id: None,
            file_name: "test.gpx".into(),
            file_bytes: Bytes::from_static(b"<gpx></gpx>"),
        };
    }

    #[test]
    fn supplied_name_wins() {
        assert_eq!(
            derive_track_name(Some("Morning Run"), "whatever.gpx"),
            "Morning Run"
        );
    }

    #[test]
    fn falls_back_to_file_name_without_extension() {
        assert_eq!(
            derive_track_name(None, "KOFA Routes Nov 25 2023.gpx"),
            "KOFA Routes Nov 25 2023"
        );
        assert_eq!(derive_track_name(None, "ride.kml"), "ride");
        assert_eq!(derive_track_name(None, "track.geojson"), "track");
    }

    #[test]
    fn empty_or_blank_supplied_name_falls_back() {
        assert_eq!(derive_track_name(Some(""), "fallback.gpx"), "fallback");
        assert_eq!(derive_track_name(Some("   "), "fallback.gpx"), "fallback");
    }

    #[test]
    fn degenerate_file_names_do_not_produce_empty_titles() {
        assert_eq!(derive_track_name(None, ""), "Unnamed track");
        // ".gpx" has no stem, so the whole name is kept rather than
        // collapsing to nothing.
        assert_eq!(derive_track_name(None, ".gpx"), ".gpx");
        assert_eq!(derive_track_name(None, "no-extension"), "no-extension");
    }
}
