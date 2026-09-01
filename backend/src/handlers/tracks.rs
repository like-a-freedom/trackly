use crate::auth::OptionalAuthUser;
use crate::db;
use crate::error::{AppError, Result};
use crate::handlers::rate_limit::{
    export_rate_limit_seconds, last_export_attempt, record_session_export_attempt,
    record_session_upload_attempt,
};
use crate::handlers::util::{check_track_ownership, handle_db_error};
use crate::input_validation::{
    MAX_CATEGORIES, MAX_CATEGORY_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_FIELD_SIZE, MAX_NAME_LENGTH,
    validate_file_size, validate_text_field,
};
use crate::metrics;
use crate::models::*;
use crate::services::gpx_export::GpxExportService;
use crate::services::track_upload::{TrackUploadRequest, TrackUploadService};
use crate::track_utils::{
    ElevationEnrichmentService, calculate_file_hash, extract_coordinates_from_geojson,
    extract_segments_from_geojson, geojson_from_segments, simplify_segments_to_ratio,
};
use axum::http::header::REFERER;
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use axum_extra::extract::multipart::Multipart as AxumMultipart;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Instant;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

const MAX_SIMPLIFY_POINTS: usize = 100_000;

pub async fn check_track_exist(
    State(pool): State<Arc<PgPool>>,
    mut multipart: AxumMultipart,
) -> Result<Json<TrackExistResponse>> {
    let mut file_bytes = None;
    let mut file_name = None;
    // Gracefully handle multipart errors: if any error occurs, treat as no file provided
    while let Some(field_result) = multipart.next_field().await.transpose() {
        let field = match field_result {
            Ok(f) => f,
            Err(_) => {
                // Malformed multipart, treat as no file
                return Ok(Json(TrackExistResponse {
                    is_exist: false,
                    id: None,
                }));
            }
        };
        if let Some("file") = field.name() {
            file_name = field.file_name().map(|s| s.to_string());
            file_bytes = match field.bytes().await {
                Ok(bytes) => Some(bytes),
                Err(_) => {
                    // Malformed file part, treat as no file
                    return Ok(Json(TrackExistResponse {
                        is_exist: false,
                        id: None,
                    }));
                }
            };
        }
    }
    let file_bytes = match file_bytes {
        Some(b) => b,
        None => {
            return Ok(Json(TrackExistResponse {
                is_exist: false,
                id: None,
            }));
        }
    };
    let _file_name = match file_name {
        Some(f) => f,
        None => {
            return Ok(Json(TrackExistResponse {
                is_exist: false,
                id: None,
            }));
        }
    };
    // Fast hash calculation without full parsing
    // This is much faster for large files (27MB GPX with 94k points: <1s vs 26s)
    let hash = calculate_file_hash(&file_bytes);

    let id = db::track_exists(&pool, &hash)
        .await
        .map_err(handle_db_error)?;
    if let Some(id) = id {
        Ok(Json(TrackExistResponse {
            is_exist: true,
            id: Some(id),
        }))
    } else {
        Ok(Json(TrackExistResponse {
            is_exist: false,
            id: None,
        }))
    }
}

fn normalize_session_id(raw: &str) -> Result<(Uuid, String)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        warn!(
            reason = "empty_session_id",
            "session_id field is empty after trimming"
        );
        return Err(AppError::BadRequest("invalid request".into()));
    }

    match Uuid::parse_str(trimmed) {
        Ok(uuid) => Ok((uuid, trimmed.to_string())),
        Err(e) => {
            warn!(reason = "invalid_session_id", session_id = %trimmed, error = ?e, "failed to parse session_id");
            Err(AppError::BadRequest("invalid session_id".into()))
        }
    }
}

fn parse_session_header(headers: &HeaderMap) -> Option<Uuid> {
    headers
        .get("x-session-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| Uuid::parse_str(v.trim()).ok())
}

fn derive_referrer(headers: &HeaderMap) -> &'static str {
    headers
        .get(REFERER)
        .and_then(|v| v.to_str().ok())
        .map(|v| {
            if v.contains("/tracks/search") {
                "search"
            } else {
                "direct"
            }
        })
        .unwrap_or("direct")
}

fn classify_ownership(track_session: Option<Uuid>, request_session: Option<Uuid>) -> &'static str {
    match (track_session, request_session) {
        (Some(owner), Some(requester)) if owner == requester => "own",
        (Some(_), _) => "public",
        _ => "unknown",
    }
}

fn detect_search_query_type(query: &str) -> &'static str {
    let lower = query.to_lowercase();
    if lower.contains("#") {
        "meta"
    } else if lower.contains(',') || lower.contains("lat") || lower.contains("lon") {
        "location"
    } else {
        "name"
    }
}

pub async fn upload_track(
    State(pool): State<Arc<PgPool>>,
    mut multipart: AxumMultipart,
) -> Result<Json<TrackUploadResponse>> {
    info!(endpoint = "upload_track", "request received");
    let mut name = None;
    let mut description = None;
    let mut categories = Vec::new();
    let mut session_id = None;
    let mut file_bytes = None;
    let mut file_name = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        warn!(error = ?e, "multipart read failed");
        AppError::from(StatusCode::INTERNAL_SERVER_ERROR)
    })? {
        debug!(field_name = ?field.name(), "upload_track: received multipart field");
        if let Some(field_name) = field.name() {
            match field_name {
                "name" => {
                    let name_text = field.text().await.map_err(|e| {
                        warn!(error = ?e, field = "name", "failed to read text field");
                        AppError::from(StatusCode::BAD_REQUEST)
                    })?;
                    validate_text_field(&name_text, MAX_NAME_LENGTH, "name")?;
                    name = Some(name_text);
                }
                "description" => {
                    let desc_text = field.text().await.map_err(|e| {
                        warn!(error = ?e, field = "description", "failed to read text field");
                        AppError::from(StatusCode::BAD_REQUEST)
                    })?;
                    validate_text_field(&desc_text, MAX_DESCRIPTION_LENGTH, "description")?;
                    description = Some(desc_text);
                }
                "categories" => {
                    let cats = field.text().await.map_err(|e| {
                        warn!(error = ?e, field = "categories", "failed to read text field");
                        AppError::from(StatusCode::BAD_REQUEST)
                    })?;
                    validate_text_field(&cats, MAX_FIELD_SIZE, "categories")?;
                    // filter out empty segments like "" in case of trailing commas
                    categories = cats
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                    if categories.is_empty() {
                        warn!(
                            reason = "no_categories",
                            "upload_track request without categories"
                        );
                        metrics::record_track_upload_failure("validation");
                        return Err(AppError::BadRequest("invalid request".into()));
                    }
                    if categories.len() > MAX_CATEGORIES {
                        warn!(
                            categories = categories.len(),
                            max = MAX_CATEGORIES,
                            "too many categories"
                        );
                        return Err(AppError::BadRequest("invalid request".into()));
                    }
                    for cat in &categories {
                        validate_text_field(cat, MAX_CATEGORY_LENGTH, "category")?;
                    }
                }
                "session_id" => {
                    let sid_raw = field.text().await.map_err(|e| {
                        warn!(error = ?e, field = "session_id", "failed to read text field");
                        AppError::from(StatusCode::BAD_REQUEST)
                    })?;
                    let (parsed_session_id, normalized_session) = normalize_session_id(&sid_raw)?;
                    session_id = Some(parsed_session_id);
                    // --- Rate limiting check ---
                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_secs();
                    record_session_upload_attempt(&normalized_session, now).inspect_err(
                        |&status| {
                            if status == StatusCode::TOO_MANY_REQUESTS {
                                metrics::record_track_upload_failure("rate_limit");
                            }
                        },
                    )?;
                    // --- End rate limiting ---
                }
                "file" => {
                    file_name = field.file_name().map(|s| s.to_string());
                    let bytes = field.bytes().await.map_err(|e| {
                        warn!(error = ?e, field = "file", "failed to read file bytes");
                        metrics::record_track_upload_failure("read_error");
                        AppError::from(StatusCode::PAYLOAD_TOO_LARGE)
                    })?;

                    validate_file_size(bytes.len())?;
                    file_bytes = Some(bytes);
                }
                _ => {}
            }
        }
    }

    let file_bytes = match file_bytes {
        Some(b) => b,
        None => {
            warn!(reason = "missing_file", "upload_track request without file");
            metrics::record_track_upload_failure("validation");
            return Err(AppError::BadRequest("invalid request".into()));
        }
    };
    let file_name = match file_name {
        Some(f) => f,
        None => {
            warn!(
                reason = "missing_file_name",
                "upload_track request missing file name"
            );
            metrics::record_track_upload_failure("validation");
            return Err(AppError::BadRequest("invalid request".into()));
        }
    };

    if let Some(ref n) = name {
        validate_text_field(n, MAX_NAME_LENGTH, "name")?;
    }
    if let Some(ref d) = description {
        validate_text_field(d, MAX_DESCRIPTION_LENGTH, "description")?;
    }
    if categories.is_empty() {
        error!("No categories provided");
        metrics::record_track_upload_failure("validation");
        return Err(AppError::BadRequest("invalid request".into()));
    }
    if categories.len() > MAX_CATEGORIES {
        error!(
            "Too many categories: {} > {}",
            categories.len(),
            MAX_CATEGORIES
        );
        return Err(AppError::BadRequest("invalid request".into()));
    }
    for cat in &categories {
        validate_text_field(cat, MAX_CATEGORY_LENGTH, "category")?;
    }

    let service = TrackUploadService::new(Arc::clone(&pool));
    let request = TrackUploadRequest {
        name,
        description,
        categories,
        session_id,
        file_name,
        file_bytes,
    };

    let response = service.upload_track(request).await?;
    metrics::record_track_uploaded("anonymous");
    metrics::record_session_activity(session_id, "upload");
    info!(endpoint = "upload_track", track_id = %response.id, "track uploaded");
    Ok(Json(response))
}

