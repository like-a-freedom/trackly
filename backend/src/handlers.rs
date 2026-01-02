use crate::db;
use crate::input_validation::{
    validate_file_size, validate_text_field, MAX_CATEGORIES, MAX_CATEGORY_LENGTH,
    MAX_DESCRIPTION_LENGTH, MAX_FIELD_SIZE, MAX_NAME_LENGTH,
};
use crate::metrics;
use crate::models::*;
use crate::services::gpx_export::GpxExportService;
use crate::services::track_upload::{TrackUploadRequest, TrackUploadService};
use crate::track_utils::{
    calculate_file_hash, extract_coordinates_from_geojson, ElevationEnrichmentService,
};
use axum::http::header::REFERER;
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use axum_extra::extract::multipart::Multipart as AxumMultipart;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

// Safe error handling - don't expose internal details
fn handle_db_error(err: sqlx::Error) -> StatusCode {
    error!(error = ?err, "database error occurred");
    match err {
        sqlx::Error::RowNotFound => StatusCode::NOT_FOUND,
        sqlx::Error::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

pub async fn check_track_exist(
    State(pool): State<Arc<PgPool>>,
    mut multipart: AxumMultipart,
) -> Result<Json<TrackExistResponse>, StatusCode> {
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
            }))
        }
    };
    let _file_name = match file_name {
        Some(f) => f,
        None => {
            return Ok(Json(TrackExistResponse {
                is_exist: false,
                id: None,
            }))
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

static LAST_UPLOAD: Lazy<Mutex<HashMap<String, u64>>> = Lazy::new(|| Mutex::new(HashMap::new()));

// Configurable rate limiting
static UPLOAD_RATE_LIMIT_SECONDS: Lazy<u64> = Lazy::new(|| {
    std::env::var("UPLOAD_RATE_LIMIT_SECONDS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(10) // Default 10 seconds
});

fn normalize_session_id(raw: &str) -> Result<(Uuid, String), StatusCode> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        warn!(
            reason = "empty_session_id",
            "session_id field is empty after trimming"
        );
        return Err(StatusCode::BAD_REQUEST);
    }

    match Uuid::parse_str(trimmed) {
        Ok(uuid) => Ok((uuid, trimmed.to_string())),
        Err(e) => {
            warn!(reason = "invalid_session_id", session_id = %trimmed, error = ?e, "failed to parse session_id");
            Err(StatusCode::BAD_REQUEST)
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

fn bucket_zoom_level(zoom: Option<f64>) -> &'static str {
    match zoom {
        Some(z) if z < 10.0 => "low",
        Some(z) if z < 14.0 => "mid",
        Some(_) => "high",
        None => "mid",
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

fn record_session_upload_attempt(session_key: &str, now: u64) -> Result<(), StatusCode> {
    let mut map = LAST_UPLOAD.lock().map_err(|e| {
        error!(error = ?e, "LAST_UPLOAD mutex poisoned");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    if let Some(&last) = map.get(session_key) {
        if now < last + *UPLOAD_RATE_LIMIT_SECONDS {
            let retry_after = last + *UPLOAD_RATE_LIMIT_SECONDS - now;
            warn!(
                reason = "upload_rate_limited",
                session_id = session_key,
                retry_after_seconds = retry_after,
                "upload_track rate limit hit"
            );
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
    }
    map.insert(session_key.to_string(), now);
    Ok(())
}

#[cfg(test)]
fn reset_rate_limit_state() {
    // Clear the LAST_UPLOAD map for tests; if poisoned, log and skip the clear
    match LAST_UPLOAD.lock() {
        Ok(mut m) => m.clear(),
        Err(e) => error!(error = ?e, "LAST_UPLOAD mutex poisoned - clear skipped"),
    }
}

pub async fn upload_track(
    State(pool): State<Arc<PgPool>>,
    mut multipart: AxumMultipart,
) -> Result<Json<TrackUploadResponse>, StatusCode> {
    info!(endpoint = "upload_track", "request received");
    let mut name = None;
    let mut description = None;
    let mut categories = Vec::new();
    let mut session_id = None;
    let mut file_bytes = None;
    let mut file_name = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        warn!(error = ?e, "multipart read failed");
        StatusCode::INTERNAL_SERVER_ERROR
    })? {
        debug!(field_name = ?field.name(), "upload_track: received multipart field");
        if let Some(field_name) = field.name() {
            match field_name {
                "name" => {
                    let name_text = field.text().await.map_err(|e| {
                        warn!(error = ?e, field = "name", "failed to read text field");
                        StatusCode::BAD_REQUEST
                    })?;
                    validate_text_field(&name_text, MAX_NAME_LENGTH, "name")?;
                    name = Some(name_text);
                }
                "description" => {
                    let desc_text = field.text().await.map_err(|e| {
                        warn!(error = ?e, field = "description", "failed to read text field");
                        StatusCode::BAD_REQUEST
                    })?;
                    validate_text_field(&desc_text, MAX_DESCRIPTION_LENGTH, "description")?;
                    description = Some(desc_text);
                }
                "categories" => {
                    let cats = field.text().await.map_err(|e| {
                        warn!(error = ?e, field = "categories", "failed to read text field");
                        StatusCode::BAD_REQUEST
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
                        return Err(StatusCode::BAD_REQUEST);
                    }
                    if categories.len() > MAX_CATEGORIES {
                        warn!(
                            categories = categories.len(),
                            max = MAX_CATEGORIES,
                            "too many categories"
                        );
                        return Err(StatusCode::BAD_REQUEST);
                    }
                    for cat in &categories {
                        validate_text_field(cat, MAX_CATEGORY_LENGTH, "category")?;
                    }
                }
                "session_id" => {
                    let sid_raw = field.text().await.map_err(|e| {
                        warn!(error = ?e, field = "session_id", "failed to read text field");
                        StatusCode::BAD_REQUEST
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
                        StatusCode::PAYLOAD_TOO_LARGE
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
            return Err(StatusCode::BAD_REQUEST);
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
            return Err(StatusCode::BAD_REQUEST);
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
        return Err(StatusCode::BAD_REQUEST);
    }
    if categories.len() > MAX_CATEGORIES {
        error!(
            "Too many categories: {} > {}",
            categories.len(),
            MAX_CATEGORIES
        );
        return Err(StatusCode::BAD_REQUEST);
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
    Query(params): Query<TrackGeoJsonQuery>,
) -> Result<Json<TrackGeoJsonCollection>, StatusCode> {
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

pub async fn get_track(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    Query(params): Query<TrackSimplificationQuery>,
    headers: HeaderMap,
) -> Result<Json<TrackDetail>, StatusCode> {
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
            Err(StatusCode::NOT_FOUND)
        }
        Err(e) => {
            error!(error = ?e, endpoint = "get_track", "db error");
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_track_simplified(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    Query(params): Query<TrackSimplificationQuery>,
    headers: HeaderMap,
) -> Result<Json<TrackSimplified>, StatusCode> {
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
                geom_geojson: track.geom_geojson,
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
            Err(StatusCode::NOT_FOUND)
        }
        Err(e) => {
            error!(error = ?e, endpoint = "get_track_simplified", "db error");
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn update_track_description(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateTrackDescriptionRequest>,
) -> Result<StatusCode, StatusCode> {
    // Check that track exists and session_id matches owner
    let track = db::get_track_detail(&pool, id)
        .await
        .map_err(handle_db_error)?;
    let track = match track {
        Some(t) => t,
        None => return Err(StatusCode::NOT_FOUND),
    };
    if track.session_id != Some(payload.session_id) {
        return Err(StatusCode::FORBIDDEN);
    }
    db::update_track_description(&pool, id, &payload.description)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    metrics::record_track_edit("description");
    metrics::record_session_activity(Some(payload.session_id), "edit");
    Ok(StatusCode::NO_CONTENT)
}

pub async fn update_track_name(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateTrackNameRequest>,
) -> Result<StatusCode, StatusCode> {
    // Validate name length (1-255 characters)
    if payload.name.trim().is_empty() || payload.name.len() > 255 {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Check that track exists and session_id matches owner
    let track = db::get_track_detail(&pool, id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let track = match track {
        Some(t) => t,
        None => return Err(StatusCode::NOT_FOUND),
    };
    if track.session_id != Some(payload.session_id) {
        return Err(StatusCode::FORBIDDEN);
    }

    db::update_track_name(&pool, id, payload.name.trim())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    metrics::record_track_edit("name");
    metrics::record_session_activity(Some(payload.session_id), "edit");
    Ok(StatusCode::NO_CONTENT)
}

pub async fn update_track_categories(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateTrackCategoriesRequest>,
) -> Result<StatusCode, StatusCode> {
    // Check that track exists and session_id matches owner
    let track = db::get_track_detail(&pool, id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let track = match track {
        Some(t) => t,
        None => return Err(StatusCode::NOT_FOUND),
    };
    if track.session_id != Some(payload.session_id) {
        return Err(StatusCode::FORBIDDEN);
    }

    // Build sanitized new categories list
    let categories: Vec<String> = payload
        .categories
        .iter()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .collect();

    // Require at least one category (same rule as upload)
    if categories.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    if categories.len() > MAX_CATEGORIES {
        return Err(StatusCode::BAD_REQUEST);
    }
    for cat in &categories {
        validate_text_field(cat, MAX_CATEGORY_LENGTH, "category")?;
    }

    // Compute diffs for metric reporting
    let prev_set: HashSet<String> = track.categories.into_iter().collect();
    let new_set: HashSet<String> = categories.iter().cloned().collect();
    let added: Vec<String> = new_set.difference(&prev_set).cloned().collect();
    let removed: Vec<String> = prev_set.difference(&new_set).cloned().collect();

    db::update_track_categories(&pool, id, &categories)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

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

pub async fn search_tracks(
    State(pool): State<Arc<PgPool>>,
    Query(params): Query<TrackSearchQuery>,
    headers: HeaderMap,
) -> Result<Json<Vec<TrackSearchResult>>, StatusCode> {
    if params.query.trim().is_empty() {
        return Ok(Json(vec![]));
    }

    let session_id = parse_session_header(&headers);
    let tracks = db::search_tracks(&pool, &params.query).await.map_err(|e| {
        error!(error = ?e, endpoint = "search_tracks", "db error searching tracks");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let result_type = if tracks.is_empty() { "zero" } else { "success" };
    let query_type = detect_search_query_type(&params.query);
    metrics::record_track_search(result_type, query_type);
    metrics::record_session_activity(session_id, "search");

    Ok(Json(tracks))
}

pub async fn record_map_interaction(
    Json(event): Json<MapInteractionEvent>,
) -> Result<StatusCode, StatusCode> {
    let action_label = match event.action.as_str() {
        "zoom" => "zoom",
        "pan" => "pan",
        "layer_switch" => "layer_switch",
        _ => "other",
    };
    let zoom_bucket = bucket_zoom_level(event.zoom);
    metrics::record_map_interaction(action_label, zoom_bucket);
    metrics::record_session_activity(event.session_id, "map");
    Ok(StatusCode::NO_CONTENT)
}

pub async fn health() -> &'static str {
    debug!(endpoint = "health", "health check");
    "ok"
}

/// Generate sitemap.xml from public tracks
pub async fn sitemap(
    State(pool): State<Arc<PgPool>>,
) -> Result<axum::response::Response<axum::body::Body>, StatusCode> {
    // Site URL from env var (e.g., https://example.com)
    let site_url =
        std::env::var("SITE_URL").unwrap_or_else(|_| "https://your-domain.example".to_string());

    let entries = db::list_public_tracks_for_sitemap(&pool)
        .await
        .map_err(handle_db_error)?;

    // Build sitemap XML
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
    for e in entries {
        xml.push_str("  <url>\n");
        xml.push_str(&format!(
            "    <loc>{}/track/{}</loc>\n",
            site_url.trim_end_matches('/'),
            e.id
        ));
        xml.push_str(&format!(
            "    <lastmod>{}</lastmod>\n",
            e.lastmod.to_rfc3339()
        ));
        xml.push_str("  </url>\n");
    }
    xml.push_str("</urlset>");

    let response = axum::response::Response::builder()
        .header("Content-Type", "application/xml")
        .body(axum::body::Body::from(xml))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(response)
}

/// Debug endpoint: spawn a background task that holds a BackgroundTaskGuard for `duration` seconds.
/// Enabled only when `ENABLE_DEBUG_ENDPOINTS` env var is set to `1`.
pub async fn debug_background_task(
    Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<axum::response::Json<serde_json::Value>, axum::http::StatusCode> {
    // Guard: only enabled when env var explicitly set
    if std::env::var("ENABLE_DEBUG_ENDPOINTS").ok().as_deref() != Some("1") {
        return Err(axum::http::StatusCode::NOT_FOUND);
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
) -> Result<axum::response::Response<axum::body::Body>, StatusCode> {
    debug!(track_id = %id, endpoint = "export_track_gpx", "request received");
    let start = Instant::now();
    let session_id = parse_session_header(&headers);

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
                .body(axum::body::Body::from(gpx_content))
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            metrics::observe_track_export_duration("gpx", start.elapsed().as_secs_f64());
            metrics::record_track_export("gpx");
            metrics::record_session_activity(session_id, "export");

            Ok(response)
        }
        Ok(None) => {
            error!(?id, "[export_track_gpx] track not found");
            Err(StatusCode::NOT_FOUND)
        }
        Err(e) => {
            error!(?e, "[export_track_gpx] db error");
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn delete_track(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateTrackNameRequest>, // reuse session_id field pattern
) -> Result<StatusCode, StatusCode> {
    // Fetch track
    let track = db::get_track_detail(&pool, id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let Some(track) = track else {
        return Err(StatusCode::NOT_FOUND);
    };
    // Ownership check
    if track.session_id != Some(payload.session_id) {
        return Err(StatusCode::FORBIDDEN);
    }
    // Delete
    let affected = db::delete_track(&pool, id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if affected == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    metrics::record_track_deleted("success");
    Ok(StatusCode::NO_CONTENT)
}

/// Enrich track with elevation data from OpenTopoData API
pub async fn enrich_elevation(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<EnrichElevationRequest>,
) -> Result<Json<EnrichElevationResponse>, StatusCode> {
    // Get track by id
    let track = db::get_track_by_id(&pool, id)
        .await
        .map_err(|e| {
            error!(track_id = %id, error = ?e, endpoint = "enrich_elevation", "failed to get track");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or_else(|| {
            warn!(track_id = %id, endpoint = "enrich_elevation", "track not found");
            StatusCode::NOT_FOUND
        })?;

    // Check ownership
    if track.session_id != Some(payload.session_id) {
        warn!(track_id = %id, endpoint = "enrich_elevation", "permission denied: session mismatch");
        return Err(StatusCode::FORBIDDEN);
    }

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
            return Err(StatusCode::BAD_REQUEST);
        }
        Err(e) => {
            warn!(track_id = %id, error = ?e, endpoint = "enrich_elevation", reason = "invalid_geojson", "failed to extract coordinates");
            return Err(StatusCode::BAD_REQUEST);
        }
    };

    info!(track_id = %id, points = coordinates.len(), endpoint = "enrich_elevation", "starting elevation enrichment");

    // Enrich elevation data
    let enrichment_result = match enrichment_service
        .enrich_track_elevation(coordinates.clone())
        .await
    {
        Ok(result) => result,
        Err(e) => {
            error!("Failed to enrich elevation for track {}: {}", id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Update track in database
    if let Err(e) = db::update_track_elevation(
        &pool,
        id,
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
        error!(track_id = %id, error = ?e, endpoint = "enrich_elevation", "failed to update elevation data");
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    // Calculate and update slope data
    if let Some(elevation_profile) = &enrichment_result.elevation_profile {
        use crate::track_utils::slope::recalculate_slope_metrics;

        // Use universal slope calculation function
        let slope_start = Instant::now();
        let slope_result =
            recalculate_slope_metrics(&coordinates, elevation_profile, &format!("Track {}", id));
        let slope_duration = slope_start.elapsed().as_secs_f64();

        // Update track with slope data
        if let Err(e) = db::update_track_slope(
            &pool,
            id,
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
            error!(track_id = %id, error = ?e, endpoint = "enrich_elevation", "failed to update slope data");
            metrics::observe_slope_recalc("db_error", slope_duration);
        } else {
            metrics::observe_slope_recalc("success", slope_duration);
            info!(
                track_id = %id,
                slope_min = slope_result.slope_min.unwrap_or(0.0),
                slope_max = slope_result.slope_max.unwrap_or(0.0),
                slope_avg = slope_result.slope_avg.unwrap_or(0.0),
                endpoint = "enrich_elevation",
                "slope metrics updated"
            );
        }
    }

    info!(
        track_id = %id,
        gain_m = enrichment_result.metrics.elevation_gain.unwrap_or(0.0),
        loss_m = enrichment_result.metrics.elevation_loss.unwrap_or(0.0),
        endpoint = "enrich_elevation",
        "elevation enrichment completed"
    );

    metrics::record_session_activity(Some(payload.session_id), "enrich");

    Ok(Json(EnrichElevationResponse {
        id,
        message: "Track elevation enriched successfully".to_string(),
        elevation_gain: enrichment_result.metrics.elevation_gain,
        elevation_loss: enrichment_result.metrics.elevation_loss,
        elevation_min: enrichment_result.metrics.elevation_min,
        elevation_max: enrichment_result.metrics.elevation_max,
        elevation_dataset: Some(enrichment_result.dataset),
        enriched_at: Some(enrichment_result.enriched_at.naive_utc()),
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
        assert_eq!(err, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn normalize_session_id_rejects_invalid_uuid() {
        let err = normalize_session_id("not-a-uuid").unwrap_err();
        assert_eq!(err, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn record_session_upload_allows_first_attempt() {
        reset_rate_limit_state();
        record_session_upload_attempt("session", 100).expect("first upload should pass");
    }

    #[test]
    fn record_session_upload_blocks_fast_retries() {
        reset_rate_limit_state();
        record_session_upload_attempt("session", 200).expect("initial upload ok");

        let err = record_session_upload_attempt("session", 205).expect_err("should rate limit");
        assert_eq!(err, StatusCode::TOO_MANY_REQUESTS);

        // After enough time passes, uploads are allowed again
        record_session_upload_attempt("session", 212).expect("rate limit window expired");
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
            auto_classifications: vec![],
            geom_geojson: serde_json::json!({"type":"LineString","coordinates": coords}),
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
) -> Result<impl IntoResponse, StatusCode> {
    // Get track with slope data
    let track = match db::get_track_detail_adaptive(&pool, id, None, None)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    {
        Some(track) => track,
        None => return Err(StatusCode::NOT_FOUND),
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
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
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
) -> Result<impl IntoResponse, StatusCode> {
    use crate::track_utils::slope::recalculate_slope_metrics;

    // Get track with geometry and elevation data
    let track = match db::get_track_detail_adaptive(&pool, id, None, None)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    {
        Some(track) => track,
        None => return Err(StatusCode::NOT_FOUND),
    };

    // Check session ownership (reuse existing auth logic)
    if track.session_id != Some(request.session_id) {
        return Err(StatusCode::FORBIDDEN);
    }

    // Extract coordinates from geometry
    let geom_str = match track.geom_geojson.get("coordinates") {
        Some(coords) => coords.to_string(),
        None => return Err(StatusCode::BAD_REQUEST),
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
        Err(_) => return Err(StatusCode::BAD_REQUEST),
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
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

// ============================================================================
// POI Handlers
// ============================================================================

/// GET /pois - List POIs with optional filtering
pub async fn get_pois(
    State(pool): State<Arc<PgPool>>,
    Query(params): Query<PoiQuery>,
) -> Result<Json<PoiListResponse>, StatusCode> {
    let limit = params.limit.unwrap_or(100).min(1000);
    let offset = params.offset.unwrap_or(0);

    // Build query based on filters
    let pois = if let Some(bbox_str) = &params.bbox {
        // Parse bbox: "minLon,minLat,maxLon,maxLat"
        let bbox_parts: Vec<f64> = bbox_str.split(',').filter_map(|s| s.parse().ok()).collect();

        if bbox_parts.len() != 4 {
            error!("Invalid bbox format: {}", bbox_str);
            return Err(StatusCode::BAD_REQUEST);
        }

        sqlx::query_as::<_, Poi>(
            r#"
            SELECT 
                id, name, description, category, elevation,
                ST_AsGeoJSON(geom::geometry)::jsonb as geom,
                session_id, created_at, updated_at
            FROM pois
            WHERE ST_Intersects(
                geom::geometry, 
                ST_MakeEnvelope($1, $2, $3, $4, 4326)
            )
            ORDER BY created_at DESC
            LIMIT $5
            OFFSET $6
            "#,
        )
        .bind(bbox_parts[0])
        .bind(bbox_parts[1])
        .bind(bbox_parts[2])
        .bind(bbox_parts[3])
        .bind(limit)
        .bind(offset)
        .fetch_all(&*pool)
        .await
        .map_err(|e| {
            error!("Failed to fetch POIs: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
    } else if let Some(track_id) = params.track_id {
        // Get POIs for a specific track
        sqlx::query_as::<_, Poi>(
            r#"
            SELECT 
                p.id, p.name, p.description, p.category, p.elevation,
                ST_AsGeoJSON(p.geom::geometry)::jsonb as geom,
                p.session_id, p.created_at, p.updated_at
            FROM pois p
            JOIN track_pois tp ON p.id = tp.poi_id
            WHERE tp.track_id = $1
            ORDER BY tp.sequence_order
            LIMIT $2
            OFFSET $3
            "#,
        )
        .bind(track_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&*pool)
        .await
        .map_err(|e| {
            error!("Failed to fetch track POIs: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
    } else {
        // Get all POIs (with limit)
        sqlx::query_as::<_, Poi>(
            r#"
            SELECT 
                id, name, description, category, elevation,
                ST_AsGeoJSON(geom::geometry)::jsonb as geom,
                session_id, created_at, updated_at
            FROM pois
            ORDER BY created_at DESC
            LIMIT $1
            OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&*pool)
        .await
        .map_err(|e| {
            error!("Failed to fetch POIs: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
    };

    let total = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM pois")
        .fetch_one(&*pool)
        .await
        .map_err(|e| {
            error!("Failed to count POIs: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(PoiListResponse { pois, total }))
}

/// GET /pois/:id - Get POI details
pub async fn get_poi(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<i32>,
) -> Result<Json<Poi>, StatusCode> {
    let poi = sqlx::query_as::<_, Poi>(
        r#"
        SELECT 
            id, name, description, category, elevation,
            ST_AsGeoJSON(geom::geometry)::jsonb as geom,
            session_id, created_at, updated_at
        FROM pois
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| {
        error!("Failed to fetch POI: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(poi))
}

/// GET /tracks/:track_id/pois - Get POIs for a track with distance info
pub async fn get_track_pois(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<Uuid>,
) -> Result<Json<Vec<PoiWithDistance>>, StatusCode> {
    let rows = sqlx::query(
        r#"
        SELECT 
            p.id, p.name, p.description, p.category, p.elevation,
            ST_AsGeoJSON(p.geom::geometry)::jsonb as geom,
            p.session_id, p.created_at, p.updated_at,
            tp.distance_from_start_m, tp.sequence_order
        FROM pois p
        JOIN track_pois tp ON p.id = tp.poi_id
        WHERE tp.track_id = $1
        ORDER BY tp.sequence_order
        "#,
    )
    .bind(track_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| {
        error!("Failed to fetch track POIs: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let pois: Vec<PoiWithDistance> = rows
        .into_iter()
        .map(|row| {
            use sqlx::Row;
            PoiWithDistance {
                poi: Poi {
                    id: row.get("id"),
                    name: row.get("name"),
                    description: row.get("description"),
                    category: row.get("category"),
                    elevation: row.get("elevation"),
                    geom: row.get("geom"),
                    session_id: row.get("session_id"),
                    created_at: row.get("created_at"),
                    updated_at: row.get("updated_at"),
                },
                distance_from_start_m: row.get("distance_from_start_m"),
                sequence_order: row.get("sequence_order"),
            }
        })
        .collect();

    Ok(Json(pois))
}

/// POST /pois - Create manual POI
pub async fn create_poi(
    State(pool): State<Arc<PgPool>>,
    Json(request): Json<CreatePoiRequest>,
) -> Result<Json<Poi>, StatusCode> {
    // Validate inputs
    if request.name.trim().is_empty() {
        error!("POI name cannot be empty");
        return Err(StatusCode::BAD_REQUEST);
    }

    validate_text_field(&request.name, MAX_NAME_LENGTH, "name")?;

    if let Some(ref desc) = request.description {
        validate_text_field(desc, MAX_DESCRIPTION_LENGTH, "description")?;
    }

    let poi = sqlx::query_as::<_, Poi>(
        r#"
        INSERT INTO pois (name, description, category, elevation, geom, session_id)
        VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7)
        RETURNING 
            id, name, description, category, elevation,
            ST_AsGeoJSON(geom::geometry)::jsonb as geom,
            session_id, created_at, updated_at
        "#,
    )
    .bind(request.name.trim())
    .bind(request.description)
    .bind(request.category)
    .bind(request.elevation)
    .bind(request.lon)
    .bind(request.lat)
    .bind(request.session_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| {
        error!("Failed to create POI: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    info!("Created POI {} (id: {})", poi.name, poi.id);
    metrics::record_poi_created("manual");
    Ok(Json(poi))
}

/// DELETE /tracks/:track_id/pois/:poi_id - Unlink POI from track
pub async fn unlink_track_poi(
    State(pool): State<Arc<PgPool>>,
    Path((track_id, poi_id)): Path<(Uuid, i32)>,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query("DELETE FROM track_pois WHERE track_id = $1 AND poi_id = $2")
        .bind(track_id)
        .bind(poi_id)
        .execute(&*pool)
        .await
        .map_err(|e| {
            error!("Failed to unlink POI: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    info!("Unlinked POI {} from track {}", poi_id, track_id);
    metrics::record_poi_deleted("unlink_track");
    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /pois/:id - Delete POI (only if not used and user is owner)
pub async fn delete_poi(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<i32>,
    Json(request): Json<DeletePoiRequest>,
) -> Result<StatusCode, StatusCode> {
    // Check ownership and usage
    let poi_info = sqlx::query(
        r#"
        SELECT 
            session_id,
            (SELECT COUNT(*) FROM track_pois WHERE poi_id = $1) as usage_count
        FROM pois
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| {
        error!("Failed to check POI: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    use sqlx::Row;
    let usage_count: i64 = poi_info.get("usage_count");
    let owner_id: Option<Uuid> = poi_info.get("session_id");

    // Only allow deletion if:
    // 1. POI is not used in any track
    // 2. User is the owner (session_id matches) or POI has no owner (auto-created)
    if usage_count > 0 {
        error!("Cannot delete POI {}: used in {} tracks", id, usage_count);
        return Err(StatusCode::CONFLICT); // 409: POI is in use
    }

    if let Some(owner_session_id) = owner_id {
        if Some(owner_session_id) != request.session_id {
            error!("Cannot delete POI {}: not the owner", id);
            return Err(StatusCode::FORBIDDEN); // 403: Not the owner
        }
    }

    sqlx::query("DELETE FROM pois WHERE id = $1")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| {
            error!("Failed to delete POI: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    info!("Deleted POI {}", id);
    metrics::record_poi_deleted("delete_poi");
    Ok(StatusCode::NO_CONTENT)
}