pub async fn list_tracks_geojson(
    State(pool): State<Arc<PgPool>>,
    auth_user: OptionalAuthUser,
    Query(mut params): Query<TrackGeoJsonQuery>,
) -> Result<Json<TrackGeoJsonCollection>> {
    // Inject user_id from auth context if authenticated
    if let Some(user) = auth_user.user() {
        params.owner_user_id = Some(user.user_id);
    }

    let geojson = db::list_tracks_geojson(
        &pool,
        params.bbox.as_deref(),
        params.zoom,
        params.mode.as_deref(),
        &params,
    )
    .await
    .map_err(handle_db_error)?;
    Ok(Json(geojson))
}

pub async fn list_tracks_heatmap(
    State(pool): State<Arc<PgPool>>,
    auth_user: OptionalAuthUser,
    Query(mut params): Query<TrackGeoJsonQuery>,
) -> Result<Json<TrackHeatmapResponse>> {
    if let Some(user) = auth_user.user() {
        params.owner_user_id = Some(user.user_id);
    }

    let points = db::list_tracks_heatmap(&pool, params.bbox.as_deref(), params.zoom, &params)
        .await
        .map_err(handle_db_error)?;

    Ok(Json(TrackHeatmapResponse { points }))
}

pub async fn get_track(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    Query(params): Query<TrackSimplificationQuery>,
    headers: HeaderMap,
) -> Result<Json<TrackDetail>> {
    debug!(track_id = %id, zoom = ?params.zoom, mode = ?params.mode, endpoint = "get_track", "request received");

    // Use adaptive track detail if zoom/mode params are provided
    let result = if params.zoom.is_some() || params.mode.is_some() {
        db::get_track_detail_adaptive(&pool, id, params.zoom, params.mode.as_deref()).await
    } else {
        db::get_track_detail(&pool, id).await
    };

    let session_id = parse_session_header(&headers);
    match result {
        Ok(Some(track)) => {
            let ownership = classify_ownership(track.session_id, session_id);
            let referrer = derive_referrer(&headers);
            metrics::record_track_view(ownership, referrer);
            metrics::record_session_activity(session_id, "view");
            Ok(Json(track))
        }
        Ok(None) => {
            debug!(track_id = %id, endpoint = "get_track", "track not found");
            Err(AppError::NotFound)
        }
        Err(e) => {
            error!(error = ?e, endpoint = "get_track", "db error");
            Err(AppError::Internal(anyhow::anyhow!("internal error")))
        }
    }
}

pub async fn get_track_simplified(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    Query(params): Query<TrackSimplificationQuery>,
    headers: HeaderMap,
) -> Result<Json<TrackSimplified>> {
    debug!(track_id = %id, zoom = ?params.zoom, mode = ?params.mode, endpoint = "get_track_simplified", "request received");

    match db::get_track_detail_adaptive(&pool, id, params.zoom, params.mode.as_deref()).await {
        Ok(Some(track)) => {
            let session_id = parse_session_header(&headers);
            let ownership = classify_ownership(track.session_id, session_id);
            let referrer = derive_referrer(&headers);
            metrics::record_track_view(ownership, referrer);
            metrics::record_session_activity(session_id, "view");
            // Convert TrackDetail to TrackSimplified
            let simplified = TrackSimplified {
                id: track.id,
                name: track.name,
                description: track.description,
                categories: track.categories,
                distance_markers_enabled: track.distance_markers_enabled,
                geom_geojson: track.geom_geojson,
                segment_meta: track.segment_meta,
                segment_gaps: track.segment_gaps,
                pause_gaps: track.pause_gaps,
                length_km: track.length_km,
                elevation_profile: track.elevation_profile,
                hr_data: track.hr_data,
                temp_data: track.temp_data,
                time_data: track.time_data,
                elevation_gain: track.elevation_gain,
                elevation_loss: track.elevation_loss,
                elevation_min: track.elevation_min,
                elevation_max: track.elevation_max,
                elevation_enriched: track.elevation_enriched,
                elevation_enriched_at: track.elevation_enriched_at,
                elevation_dataset: track.elevation_dataset,
                // Slope fields
                slope_min: track.slope_min,
                slope_max: track.slope_max,
                slope_avg: track.slope_avg,
                slope_histogram: track.slope_histogram,
                slope_segments: track.slope_segments,
                avg_speed: track.avg_speed,
                avg_hr: track.avg_hr,
                hr_min: track.hr_min,
                hr_max: track.hr_max,
                moving_time: track.moving_time,
                pause_time: track.pause_time,
                moving_avg_speed: track.moving_avg_speed,
                moving_avg_pace: track.moving_avg_pace,
                duration_seconds: track.duration_seconds,
                recorded_at: track.recorded_at,
                created_at: track.created_at,
                updated_at: track.updated_at,
                session_id: track.session_id,
                auto_classifications: track.auto_classifications,
                speed_data: track.speed_data,
                pace_data: track.pace_data,
            };

            tracing::info!(
                track_id = %id,
                zoom = params.zoom.unwrap_or(15.0),
                mode = params.mode.as_deref().unwrap_or("detail"),
                endpoint = "get_track_simplified",
                event = "adaptation_complete",
                "adaptive optimization finished"
            );

            Ok(Json(simplified))
        }
        Ok(None) => {
            debug!(track_id = %id, endpoint = "get_track_simplified", "track not found");
            Err(AppError::NotFound)
        }
        Err(e) => {
            error!(error = ?e, endpoint = "get_track_simplified", "db error");
            Err(AppError::Internal(anyhow::anyhow!("internal error")))
        }
    }
}

/// POST /api/tracks/simplify-preview — Simplify editor geometry for optimizer preview.
pub async fn simplify_track_preview(
    Json(request): Json<TrackSimplifyPreviewRequest>,
) -> Result<Json<TrackSimplifyPreviewResponse>> {
    if !(0.0..=1.0).contains(&request.target_ratio) {
        return Err(AppError::BadRequest("invalid request".into()));
    }

    let segments = extract_segments_from_geojson(&request.geometry)?;

    if segments.is_empty() {
        return Err(AppError::BadRequest("invalid request".into()));
    }

    let total_points: usize = segments.iter().map(|s| s.len()).sum();
    if !(2..=MAX_SIMPLIFY_POINTS).contains(&total_points) {
        return Err(AppError::BadRequest("invalid request".into()));
    }

    let waypoint_ref = if request.waypoints.len() == segments.len() {
        Some(request.waypoints.as_slice())
    } else {
        None
    };

    let (simplified_segments, simplified_waypoints, stats) =
        simplify_segments_to_ratio(&segments, waypoint_ref, request.target_ratio);

    let geometry = geojson_from_segments(&simplified_segments);

    Ok(Json(TrackSimplifyPreviewResponse {
        geometry,
        waypoints: simplified_waypoints,
        original_points: stats.original_points,
        simplified_points: stats.simplified_points,
        compression_ratio: stats.compression_ratio,
        tolerance_used: stats.tolerance_used,
    }))
}

pub async fn update_track_description(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    auth_user: OptionalAuthUser,
    Json(payload): Json<UpdateTrackDescriptionRequest>,
) -> Result<StatusCode> {
    // Check that track exists
    let track = db::get_track_detail(&pool, id)
        .await
        .map_err(handle_db_error)?;
    let track = match track {
        Some(t) => t,
        None => return Err(AppError::NotFound),
    };

    // Check ownership (user_id for authenticated users, session_id for anonymous)
    check_track_ownership(
        track.user_id,
        track.session_id,
        &auth_user,
        Some(payload.session_id),
    )?;

    db::update_track_description(&pool, id, &payload.description).await?;
    metrics::record_track_edit("description");
    metrics::record_session_activity(Some(payload.session_id), "edit");
    Ok(StatusCode::NO_CONTENT)
}

pub async fn update_track_name(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    auth_user: OptionalAuthUser,
    Json(payload): Json<UpdateTrackNameRequest>,
) -> Result<StatusCode> {
    // Validate name length (1-255 characters)
    if payload.name.trim().is_empty() || payload.name.len() > 255 {
        return Err(AppError::BadRequest("invalid request".into()));
    }

    // Check that track exists
    let track = db::get_track_detail(&pool, id).await?;
    let track = match track {
        Some(t) => t,
        None => return Err(AppError::NotFound),
    };

    // Check ownership (user_id for authenticated users, session_id for anonymous)
    check_track_ownership(
        track.user_id,
        track.session_id,
        &auth_user,
        Some(payload.session_id),
    )?;

    db::update_track_name(&pool, id, payload.name.trim()).await?;
    metrics::record_track_edit("name");
    metrics::record_session_activity(Some(payload.session_id), "edit");
    Ok(StatusCode::NO_CONTENT)
}

pub async fn update_track_categories(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    auth_user: OptionalAuthUser,
    Json(payload): Json<UpdateTrackCategoriesRequest>,
) -> Result<StatusCode> {
    // Check that track exists
    let track = db::get_track_detail(&pool, id).await?;
    let track = match track {
        Some(t) => t,
        None => return Err(AppError::NotFound),
    };

    // Check ownership (user_id for authenticated users, session_id for anonymous)
    check_track_ownership(
        track.user_id,
        track.session_id,
        &auth_user,
        Some(payload.session_id),
    )?;

    // Build sanitized new categories list
    let categories: Vec<String> = payload
        .categories
        .iter()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .collect();

    // Require at least one category (same rule as upload)
    if categories.is_empty() {
        return Err(AppError::BadRequest("invalid request".into()));
    }

    if categories.len() > MAX_CATEGORIES {
        return Err(AppError::BadRequest("invalid request".into()));
    }
    for cat in &categories {
        validate_text_field(cat, MAX_CATEGORY_LENGTH, "category")?;
    }

    // Compute diffs for metric reporting
    let prev_set: HashSet<String> = track.categories.into_iter().collect();
    let new_set: HashSet<String> = categories.iter().cloned().collect();
    let added: Vec<String> = new_set.difference(&prev_set).cloned().collect();
    let removed: Vec<String> = prev_set.difference(&new_set).cloned().collect();

    db::update_track_categories(&pool, id, &categories).await?;

    // Metrics: record each assigned category (as at upload)
    for cat in &categories {
        metrics::record_track_category(cat);
    }

    // Record edits: overall 'set' operation and per-category add/remove
    metrics::record_track_category_edit("set");
    for cat in &added {
        metrics::record_track_category_edit_by_category("add", cat);
    }
    for cat in &removed {
        metrics::record_track_category_edit_by_category("remove", cat);
    }

    metrics::record_track_edit("categories");
    metrics::record_session_activity(Some(payload.session_id), "edit");
    Ok(StatusCode::NO_CONTENT)
}

pub async fn update_track_distance_markers(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    auth_user: OptionalAuthUser,
    Json(payload): Json<UpdateTrackDistanceMarkersRequest>,
) -> Result<StatusCode> {
    let track = db::get_track_detail(&pool, id).await?;
    let track = match track {
        Some(t) => t,
        None => return Err(AppError::NotFound),
    };

    check_track_ownership(
        track.user_id,
        track.session_id,
        &auth_user,
        Some(payload.session_id),
    )?;

    db::update_track_distance_markers(&pool, id, payload.distance_markers_enabled).await?;

    metrics::record_track_edit("distance_markers");
    metrics::record_session_activity(Some(payload.session_id), "edit");
    Ok(StatusCode::NO_CONTENT)
}

pub async fn search_tracks(
    State(pool): State<Arc<PgPool>>,
    Query(params): Query<TrackSearchQuery>,
    headers: HeaderMap,
) -> Result<Json<Vec<TrackSearchResult>>> {
    if params.query.trim().is_empty() {
        return Ok(Json(vec![]));
    }

    let session_id = parse_session_header(&headers);
    let tracks = db::search_tracks(&pool, &params.query).await.map_err(|e| {
        error!(error = ?e, endpoint = "search_tracks", "db error searching tracks");
        AppError::from(StatusCode::INTERNAL_SERVER_ERROR)
    })?;

    let result_type = if tracks.is_empty() { "zero" } else { "success" };
    let query_type = detect_search_query_type(&params.query);
    metrics::record_track_search(result_type, query_type);
    metrics::record_session_activity(session_id, "search");

    Ok(Json(tracks))
}

/// Generate sitemap.xml from public tracks
pub async fn debug_background_task(
    Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<axum::response::Json<serde_json::Value>> {
    // Guard: only enabled when env var explicitly set
    if std::env::var("ENABLE_DEBUG_ENDPOINTS").ok().as_deref() != Some("1") {
        return Err(AppError::NotFound);
    }

    let duration_secs = params
        .get("duration")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(5);

    // Spawn a background task that holds the BackgroundTaskGuard for the duration
    tokio::spawn(async move {
        let _guard = crate::metrics::BackgroundTaskGuard::new();
        tokio::time::sleep(std::time::Duration::from_secs(duration_secs)).await;
    });

    Ok(axum::Json(serde_json::json!({
        "status": "ok",
        "duration_secs": duration_secs
    })))
}

pub async fn export_track_gpx(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<axum::response::Response<axum::body::Body>> {
    debug!(track_id = %id, endpoint = "export_track_gpx", "request received");
    let start = Instant::now();
    let session_id = parse_session_header(&headers);

    // --- Rate limiting for exports ---
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let session_key = headers
        .get("x-session-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .or_else(|| {
            headers
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .map(|s| format!("ip:{}", s.split(',').next().unwrap_or("").trim()))
        })
        .unwrap_or_else(|| "anon".to_string());

    if record_session_export_attempt(&session_key, now).is_err() {
        // compute retry_after for header
        let retry_after = {
            let limit_seconds = export_rate_limit_seconds();
            if let Some(last) = last_export_attempt(&session_key) {
                if now < last + limit_seconds {
                    last + limit_seconds - now
                } else {
                    limit_seconds
                }
            } else {
                limit_seconds
            }
        };

        let resp = axum::response::Response::builder()
            .status(StatusCode::TOO_MANY_REQUESTS)
            .header("Retry-After", retry_after.to_string())
            .header(
                "Access-Control-Expose-Headers",
                "X-Export-Rate-Limit-Seconds, Retry-After",
            )
            .body(axum::body::Body::empty())?;

        return Ok(resp);
    }
    // --- End rate limiting ---

    match db::get_track_detail(&pool, id).await {
        Ok(Some(track)) => {
            let gpx_service = GpxExportService::new();
            let gpx_content = gpx_service.generate_gpx(&track);

            let response = axum::response::Response::builder()
                .header("Content-Type", "application/gpx+xml")
                .header(
                    "Content-Disposition",
                    format!(
                        "attachment; filename=\"{name}.gpx\"",
                        name = gpx_service.sanitize_filename(&track.name)
                    ),
                )
                .header(
                    "X-Export-Rate-Limit-Seconds",
                    format!("{}", export_rate_limit_seconds()),
                )
                .header(
                    "Access-Control-Expose-Headers",
                    "X-Export-Rate-Limit-Seconds, Retry-After",
                )
                .body(axum::body::Body::from(gpx_content))?;

            metrics::observe_track_export_duration("gpx", start.elapsed().as_secs_f64());
            metrics::record_track_export("gpx");
            metrics::record_session_activity(session_id, "export");

            Ok(response)
        }
        Ok(None) => {
            error!(?id, "[export_track_gpx] track not found");
            Err(AppError::NotFound)
        }
        Err(e) => {
            error!(?e, "[export_track_gpx] db error");
            Err(AppError::Internal(anyhow::anyhow!("internal error")))
        }
    }
}

pub async fn delete_track(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    auth_user: OptionalAuthUser,
    Json(payload): Json<UpdateTrackNameRequest>, // reuse session_id field pattern
) -> Result<StatusCode> {
    // Fetch track
    let track = db::get_track_detail(&pool, id).await?;
    let Some(track) = track else {
        return Err(AppError::NotFound);
    };

    // Check ownership (user_id for authenticated users, session_id for anonymous)
    check_track_ownership(
        track.user_id,
        track.session_id,
        &auth_user,
        Some(payload.session_id),
    )?;

    // Delete
    let affected = db::delete_track(&pool, id).await?;
    if affected == 0 {
        return Err(AppError::NotFound);
    }
    metrics::record_track_deleted("success");
    Ok(StatusCode::NO_CONTENT)
}

/// Enrich track with elevation data from OpenTopoData API
pub async fn enrich_elevation(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    auth_user: OptionalAuthUser,
    Json(payload): Json<EnrichElevationRequest>,
) -> Result<Json<EnrichElevationResponse>> {
    // Get track by id
    let track = db::get_track_by_id(&pool, id)
        .await
        .map_err(|e| {
            error!(track_id = %id, error = ?e, endpoint = "enrich_elevation", "failed to get track");
            AppError::from(StatusCode::INTERNAL_SERVER_ERROR)
        })?
        .ok_or_else(|| {
            warn!(track_id = %id, endpoint = "enrich_elevation", "track not found");
            StatusCode::NOT_FOUND
        })?;

    // Check ownership (user_id for authenticated users, session_id for anonymous)
    check_track_ownership(
        track.user_id,
        track.session_id,
        &auth_user,
        Some(payload.session_id),
    )?;

    // Check if enrichment is needed
    let enrichment_service = ElevationEnrichmentService::new();
    if !enrichment_service.needs_enrichment(
        track.elevation_enriched,
        track.elevation_gain,
        track.elevation_loss,
        payload.force.unwrap_or(false),
    ) {
        debug!(track_id = %id, endpoint = "enrich_elevation", "skipping: already enriched");
        metrics::record_session_activity(Some(payload.session_id), "enrich");
        return Ok(Json(EnrichElevationResponse {
            id,
            message: "Track already has elevation data".to_string(),
            elevation_gain: track.elevation_gain,
            elevation_loss: track.elevation_loss,
            elevation_min: track.elevation_min,
            elevation_max: track.elevation_max,
            elevation_dataset: track.elevation_dataset,
            enriched_at: track.elevation_enriched_at,
        }));
    }

    // Extract coordinates from track geometry
    let coordinates = match extract_coordinates_from_geojson(&track.geom_geojson) {
        Ok(coords) if !coords.is_empty() => coords,
        Ok(_) => {
            warn!(track_id = %id, endpoint = "enrich_elevation", reason = "no_coordinates", "cannot enrich track without coordinates");
            return Err(AppError::BadRequest("invalid request".into()));
        }
        Err(e) => {
            warn!(track_id = %id, error = ?e, endpoint = "enrich_elevation", reason = "invalid_geojson", "failed to extract coordinates");
            return Err(AppError::BadRequest("invalid request".into()));
        }
    };

    info!(track_id = %id, points = coordinates.len(), endpoint = "enrich_elevation", "starting elevation enrichment");

    // Enrich elevation — single canonical path (ADR 0009)
    let outcome = crate::services::enrichment::run_enrichment(&pool, id, coordinates).await;

    match outcome {
        crate::services::enrichment::EnrichmentOutcome::Success { gain, loss } => {
            metrics::record_session_activity(Some(payload.session_id), "enrich");
            Ok(Json(EnrichElevationResponse {
                id,
                message: "Track elevation enriched successfully".to_string(),
                elevation_gain: gain,
                elevation_loss: loss,
                elevation_min: track.elevation_min,
                elevation_max: track.elevation_max,
                elevation_dataset: track.elevation_dataset,
                enriched_at: Some(chrono::Utc::now().naive_utc()),
            }))
        }
        crate::services::enrichment::EnrichmentOutcome::FailedRemote => {
            metrics::record_session_activity(Some(payload.session_id), "enrich");
            Err(AppError::Internal(anyhow::anyhow!("internal error")))
        }
        crate::services::enrichment::EnrichmentOutcome::FailedUpdateDb => {
            metrics::record_session_activity(Some(payload.session_id), "enrich");
            Err(AppError::Internal(anyhow::anyhow!("internal error")))
        }
        crate::services::enrichment::EnrichmentOutcome::FailedSlope => {
            metrics::record_session_activity(Some(payload.session_id), "enrich");
            Ok(Json(EnrichElevationResponse {
                id,
                message: "Elevation enriched but slope calculation failed".to_string(),
                elevation_gain: None,
                elevation_loss: None,
                elevation_min: track.elevation_min,
                elevation_max: track.elevation_max,
                elevation_dataset: track.elevation_dataset,
                enriched_at: Some(chrono::Utc::now().naive_utc()),
            }))
        }
    }
}

/// POST /api/elevation/preview — Preview elevation profile for editor without saving.
pub async fn preview_elevation(
    Json(request): Json<ElevationPreviewRequest>,
) -> Result<Json<ElevationPreviewResponse>> {
    if request.coordinates.len() < 2 {
        return Err(AppError::BadRequest("invalid request".into()));
    }

    if request.coordinates.len() > 5000 {
        return Err(AppError::BadRequest("payload too large".into()));
    }

    let mut coordinates = Vec::with_capacity(request.coordinates.len());
    for coord in request.coordinates {
        if coord[0] < -90.0 || coord[0] > 90.0 || coord[1] < -180.0 || coord[1] > 180.0 {
            return Err(AppError::BadRequest("invalid request".into()));
        }
        coordinates.push((coord[0], coord[1]));
    }

    let enrichment_service = ElevationEnrichmentService::new();
    let enrichment_result = enrichment_service
        .enrich_track_elevation(coordinates)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("disabled") {
                StatusCode::SERVICE_UNAVAILABLE
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        })?;

    let profile = enrichment_result.elevation_profile.unwrap_or_default();

    Ok(Json(ElevationPreviewResponse {
        elevation_profile: profile,
        elevation_gain: enrichment_result.metrics.elevation_gain,
        elevation_loss: enrichment_result.metrics.elevation_loss,
        elevation_min: enrichment_result.metrics.elevation_min,
        elevation_max: enrichment_result.metrics.elevation_max,
        elevation_dataset: enrichment_result.dataset,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use uuid::Uuid;

    #[test]
    fn normalize_session_id_accepts_trimmed_uuid() {
        let raw = " 11111111-1111-4111-8111-111111111111 \n";
        let (uuid, normalized) = normalize_session_id(raw).expect("should parse");

        assert_eq!(
            uuid,
            Uuid::parse_str("11111111-1111-4111-8111-111111111111").unwrap()
        );
        assert_eq!(normalized, "11111111-1111-4111-8111-111111111111");
    }

    #[test]
    fn normalize_session_id_rejects_empty_field() {
        let err = normalize_session_id("   ").unwrap_err();
        assert!(matches!(err, AppError::BadRequest(_)));
    }

    #[test]
    fn normalize_session_id_rejects_invalid_uuid() {
        let err = normalize_session_id("not-a-uuid").unwrap_err();
        assert!(matches!(err, AppError::BadRequest(_)));
    }

    // Additional integration tests from tests/handlers.rs

    // Helper function to create a mock PgPool for testing
    // Note: These tests require actual database setup
    #[allow(dead_code)]
    async fn setup_test_pool() -> Arc<PgPool> {
        use sqlx::postgres::PgPoolOptions;
        // Prefer TEST_DATABASE_URL, fallback to DATABASE_URL
        let db_url = std::env::var("TEST_DATABASE_URL")
            .or_else(|_| std::env::var("DATABASE_URL"))
            .expect("Either TEST_DATABASE_URL or DATABASE_URL must be set for tests");
        Arc::new(
            PgPoolOptions::new()
                .max_connections(1)
                .connect(&db_url)
                .await
                .expect("Failed to create test pool"),
        )
    }

    #[test]
    fn test_get_track_simplified_adaptive_alignment() {
        // Build a synthetic track with 7000 points (moderate bucket) and matching profiles
        let point_count = 7000;
        let coords: Vec<serde_json::Value> = (0..point_count)
            .map(|i| {
                let lat = 55.0 + i as f64 * 0.00001;
                let lon = 37.0 + i as f64 * 0.00001;
                serde_json::json!([lon, lat])
            })
            .collect();
        let elevation: Vec<f64> = (0..point_count).map(|i| (i % 500) as f64).collect();
        let hr: Vec<i64> = (0..point_count).map(|i| 120 + (i % 40) as i64).collect();
        let temp: Vec<f64> = (0..point_count)
            .map(|i| 15.0 + (i % 10) as f64 * 0.1)
            .collect();

        // Compose TrackDetail
        let track = crate::models::TrackDetail {
            id: Uuid::new_v4(),
            name: "Adaptive Test".to_string(),
            description: None,
            categories: vec!["running".into()],
            distance_markers_enabled: Some(true),
            auto_classifications: vec![],
            geom_geojson: serde_json::json!({"type":"LineString","coordinates": coords}),
            segment_meta: None,
            length_km: 10.0,
            elevation_profile: Some(serde_json::json!(elevation)),
            hr_data: Some(serde_json::json!(hr)),
            temp_data: Some(serde_json::json!(temp)),
            time_data: None,
            segment_gaps: None,
            pause_gaps: None,
            elevation_gain: Some(100.0),
            elevation_loss: Some(90.0),
            elevation_min: Some(200.0),
            elevation_max: Some(300.0),
            elevation_enriched: Some(true),
            elevation_enriched_at: None,
            elevation_dataset: Some("srtm90m".to_string()),
            // Slope fields
            slope_min: None,
            slope_max: None,
            slope_avg: None,
            slope_histogram: None,
            slope_segments: None,
            avg_speed: Some(10.0),
            avg_hr: Some(130),
            hr_min: Some(110),
            hr_max: Some(170),
            moving_time: Some(3600),
            pause_time: Some(0),
            moving_avg_speed: Some(10.5),
            moving_avg_pace: Some(5.7),
            duration_seconds: Some(3700),
            recorded_at: None,
            created_at: None,
            updated_at: None,
            session_id: None,
            user_id: None,
            speed_data: Some(json!([8.0, 9.0, 10.0, 11.0])),
            pace_data: Some(json!([7.5, 6.7, 6.0, 5.5])),
        };

        // Directly invoke logic as db::get_track_detail would return track.
        // We simulate zoom param.
        use crate::track_utils::simplification::simplify_track_for_zoom;
        let coords_val = track
            .geom_geojson
            .get("coordinates")
            .unwrap()
            .as_array()
            .unwrap();
        let original_points: Vec<(f64, f64)> = coords_val
            .iter()
            .map(|c| {
                let arr = c.as_array().unwrap();
                (arr[1].as_f64().unwrap(), arr[0].as_f64().unwrap())
            })
            .collect();
        let simplified = simplify_track_for_zoom(&original_points, 14.0);
        assert!(simplified.len() < original_points.len());
        assert!(simplified.len() > original_points.len() / 3); // retention guard

        // Profile simplification should match geometry length
        use crate::track_utils::simplification::simplify_profile_array_adaptive;
        let elev_simpl = simplify_profile_array_adaptive(
            track.elevation_profile.as_ref().unwrap(),
            original_points.len(),
            simplified.len(),
        )
        .unwrap();
        assert_eq!(elev_simpl.as_array().unwrap().len(), simplified.len());
        let hr_simpl = simplify_profile_array_adaptive(
            track.hr_data.as_ref().unwrap(),
            original_points.len(),
            simplified.len(),
        )
        .unwrap();
        assert_eq!(hr_simpl.as_array().unwrap().len(), simplified.len());
        let temp_simpl = simplify_profile_array_adaptive(
            track.temp_data.as_ref().unwrap(),
            original_points.len(),
            simplified.len(),
        )
        .unwrap();
        assert_eq!(temp_simpl.as_array().unwrap().len(), simplified.len());
    }

    // Integration tests would go here for testing the full enrich_elevation handler
    // However, they require database setup and external API mocking, so we'll
    // keep them in the existing test files under tests/ directory for now

    #[test]
    fn test_slope_profile_point_serialization() {
        let point = SlopeProfilePoint {
            distance_m: 100.0,
            slope_percent: 5.5,
            length_m: 50.0,
        };

        let serialized = serde_json::to_string(&point).unwrap();
        let deserialized: SlopeProfilePoint = serde_json::from_str(&serialized).unwrap();

        assert_eq!(point.distance_m, deserialized.distance_m);
        assert_eq!(point.slope_percent, deserialized.slope_percent);
        assert_eq!(point.length_m, deserialized.length_m);
    }

    #[test]
    fn test_slope_segment_deserialization() {
        let json_data = r#"{
            "start_distance": 0.0,
            "end_distance": 100.0,
            "slope": 5.5
        }"#;

        let segment: SlopeSegment = serde_json::from_str(json_data).unwrap();

        assert_eq!(segment.start_distance, 0.0);
        assert_eq!(segment.end_distance, 100.0);
        assert_eq!(segment.slope, 5.5);
    }

    #[test]
    fn test_slope_profile_point_creation() {
        let segment = SlopeSegment {
            start_distance: 100.0,
            end_distance: 200.0,
            slope: -3.2,
        };

        let point = SlopeProfilePoint {
            distance_m: segment.start_distance,
            slope_percent: segment.slope,
            length_m: segment.end_distance - segment.start_distance,
        };

        assert_eq!(point.distance_m, 100.0);
        assert_eq!(point.slope_percent, -3.2);
        assert_eq!(point.length_m, 100.0);
    }

    #[test]
    fn test_multiple_slope_segments_conversion() {
        let segments_json = json!([
            {
                "start_distance": 0.0,
                "end_distance": 100.0,
                "slope": 5.0
            },
            {
                "start_distance": 100.0,
                "end_distance": 250.0,
                "slope": -2.5
            },
            {
                "start_distance": 250.0,
                "end_distance": 300.0,
                "slope": 8.1
            }
        ]);

        let segments: Vec<SlopeSegment> = serde_json::from_value(segments_json).unwrap();

        assert_eq!(segments.len(), 3);

        let profile: Vec<SlopeProfilePoint> = segments
            .into_iter()
            .map(|segment| SlopeProfilePoint {
                distance_m: segment.start_distance,
                slope_percent: segment.slope,
                length_m: segment.end_distance - segment.start_distance,
            })
            .collect();

        assert_eq!(profile.len(), 3);
        assert_eq!(profile[0].distance_m, 0.0);
        assert_eq!(profile[0].slope_percent, 5.0);
        assert_eq!(profile[0].length_m, 100.0);

        assert_eq!(profile[1].distance_m, 100.0);
        assert_eq!(profile[1].slope_percent, -2.5);
        assert_eq!(profile[1].length_m, 150.0);

        assert_eq!(profile[2].distance_m, 250.0);
        assert_eq!(profile[2].slope_percent, 8.1);
        assert_eq!(profile[2].length_m, 50.0);
    }

    #[test]
    fn test_slope_profile_point_vec_serialization() {
        let points = vec![
            SlopeProfilePoint {
                distance_m: 0.0,
                slope_percent: 5.0,
                length_m: 100.0,
            },
            SlopeProfilePoint {
                distance_m: 100.0,
                slope_percent: -2.5,
                length_m: 150.0,
            },
        ];

        let json = serde_json::to_string(&points).unwrap();
        let deserialized: Vec<SlopeProfilePoint> = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.len(), 2);
        assert_eq!(deserialized[0].distance_m, 0.0);
        assert_eq!(deserialized[1].slope_percent, -2.5);
    }

    #[test]
    fn test_empty_slope_segments() {
        let empty_segments: Vec<SlopeSegment> = vec![];
        let profile: Vec<SlopeProfilePoint> = empty_segments
            .into_iter()
            .map(|segment| SlopeProfilePoint {
                distance_m: segment.start_distance,
                slope_percent: segment.slope,
                length_m: segment.end_distance - segment.start_distance,
            })
            .collect();

        assert!(profile.is_empty());
    }

    #[test]
    fn test_slope_segment_edge_cases() {
        // Test zero-length segment
        let zero_segment = SlopeSegment {
            start_distance: 100.0,
            end_distance: 100.0,
            slope: 5.0,
        };

        let point = SlopeProfilePoint {
            distance_m: zero_segment.start_distance,
            slope_percent: zero_segment.slope,
            length_m: zero_segment.end_distance - zero_segment.start_distance,
        };

        assert_eq!(point.length_m, 0.0);

        // Test extreme slope values
        let extreme_segment = SlopeSegment {
            start_distance: 0.0,
            end_distance: 100.0,
            slope: 60.0, // Maximum expected slope
        };

        let extreme_point = SlopeProfilePoint {
            distance_m: extreme_segment.start_distance,
            slope_percent: extreme_segment.slope,
            length_m: extreme_segment.end_distance - extreme_segment.start_distance,
        };

        assert_eq!(extreme_point.slope_percent, 60.0);
    }
}

/// Get detailed slope profile for track visualization
///
/// Returns slope segments in format: [{distance_m: float, slope_percent: float, length_m: float}]
/// This endpoint provides the data needed for detailed slope visualization in ElevationChart.vue
pub async fn get_track_slope_profile(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse> {
    // Get track with slope data
    let track = match db::get_track_detail_adaptive(&pool, id, None, None).await? {
        Some(track) => track,
        None => return Err(AppError::NotFound),
    };

    // Check if slope data is available
    let slope_segments = match track.slope_segments {
        Some(segments) => segments,
        None => {
            // If no slope segments, try to calculate from existing data
            return Ok(Json(json!({
                "error": "Slope data not available for this track. Track may not have elevation data or slope calculation may be pending."
            })).into_response());
        }
    };

    // Parse slope segments from JSON
    let segments: Vec<SlopeSegment> = match serde_json::from_value(slope_segments) {
        Ok(segments) => segments,
        Err(e) => {
            tracing::error!("Failed to parse slope segments for track {}: {}", id, e);
            return Err(AppError::Internal(anyhow::anyhow!("internal error")));
        }
    };

    // Convert to API format
    let profile: Vec<SlopeProfilePoint> = segments
        .into_iter()
        .map(|segment| SlopeProfilePoint {
            distance_m: segment.start_distance,
            slope_percent: segment.slope,
            length_m: segment.end_distance - segment.start_distance,
        })
        .collect();

    Ok(Json(profile).into_response())
}

#[derive(Debug, Serialize, Deserialize)]
struct SlopeProfilePoint {
    distance_m: f64,
    slope_percent: f64,
    length_m: f64,
}

// This struct should match the one in slope.rs
#[derive(Debug, Deserialize)]
struct SlopeSegment {
    start_distance: f64,
    end_distance: f64,
    slope: f64,
}

/// Recalculate slopes for a track with improved algorithm
/// This endpoint allows recalculating slopes with the updated algorithm that includes:
/// - Better noise filtering
/// - Anomaly detection and smoothing
/// - More realistic slope limits
pub async fn recalculate_track_slopes(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    Json(request): Json<UpdateTrackNameRequest>, // Reuse existing struct for session_id
) -> Result<impl IntoResponse> {
    use crate::track_utils::slope::recalculate_slope_metrics;

    // Get track with geometry and elevation data
    let track = match db::get_track_detail_adaptive(&pool, id, None, None).await? {
        Some(track) => track,
        None => return Err(AppError::NotFound),
    };

    // Check session ownership (reuse existing auth logic)
    if track.session_id != Some(request.session_id) {
        return Err(AppError::Forbidden);
    }

    // Extract coordinates from geometry
    let geom_str = match track.geom_geojson.get("coordinates") {
        Some(coords) => coords.to_string(),
        None => return Err(AppError::BadRequest("invalid request".into())),
    };

    // Parse coordinates - for LineString GeoJSON format
    let coordinates: Vec<(f64, f64)> = match serde_json::from_str::<Vec<Vec<f64>>>(&geom_str) {
        Ok(coords) => coords
            .into_iter()
            .filter_map(|coord| {
                if coord.len() >= 2 {
                    Some((coord[1], coord[0])) // Convert from [lon, lat] to (lat, lon)
                } else {
                    None
                }
            })
            .collect(),
        Err(_) => return Err(AppError::BadRequest("invalid coordinates".into())),
    };

    if coordinates.len() < 2 {
        return Ok(Json(json!({
            "error": "Track does not have sufficient coordinates for slope calculation"
        }))
        .into_response());
    }

    // Extract elevation profile
    let elevation_profile: Vec<f64> = match &track.elevation_profile {
        Some(profile) => match profile.as_array() {
            Some(arr) => arr.iter().filter_map(|v| v.as_f64()).collect(),
            None => {
                return Ok(Json(json!({
                    "error": "Invalid elevation profile format"
                }))
                .into_response());
            }
        },
        None => {
            return Ok(Json(json!({
                "error": "Track does not have elevation data for slope calculation"
            }))
            .into_response());
        }
    };

    if elevation_profile.len() != coordinates.len() {
        return Ok(Json(json!({
            "error": "Mismatch between coordinates and elevation data"
        }))
        .into_response());
    }

    // Recalculate slopes with improved algorithm
    let slope_start = Instant::now();
    let slope_metrics = recalculate_slope_metrics(&coordinates, &elevation_profile, &track.name);
    let slope_duration = slope_start.elapsed().as_secs_f64();

    // Update track in database
    let update_result = sqlx::query(
        r#"
        UPDATE tracks 
        SET 
            slope_min = $1,
            slope_max = $2,
            slope_avg = $3,
            slope_histogram = $4,
            slope_segments = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        "#,
    )
    .bind(slope_metrics.slope_min)
    .bind(slope_metrics.slope_max)
    .bind(slope_metrics.slope_avg)
    .bind(slope_metrics.slope_histogram)
    .bind(slope_metrics.slope_segments)
    .bind(id)
    .execute(&*pool)
    .await;

    match update_result {
        Ok(_) => {
            metrics::observe_slope_recalc("success", slope_duration);
            tracing::info!("Successfully recalculated slopes for track {}", id);
            Ok(Json(json!({
                "id": id,
                "message": "Slopes recalculated successfully with improved algorithm",
                "slope_min": slope_metrics.slope_min,
                "slope_max": slope_metrics.slope_max,
                "slope_avg": slope_metrics.slope_avg
            }))
            .into_response())
        }
        Err(e) => {
            tracing::error!("Failed to update track slopes: {}", e);
            metrics::observe_slope_recalc("db_error", slope_duration);
            Err(AppError::Internal(anyhow::anyhow!("internal error")))
        }
    }
}

// ============================================================================
// Track Editor Handlers
// ============================================================================

/// POST /api/tracks/create — Create a new track from editor geometry.
pub async fn create_track_from_editor(
    State(pool): State<Arc<PgPool>>,
    auth_user: OptionalAuthUser,
    Json(request): Json<crate::services::track_editor::CreateTrackFromEditorRequest>,
) -> Result<(StatusCode, Json<TrackUploadResponse>)> {
    let user_id = auth_user.user().map(|u| u.user_id);
    let service = crate::services::track_editor::TrackEditorService::new(pool);
    let response = service.create_track(request, user_id).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

/// PUT /api/tracks/{id}/geometry — Update track geometry.
pub async fn update_track_geometry(
    State(pool): State<Arc<PgPool>>,
    auth_user: OptionalAuthUser,
    Path(track_id): Path<Uuid>,
    Json(request): Json<crate::services::track_editor::UpdateTrackGeometryRequest>,
) -> Result<StatusCode> {
    // Check ownership
    let (track_session_id, track_user_id) = db::get_track_ownership(&pool, track_id)
        .await
        .map_err(handle_db_error)?;
    check_track_ownership(
        track_user_id,
        track_session_id,
        &auth_user,
        request.session_id,
    )?;

    let service = crate::services::track_editor::TrackEditorService::new(pool);
    service.update_geometry(track_id, request).await?;
    Ok(StatusCode::OK)
}

/// POST /api/tracks/{id}/duplicate — Duplicate an existing track.
pub async fn duplicate_track(
    State(pool): State<Arc<PgPool>>,
    auth_user: OptionalAuthUser,
    Path(source_id): Path<Uuid>,
    Json(request): Json<crate::services::track_editor::DuplicateTrackRequest>,
) -> Result<(StatusCode, Json<TrackUploadResponse>)> {
    // Check ownership of source track
    let (track_session_id, track_user_id) = db::get_track_ownership(&pool, source_id)
        .await
        .map_err(handle_db_error)?;
    check_track_ownership(
        track_user_id,
        track_session_id,
        &auth_user,
        request.session_id,
    )?;

    let user_id = auth_user.user().map(|u| u.user_id);
    let service = crate::services::track_editor::TrackEditorService::new(pool);
    let response = service.duplicate_track(source_id, request, user_id).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

#[cfg(test)]
mod track_crud_tests {
    use super::*;

    #[test]
    fn test_track_list_query_parsing() {
        let query_json = r#"{
            "categories": ["hiking"],
            "min_length": 5.0,
            "max_length": 20.0,
            "mine": true
        }"#;

        let query: TrackListQuery = serde_json::from_str(query_json).unwrap();
        assert_eq!(query.categories, Some(vec!["hiking".to_string()]));
        assert_eq!(query.min_length, Some(5.0));
        assert_eq!(query.max_length, Some(20.0));
        assert_eq!(query.mine, Some(true));
    }

    #[test]
    fn test_track_list_query_empty() {
        let query: TrackListQuery = serde_json::from_str("{}").unwrap();
        assert!(query.categories.is_none());
        assert!(query.min_length.is_none());
        assert!(query.max_length.is_none());
        assert!(query.mine.is_none());
    }

    #[test]
    fn test_track_list_query_with_owner_ids() {
        let user_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();

        let query_json = format!(
            r#"{{
                "owner_user_id": "{}",
                "owner_session_id": "{}",
                "mine": true
            }}"#,
            user_id, session_id
        );

        let query: TrackListQuery = serde_json::from_str(&query_json).unwrap();
        assert_eq!(query.owner_user_id, Some(user_id));
        assert_eq!(query.owner_session_id, Some(session_id));
        assert_eq!(query.mine, Some(true));
    }

    #[test]
    fn test_track_upload_request_validation() {
        use bytes::Bytes;

        // Valid request
        let valid_request = TrackUploadRequest {
            name: Some("Test".to_string()),
            description: Some("Description".to_string()),
            categories: vec!["running".to_string()],
            session_id: Some(Uuid::new_v4()),
            file_name: "test.gpx".to_string(),
            file_bytes: Bytes::from_static(b"test data"),
        };

        assert_eq!(valid_request.name, Some("Test".to_string()));
        assert_eq!(valid_request.file_name, "test.gpx");
        assert_eq!(valid_request.categories, vec!["running".to_string()]);
    }

    #[test]
    fn test_track_upload_request_empty() {
        use bytes::Bytes;

        // Request with minimal fields
        let request = TrackUploadRequest {
            name: None,
            description: None,
            categories: vec![],
            session_id: None,
            file_name: "unnamed.gpx".to_string(),
            file_bytes: Bytes::from_static(b""),
        };

        assert!(request.name.is_none());
        assert!(request.description.is_none());
        assert!(request.categories.is_empty());
    }

    #[test]
    fn test_track_update_requests() {
        let session_id = Uuid::new_v4();

        // Test name update
        let name_update = UpdateTrackNameRequest {
            name: "New Name".to_string(),
            session_id,
        };
        assert_eq!(name_update.name, "New Name");

        // Test description update
        let desc_update = UpdateTrackDescriptionRequest {
            description: "New Description".to_string(),
            session_id,
        };
        assert_eq!(desc_update.description, "New Description");

        // Test categories update
        let cat_update = UpdateTrackCategoriesRequest {
            categories: vec!["cycling".to_string()],
            session_id,
        };
        assert_eq!(cat_update.categories, vec!["cycling".to_string()]);
    }

    #[test]
    fn test_enrich_elevation_request_defaults() {
        let session_id = Uuid::new_v4();
        let request = EnrichElevationRequest {
            force: None,
            dataset: None,
            session_id,
        };

        assert!(request.force.is_none());
        assert!(request.dataset.is_none());
    }

    #[test]
    fn test_enrich_elevation_request_with_values() {
        let session_id = Uuid::new_v4();
        let request = EnrichElevationRequest {
            force: Some(true),
            dataset: Some("aster".to_string()),
            session_id,
        };

        assert_eq!(request.force, Some(true));
        assert_eq!(request.dataset, Some("aster".to_string()));
    }

    #[test]
    fn test_track_search_query() {
        let query = TrackSearchQuery {
            query: "mountain trail".to_string(),
        };
        assert_eq!(query.query, "mountain trail");
    }

    #[test]
    fn test_track_search_query_empty() {
        let query = TrackSearchQuery {
            query: "".to_string(),
        };
        assert!(query.query.is_empty());
    }

    #[test]
    fn test_track_simplification_query() {
        let query = TrackSimplificationQuery {
            zoom: Some(15.0),
            mode: Some("detail".to_string()),
        };
        assert_eq!(query.zoom, Some(15.0));
        assert_eq!(query.mode, Some("detail".to_string()));
    }

    #[test]
    fn test_track_simplification_query_empty() {
        let query: TrackSimplificationQuery = serde_json::from_str("{}").unwrap();
        assert!(query.zoom.is_none());
        assert!(query.mode.is_none());
    }

    #[test]
    fn test_track_upload_response_serialization() {
        let track_id = Uuid::new_v4();
        let response = TrackUploadResponse {
            id: track_id,
            url: format!("/tracks/{}", track_id),
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains(&track_id.to_string()));
        assert!(json.contains("/tracks/"));
    }

    #[test]
    fn test_track_exist_response_serialization() {
        let track_id = Uuid::new_v4();

        // Test exists
        let exists_response = TrackExistResponse {
            is_exist: true,
            id: Some(track_id),
        };
        let exists_json = serde_json::to_string(&exists_response).unwrap();
        assert!(exists_json.contains("true"));
        assert!(exists_json.contains(&track_id.to_string()));

        // Test not exists
        let not_exists_response = TrackExistResponse {
            is_exist: false,
            id: None,
        };
        let not_exists_json = serde_json::to_string(&not_exists_response).unwrap();
        assert!(not_exists_json.contains("false"));
    }

    // Additional tests from tracks_tests.rs

    #[test]
    fn test_check_track_ownership_with_authenticated_user() {
        let user_id = Uuid::new_v4();
        let track_user_id = Some(user_id);
        let track_session_id = Some(Uuid::new_v4());

        // Create mock auth user
        let auth_user = OptionalAuthUser(Some(crate::auth::AuthUser {
            user_id,
            email: "test@example.com".to_string(),
            name: Some("Test".to_string()),
            nickname: None,
            avatar_url: None,
            roles: vec!["user".to_string()],
            claims: crate::auth::Claims {
                sub: user_id.to_string(),
                email: "test@example.com".to_string(),
                name: "Test".to_string(),
                nickname: None,
                avatar_url: None,
                roles: vec!["user".to_string()],
                exp: 0,
                iat: 0,
                iss: "trackly-app".to_string(),
                aud: "trackly-web".to_string(),
            },
        }));

        let result = check_track_ownership(track_user_id, track_session_id, &auth_user, None);

        assert_eq!(result, Ok(()));
    }

    #[test]
    fn test_check_track_ownership_wrong_user() {
        let user_id = Uuid::new_v4();
        let track_user_id = Some(Uuid::new_v4()); // Different user
        let track_session_id = Some(Uuid::new_v4());

        let auth_user = OptionalAuthUser(Some(crate::auth::AuthUser {
            user_id,
            email: "test@example.com".to_string(),
            name: Some("Test".to_string()),
            nickname: None,
            avatar_url: None,
            roles: vec!["user".to_string()],
            claims: crate::auth::Claims {
                sub: user_id.to_string(),
                email: "test@example.com".to_string(),
                name: "Test".to_string(),
                nickname: None,
                avatar_url: None,
                roles: vec!["user".to_string()],
                exp: 0,
                iat: 0,
                iss: "trackly-app".to_string(),
                aud: "trackly-web".to_string(),
            },
        }));

        let result = check_track_ownership(track_user_id, track_session_id, &auth_user, None);

        assert_eq!(result, Err(StatusCode::FORBIDDEN));
    }

    #[test]
    fn test_check_track_ownership_with_session() {
        let session_id = Uuid::new_v4();
        let track_session_id = Some(session_id);

        let auth_user = OptionalAuthUser(None);

        let result = check_track_ownership(None, track_session_id, &auth_user, Some(session_id));

        assert_eq!(result, Ok(()));
    }

    #[test]
    fn test_check_track_ownership_wrong_session() {
        let session_id = Uuid::new_v4();
        let track_session_id = Some(Uuid::new_v4()); // Different session

        let auth_user = OptionalAuthUser(None);

        let result = check_track_ownership(None, track_session_id, &auth_user, Some(session_id));

        assert_eq!(result, Err(StatusCode::FORBIDDEN));
    }

    #[test]
    fn test_check_track_ownership_no_auth() {
        let auth_user = OptionalAuthUser(None);

        let result =
            check_track_ownership(Some(Uuid::new_v4()), Some(Uuid::new_v4()), &auth_user, None);

        assert_eq!(result, Err(StatusCode::FORBIDDEN));
    }

    #[test]
    fn test_track_list_item_serialization() {
        let track_id = Uuid::new_v4();
        let item = TrackListItem {
            id: track_id,
            name: "Test Track".to_string(),
            categories: vec!["running".to_string()],
            length_km: 5.5,
            elevation_gain: Some(100.0),
            elevation_loss: Some(50.0),
            elevation_enriched: Some(false),
            slope_min: Some(-5.0),
            slope_max: Some(10.0),
            slope_avg: Some(2.5),
            url: format!("/tracks/{}", track_id),
        };

        let json = serde_json::to_string(&item).unwrap();
        let deserialized: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized["name"], "Test Track");
        assert_eq!(deserialized["length_km"], 5.5);
        assert_eq!(deserialized["url"], format!("/tracks/{}", track_id));
    }

    #[test]
    fn test_track_list_query_deserialization_full() {
        let json = r#"{
            "categories": ["running", "cycling"],
            "min_length": 1.0,
            "max_length": 10.0,
            "elevation_gain_min": 50.0,
            "elevation_gain_max": 500.0,
            "slope_min": -10.0,
            "slope_max": 20.0,
            "mine": true
        }"#;

        let query: TrackListQuery = serde_json::from_str(json).unwrap();

        assert_eq!(
            query.categories,
            Some(vec!["running".to_string(), "cycling".to_string()])
        );
        assert_eq!(query.min_length, Some(1.0));
        assert_eq!(query.max_length, Some(10.0));
        assert_eq!(query.elevation_gain_min, Some(50.0));
        assert_eq!(query.elevation_gain_max, Some(500.0));
        assert_eq!(query.slope_min, Some(-10.0));
        assert_eq!(query.slope_max, Some(20.0));
        assert_eq!(query.mine, Some(true));
    }

    #[test]
    fn test_enrich_elevation_response() {
        let track_id = Uuid::new_v4();
        let response = EnrichElevationResponse {
            id: track_id,
            message: "Elevation enriched successfully".to_string(),
            elevation_gain: Some(100.0),
            elevation_loss: Some(50.0),
            elevation_min: Some(0.0),
            elevation_max: Some(150.0),
            elevation_dataset: Some("srtm".to_string()),
            enriched_at: Some(
                chrono::NaiveDateTime::parse_from_str("2024-01-01 12:00:00", "%Y-%m-%d %H:%M:%S")
                    .unwrap(),
            ),
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("Elevation enriched successfully"));
        assert!(json.contains(&track_id.to_string()));
    }

    #[test]
    fn test_track_search_result_serialization() {
        let track_id = Uuid::new_v4();
        let result = TrackSearchResult {
            id: track_id,
            name: "Mountain Hike".to_string(),
            description: Some("Beautiful mountain trail".to_string()),
            categories: vec!["hiking".to_string()],
            length_km: 12.5,
            url: format!("/tracks/{}", track_id),
        };

        let json = serde_json::to_string(&result).unwrap();
        let deserialized: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized["name"], "Mountain Hike");
        assert_eq!(deserialized["length_km"], 12.5);
        assert_eq!(deserialized["categories"], serde_json::json!(["hiking"]));
    }

    #[test]
    fn test_parsed_track_data_hash_generation() {
        use crate::track_utils::calculate_file_hash;

        let data = b"test track data for hashing";
        let hash = calculate_file_hash(data);

        // Hash should be non-empty string
        assert!(!hash.is_empty());
        assert_eq!(hash.len(), 64); // SHA-256 hex string length
    }

    #[test]
    fn test_track_list_query_with_mine_filter() {
        let user_id = Uuid::new_v4();
        let query = TrackListQuery {
            categories: None,
            min_length: None,
            max_length: None,
            elevation_gain_min: None,
            elevation_gain_max: None,
            slope_min: None,
            slope_max: None,
            owner_session_id: None,
            owner_user_id: Some(user_id),
            mine: Some(true),
        };

        assert_eq!(query.owner_user_id, Some(user_id));
        assert_eq!(query.mine, Some(true));
    }

    #[test]
    fn test_track_mode_conversion() {
        use crate::models::TrackMode;

        let overview = TrackMode::from_string("overview");
        assert!(overview.is_overview());
        assert!(!overview.is_detail());

        let detail = TrackMode::from_string("detail");
        assert!(detail.is_detail());
        assert!(!detail.is_overview());

        let default = TrackMode::from_string("invalid");
        assert!(default.is_overview()); // Default to overview
    }

    #[test]
    fn test_track_list_item_with_all_fields() {
        let track_id = Uuid::new_v4();
        let item = TrackListItem {
            id: track_id,
            name: "Complete Track".to_string(),
            categories: vec!["running".to_string(), "trail".to_string()],
            length_km: 15.5,
            elevation_gain: Some(250.0),
            elevation_loss: Some(200.0),
            elevation_enriched: Some(true),
            slope_min: Some(-10.0),
            slope_max: Some(15.0),
            slope_avg: Some(5.0),
            url: format!("/tracks/{}", track_id),
        };

        let json = serde_json::to_string(&item).unwrap();
        let deserialized: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized["name"], "Complete Track");
        assert_eq!(deserialized["length_km"], 15.5);
        assert_eq!(deserialized["categories"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_track_update_name_request_validation() {
        let session_id = Uuid::new_v4();

        // Valid name
        let valid = UpdateTrackNameRequest {
            name: "Valid Track Name".to_string(),
            session_id,
        };
        assert!(!valid.name.is_empty());
        assert!(valid.name.len() <= 100);

        // Empty name
        let empty = UpdateTrackNameRequest {
            name: "".to_string(),
            session_id,
        };
        assert!(empty.name.is_empty());
    }

    #[test]
    fn test_track_update_categories_request_validation() {
        let session_id = Uuid::new_v4();

        // Valid categories
        let valid = UpdateTrackCategoriesRequest {
            categories: vec!["running".to_string(), "cycling".to_string()],
            session_id,
        };
        assert_eq!(valid.categories.len(), 2);

        // Empty categories
        let empty = UpdateTrackCategoriesRequest {
            categories: vec![],
            session_id,
        };
        assert!(empty.categories.is_empty());

        // Too many categories
        let many = UpdateTrackCategoriesRequest {
            categories: vec!["cat1".to_string(); 20],
            session_id,
        };
        assert_eq!(many.categories.len(), 20);
    }

    #[test]
    fn test_track_simplification_query_edge_cases() {
        // Very high zoom
        let high_zoom = TrackSimplificationQuery {
            zoom: Some(20.0),
            mode: Some("detail".to_string()),
        };
        assert_eq!(high_zoom.zoom, Some(20.0));

        // Very low zoom
        let low_zoom = TrackSimplificationQuery {
            zoom: Some(1.0),
            mode: Some("overview".to_string()),
        };
        assert_eq!(low_zoom.zoom, Some(1.0));

        // No zoom specified
        let no_zoom: TrackSimplificationQuery = serde_json::from_str("{}").unwrap();
        assert!(no_zoom.zoom.is_none());
    }

    #[test]
    fn test_enrich_elevation_request_datasets() {
        let session_id = Uuid::new_v4();

        // Test different dataset values
        let datasets = vec!["srtm", "aster", "custom"];

        for dataset in datasets {
            let request = EnrichElevationRequest {
                force: Some(false),
                dataset: Some(dataset.to_string()),
                session_id,
            };
            assert_eq!(request.dataset, Some(dataset.to_string()));
            assert_eq!(request.force, Some(false));
        }
    }

    #[test]
    fn test_track_search_query_variations() {
        // Simple query
        let simple = TrackSearchQuery {
            query: "mountain".to_string(),
        };
        assert_eq!(simple.query, "mountain");

        // Complex query with spaces
        let complex = TrackSearchQuery {
            query: "mountain trail hiking".to_string(),
        };
        assert_eq!(complex.query, "mountain trail hiking");

        // Query with special characters
        let special = TrackSearchQuery {
            query: "trail-2024_test".to_string(),
        };
        assert_eq!(special.query, "trail-2024_test");
    }

    #[test]
    fn test_track_exist_response_variations() {
        let track_id = Uuid::new_v4();

        // Track exists
        let exists = TrackExistResponse {
            is_exist: true,
            id: Some(track_id),
        };
        let exists_json = serde_json::to_string(&exists).unwrap();
        assert!(exists_json.contains("true"));
        assert!(exists_json.contains(&track_id.to_string()));

        // Track does not exist
        let not_exists = TrackExistResponse {
            is_exist: false,
            id: None,
        };
        let not_exists_json = serde_json::to_string(&not_exists).unwrap();
        assert!(not_exists_json.contains("false"));
        assert!(not_exists_json.contains("null"));
    }

    #[test]
    fn test_check_track_ownership_priority() {
        // Test that user auth takes priority over session
        let user_id = Uuid::new_v4();
        let track_user_id = Some(user_id);
        let different_session = Some(Uuid::new_v4());
        let request_session = Uuid::new_v4();

        let auth_user = OptionalAuthUser(Some(crate::auth::AuthUser {
            user_id,
            email: "test@example.com".to_string(),
            name: Some("Test".to_string()),
            nickname: None,
            avatar_url: None,
            roles: vec!["user".to_string()],
            claims: crate::auth::Claims {
                sub: user_id.to_string(),
                email: "test@example.com".to_string(),
                name: "Test".to_string(),
                nickname: None,
                avatar_url: None,
                roles: vec!["user".to_string()],
                exp: 0,
                iat: 0,
                iss: "trackly-app".to_string(),
                aud: "trackly-web".to_string(),
            },
        }));

        // Should succeed because user_id matches, even though session doesn't
        let result = check_track_ownership(
            track_user_id,
            different_session,
            &auth_user,
            Some(request_session),
        );
        assert_eq!(result, Ok(()));
    }
}
