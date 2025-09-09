use crate::db;
use crate::models::*;
use crate::track_utils::{
    self, calculate_file_hash, parse_gpx_full, parse_gpx_minimal, ElevationEnrichmentService,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use axum_extra::extract::multipart::Multipart as AxumMultipart;
use once_cell::sync::Lazy;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio;
use tracing::{debug, error, info};
use uuid::Uuid;

// Security constants
static MAX_FILE_SIZE: Lazy<usize> = Lazy::new(|| {
    std::env::var("MAX_FILE_SIZE")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(50 * 1024 * 1024) // Default 50MB
});
const MAX_FIELD_SIZE: usize = 10 * 1024; // 10KB for text fields
const MAX_CATEGORIES: usize = 50;
const MAX_CATEGORY_LENGTH: usize = 100;
const MAX_NAME_LENGTH: usize = 256;
const MAX_DESCRIPTION_LENGTH: usize = 50000;
const ALLOWED_EXTENSIONS: &[&str] = &["gpx", "kml"];

// Security validation functions
fn validate_file_size(size: usize) -> Result<(), StatusCode> {
    if size > *MAX_FILE_SIZE {
        error!("File size {} exceeds maximum {}", size, *MAX_FILE_SIZE);
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }
    Ok(())
}

fn validate_text_field(text: &str, max_len: usize, field_name: &str) -> Result<(), StatusCode> {
    if text.len() > max_len {
        error!(
            "{} length {} exceeds maximum {}",
            field_name,
            text.len(),
            max_len
        );
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(())
}

fn validate_file_extension(filename: &str) -> Result<String, StatusCode> {
    let ext = filename.split('.').next_back().unwrap_or("").to_lowercase();
    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        error!("File extension '{}' not allowed", ext);
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(ext)
}

fn sanitize_input(input: &str) -> String {
    input
        .trim()
        .chars()
        .filter(|c| c.is_alphanumeric() || " .,;:!?-_()[]{}".contains(*c))
        .collect()
}

// Safe error handling - don't expose internal details
fn handle_db_error(err: sqlx::Error) -> StatusCode {
    error!("Database error occurred: {}", err);
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

pub async fn upload_track(
    State(pool): State<Arc<PgPool>>,
    mut multipart: AxumMultipart,
) -> Result<Json<TrackUploadResponse>, StatusCode> {
    info!("[upload_track] called");
    let mut name = None;
    let mut description = None;
    let mut categories = Vec::new();
    let mut session_id = None;
    let mut file_bytes = None;
    let mut file_name = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        error!("Failed to get next field: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })? {
        debug!(field_name = ?field.name(), "[upload_track] got field");
        if let Some(field_name) = field.name() {
            match field_name {
                "name" => {
                    let name_text = field.text().await.map_err(|e| {
                        error!("Failed to get text from field 'name': {}", e);
                        StatusCode::BAD_REQUEST
                    })?;
                    validate_text_field(&name_text, MAX_NAME_LENGTH, "name")?;
                    name = Some(name_text);
                }
                "description" => {
                    let desc_text = field.text().await.map_err(|e| {
                        error!("Failed to get text from field 'description': {}", e);
                        StatusCode::BAD_REQUEST
                    })?;
                    validate_text_field(&desc_text, MAX_DESCRIPTION_LENGTH, "description")?;
                    description = Some(desc_text);
                }
                "categories" => {
                    let cats = field.text().await.map_err(|e| {
                        error!("Failed to get text from field 'categories': {}", e);
                        StatusCode::BAD_REQUEST
                    })?;
                    validate_text_field(&cats, MAX_FIELD_SIZE, "categories")?;
                    categories = cats.split(',').map(|s| s.trim().to_string()).collect();
                    if categories.len() > MAX_CATEGORIES {
                        error!("Too many categories: {}", categories.len());
                        return Err(StatusCode::BAD_REQUEST);
                    }
                    for cat in &categories {
                        validate_text_field(cat, MAX_CATEGORY_LENGTH, "category")?;
                    }
                }
                "session_id" => {
                    let sid_str = field.text().await.map_err(|e| {
                        error!("Failed to get text from field 'session_id': {}", e);
                        StatusCode::BAD_REQUEST
                    })?;
                    session_id = match Uuid::parse_str(&sid_str) {
                        Ok(uuid) => Some(uuid),
                        Err(e) => {
                            error!("Failed to parse session_id '{}': {}", sid_str, e);
                            return Err(StatusCode::BAD_REQUEST);
                        }
                    };
                    // --- Rate limiting check ---
                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_secs();
                    let mut map = LAST_UPLOAD.lock().unwrap();
                    let key = sid_str.clone();
                    if let Some(&last) = map.get(&key) {
                        if now < last + *UPLOAD_RATE_LIMIT_SECONDS {
                            error!("[upload_track] rate limit hit for session_id: {}", key);
                            return Err(StatusCode::TOO_MANY_REQUESTS);
                        }
                    }
                    map.insert(key, now);
                    // --- End rate limiting ---
                }
                "file" => {
                    file_name = field.file_name().map(|s| s.to_string());
                    let bytes = field.bytes().await.map_err(|e| {
                        error!("Failed to get bytes from field 'file': {}", e);
                        StatusCode::PAYLOAD_TOO_LARGE
                    })?;

                    // Validate file size
                    validate_file_size(bytes.len())?;

                    // Validate file extension if filename is provided
                    if let Some(ref fname) = file_name {
                        validate_file_extension(fname)?;
                    }

                    file_bytes = Some(bytes);
                }
                _ => {}
            }
        }
    }
    let file_bytes = match file_bytes {
        Some(b) => b,
        None => {
            error!("[upload_track] no file provided");
            return Err(StatusCode::BAD_REQUEST);
        }
    };
    let file_name = match file_name {
        Some(f) => f,
        None => {
            error!("[upload_track] no file name provided");
            return Err(StatusCode::BAD_REQUEST);
        }
    };

    // Validate and sanitize inputs
    let ext = validate_file_extension(&file_name)?;

    // Validate text fields
    if let Some(ref n) = name {
        validate_text_field(n, MAX_NAME_LENGTH, "name")?;
    }
    if let Some(ref d) = description {
        validate_text_field(d, MAX_DESCRIPTION_LENGTH, "description")?;
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

    // Phase 1: Fast minimal parsing for duplicate check (GPX only for now)
    // This dramatically improves performance for large files
    let parsed_data = if ext == "gpx" {
        // First do minimal parsing for duplicate check
        let minimal_data = parse_gpx_minimal(&file_bytes).map_err(|e| {
            error!(?e, "[upload_track] failed to parse gpx minimally");
            StatusCode::UNPROCESSABLE_ENTITY
        })?;

        // Check for duplicates using the hash from minimal parsing
        if db::track_exists(&pool, &minimal_data.hash)
            .await
            .map_err(|e| {
                error!(?e, "[upload_track] db error on dedup");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .is_some()
        {
            return Err(StatusCode::CONFLICT);
        }

        // Phase 2: Full parsing only if not a duplicate
        parse_gpx_full(&file_bytes).map_err(|e| {
            error!(?e, "[upload_track] failed to parse gpx fully");
            StatusCode::UNPROCESSABLE_ENTITY
        })?
    } else if ext == "kml" {
        // KML still uses old approach for now
        let parsed = track_utils::parse_kml(&file_bytes).map_err(|e| {
            error!(?e, "[upload_track] failed to parse kml");
            StatusCode::UNPROCESSABLE_ENTITY
        })?;

        // Check for duplicates
        if db::track_exists(&pool, &parsed.hash)
            .await
            .map_err(|e| {
                error!(?e, "[upload_track] db error on dedup");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .is_some()
        {
            return Err(StatusCode::CONFLICT);
        }

        parsed
    } else {
        error!("[upload_track] unsupported file type: {}", ext);
        return Err(StatusCode::BAD_REQUEST);
    };
    let id = Uuid::new_v4();
    let name: String = name
        .map(|n| sanitize_input(&n))
        .or_else(|| Some(sanitize_input(&file_name)))
        .unwrap_or("Unnamed track".to_string());

    let description = description.map(|d| sanitize_input(&d));
    let categories: Vec<String> = categories.into_iter().map(|c| sanitize_input(&c)).collect();
    let cats: Vec<&str> = categories.iter().map(|s| s.as_str()).collect();
    let elevation_profile_json = match parsed_data.elevation_profile {
        Some(profile) => serde_json::to_value(profile).ok(),
        None => None,
    };
    let hr_data_json = match parsed_data.hr_data {
        Some(hr_data) => serde_json::to_value(hr_data).ok(),
        None => None,
    };
    let time_data_json = match parsed_data.time_data {
        Some(time_data) => serde_json::to_value(time_data).ok(),
        None => None,
    };
    let temp_data_json = match parsed_data.temp_data {
        Some(temp_data) => serde_json::to_value(temp_data).ok(),
        None => None,
    };
    db::insert_track(db::InsertTrackParams {
        pool: &pool,
        id,
        name: &name,
        description,
        categories: &cats,
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
        elevation_enriched: Some(false), // Initially not enriched
        elevation_enriched_at: None,
        elevation_dataset: Some("original_gpx".to_string()), // Mark as original data from GPX/KML
        elevation_api_calls: Some(0),                        // No API calls used initially
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
        session_id,
    })
    .await
    .map_err(|e| {
        error!(?e, "[upload_track] db error on insert");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    info!(?id, "[upload_track] track uploaded successfully");

    // Check if track needs automatic elevation enrichment
    let needs_enrichment = parsed_data.elevation_gain.is_none()
        || parsed_data.elevation_gain == Some(0.0)
        || parsed_data.elevation_loss.is_none()
        || parsed_data.elevation_loss == Some(0.0);

    if needs_enrichment {
        info!(
            ?id,
            "[upload_track] track has no elevation data, starting automatic enrichment"
        );

        // Extract coordinates for enrichment
        let coordinates = match extract_coordinates_from_geojson(&parsed_data.geom_geojson) {
            Ok(coords) if !coords.is_empty() => coords,
            Ok(_) => {
                info!(
                    ?id,
                    "[upload_track] track has no coordinates for enrichment, skipping"
                );
                return Ok(Json(TrackUploadResponse {
                    id,
                    url: format!("/tracks/{id}"),
                }));
            }
            Err(e) => {
                error!(
                    ?id,
                    "[upload_track] failed to extract coordinates for enrichment: {}", e
                );
                return Ok(Json(TrackUploadResponse {
                    id,
                    url: format!("/tracks/{id}"),
                }));
            }
        };

        // Start asynchronous elevation enrichment
        let pool_clone = Arc::clone(&pool);
        let track_id = id;
        tokio::spawn(async move {
            let enrichment_service = ElevationEnrichmentService::new();

            match enrichment_service.enrich_track_elevation(coordinates).await {
                Ok(result) => {
                    // Update track with enriched elevation data
                    if let Err(e) = db::update_track_elevation(
                        &pool_clone,
                        track_id,
                        db::UpdateElevationParams {
                            elevation_gain: result.metrics.elevation_gain,
                            elevation_loss: result.metrics.elevation_loss,
                            elevation_min: result.metrics.elevation_min,
                            elevation_max: result.metrics.elevation_max,
                            elevation_enriched: true,
                            elevation_enriched_at: Some(result.enriched_at.naive_utc()),
                            elevation_dataset: Some(result.dataset.clone()),
                            elevation_profile: result.elevation_profile,
                            elevation_api_calls: result.api_calls_used,
                        },
                    )
                    .await
                    {
                        error!(?track_id, "Failed to update enriched elevation data: {}", e);
                    } else {
                        info!(
                            ?track_id,
                            "Successfully auto-enriched track with elevation data: gain={:.1}m, loss={:.1}m",
                            result.metrics.elevation_gain.unwrap_or(0.0),
                            result.metrics.elevation_loss.unwrap_or(0.0)
                        );
                    }
                }
                Err(e) => {
                    error!(?track_id, "Failed to auto-enrich track elevation: {}", e);
                }
            }
        });
    }

    Ok(Json(TrackUploadResponse {
        id,
        url: format!("/tracks/{id}"),
    }))
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
) -> Result<Json<TrackDetail>, StatusCode> {
    info!(?id, ?params.zoom, ?params.mode, "[get_track] called");

    // Use adaptive track detail if zoom/mode params are provided
    let result = if params.zoom.is_some() || params.mode.is_some() {
        db::get_track_detail_adaptive(&pool, id, params.zoom, params.mode.as_deref()).await
    } else {
        db::get_track_detail(&pool, id).await
    };

    match result {
        Ok(Some(track)) => Ok(Json(track)),
        Ok(None) => {
            error!(?id, "[get_track] not found");
            Err(StatusCode::NOT_FOUND)
        }
        Err(e) => {
            error!(?e, "[get_track] db error");
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_track_simplified(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
    Query(params): Query<TrackSimplificationQuery>,
) -> Result<Json<TrackSimplified>, StatusCode> {
    info!(?id, ?params.zoom, ?params.mode, "[get_track_simplified] called");

    match db::get_track_detail_adaptive(&pool, id, params.zoom, params.mode.as_deref()).await {
        Ok(Some(track)) => {
            // Convert TrackDetail to TrackSimplified
            let simplified = TrackSimplified {
                id: track.id,
                name: track.name,
                description: track.description,
                categories: track.categories,
                geom_geojson: track.geom_geojson,
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
            };

            tracing::info!(
                track_id = %id,
                zoom = params.zoom.unwrap_or(15.0),
                mode = params.mode.as_deref().unwrap_or("detail"),
                "[PERF] get_track_simplified completed with adaptive optimization"
            );

            Ok(Json(simplified))
        }
        Ok(None) => {
            error!(?id, "[get_track_simplified] not found");
            Err(StatusCode::NOT_FOUND)
        }
        Err(e) => {
            error!(?e, "[get_track_simplified] db error");
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
    Ok(StatusCode::NO_CONTENT)
}

pub async fn search_tracks(
    State(pool): State<Arc<PgPool>>,
    Query(params): Query<TrackSearchQuery>,
) -> Result<Json<Vec<TrackSearchResult>>, StatusCode> {
    if params.query.trim().is_empty() {
        return Ok(Json(vec![]));
    }

    let tracks = db::search_tracks(&pool, &params.query).await.map_err(|e| {
        error!("Failed to search tracks: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(tracks))
}

pub async fn health() -> &'static str {
    info!("[health] called");
    "ok"
}

pub async fn export_track_gpx(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<Uuid>,
) -> Result<axum::response::Response<axum::body::Body>, StatusCode> {
    info!(?id, "[export_track_gpx] called");

    match db::get_track_detail(&pool, id).await {
        Ok(Some(track)) => {
            let gpx_content = generate_gpx_from_track(&track);

            let response = axum::response::Response::builder()
                .header("Content-Type", "application/gpx+xml")
                .header(
                    "Content-Disposition",
                    format!(
                        "attachment; filename=\"{name}.gpx\"",
                        name = sanitize_filename(&track.name)
                    ),
                )
                .body(axum::body::Body::from(gpx_content))
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

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
            error!("Failed to get track {}: {}", id, e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or_else(|| {
            error!("Track {} not found", id);
            StatusCode::NOT_FOUND
        })?;

    // Check ownership
    if track.session_id != Some(payload.session_id) {
        error!("Permission denied for track {}: user session mismatch", id);
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
        info!(
            "Track {} already has elevation data, skipping enrichment",
            id
        );
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
            error!("Track {} has no coordinates", id);
            return Err(StatusCode::BAD_REQUEST);
        }
        Err(e) => {
            error!("Failed to extract coordinates from track {}: {}", id, e);
            return Err(StatusCode::BAD_REQUEST);
        }
    };

    info!(
        "Starting elevation enrichment for track {} with {} points",
        id,
        coordinates.len()
    );

    // Enrich elevation data
    let enrichment_result = match enrichment_service.enrich_track_elevation(coordinates).await {
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
            elevation_profile: enrichment_result.elevation_profile,
            elevation_api_calls: enrichment_result.api_calls_used,
        },
    )
    .await
    {
        error!("Failed to update elevation data for track {}: {}", id, e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    info!(
        "Successfully enriched track {} with elevation data: gain={:.1}m, loss={:.1}m",
        id,
        enrichment_result.metrics.elevation_gain.unwrap_or(0.0),
        enrichment_result.metrics.elevation_loss.unwrap_or(0.0)
    );

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

/// Extract coordinates from GeoJSON LineString
fn extract_coordinates_from_geojson(
    geom_geojson: &serde_json::Value,
) -> Result<Vec<(f64, f64)>, String> {
    let coordinates = geom_geojson
        .get("coordinates")
        .ok_or("Missing coordinates in geometry")?
        .as_array()
        .ok_or("Coordinates is not an array")?;

    let mut result = Vec::new();
    for coord in coordinates {
        let coord_array = coord.as_array().ok_or("Coordinate is not an array")?;
        if coord_array.len() < 2 {
            return Err("Coordinate must have at least 2 elements".to_string());
        }

        let lon = coord_array[0].as_f64().ok_or("Longitude is not a number")?;
        let lat = coord_array[1].as_f64().ok_or("Latitude is not a number")?;

        result.push((lat, lon));
    }

    Ok(result)
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim()
        .to_string()
        .replace(' ', "_")
}

fn generate_gpx_from_track(track: &crate::models::TrackDetail) -> String {
    use chrono::Utc;

    let created_at = track
        .created_at
        .unwrap_or(Utc::now())
        .format("%Y-%m-%dT%H:%M:%SZ");

    // Extract coordinates from GeoJSON
    let coordinates = if let Some(coords) = track.geom_geojson.get("coordinates") {
        if let Some(coord_array) = coords.as_array() {
            coord_array
                .iter()
                .filter_map(|coord| {
                    if let Some(pair) = coord.as_array() {
                        if pair.len() >= 2 {
                            let lon = pair[0].as_f64()?;
                            let lat = pair[1].as_f64()?;
                            Some((lat, lon))
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };

    // Generate track points with elevation data if available
    let mut track_points = String::new();
    for (i, (lat, lon)) in coordinates.iter().enumerate() {
        let elevation = if let Some(elevation_profile) = &track.elevation_profile {
            if let Some(elevation_array) = elevation_profile.as_array() {
                if i < elevation_array.len() {
                    if let Some(ele_val) = elevation_array[i].as_f64() {
                        format!("<ele>{ele_val:.1}</ele>")
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        let hr_data = if let Some(hr_data) = &track.hr_data {
            if let Some(hr_array) = hr_data.as_array() {
                if i < hr_array.len() {
                    if let Some(hr_val) = hr_array[i].as_i64() {
                        format!(
                            "<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>{hr_val}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>"
                        )
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        let time_data = if let Some(time_data) = &track.time_data {
            if let Some(time_array) = time_data.as_array() {
                if i < time_array.len() {
                    if let Some(time_str) = time_array[i].as_str() {
                        format!("<time>{}</time>", xml_escape(time_str))
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        track_points.push_str(&format!(
            "      <trkpt lat=\"{lat:.7}\" lon=\"{lon:.7}\">{elevation}{time_data}{hr_data}</trkpt>\n"
        ));
    }

    let track_name = xml_escape(&track.name);
    let track_description = track
        .description
        .as_ref()
        .map(|d| xml_escape(d))
        .unwrap_or_default();

    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Trackly" 
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>{track_name}</name>
    <desc>{track_description}</desc>
    <time>{created_at}</time>
  </metadata>
  <trk>
    <name>{track_name}</name>
    <desc>{track_description}</desc>
    <trkseg>
{track_points}    </trkseg>
  </trk>
</gpx>"#
    )
}

fn xml_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use serde_json::json;
    use uuid::Uuid;

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("My Track"), "My_Track");
        assert_eq!(sanitize_filename("Track/Name"), "Track_Name");
        assert_eq!(sanitize_filename("Track<>Name"), "Track__Name");
        assert_eq!(sanitize_filename("  Track  "), "Track");
    }

    #[test]
    fn test_xml_escape() {
        assert_eq!(xml_escape("Test & Track"), "Test &amp; Track");
        assert_eq!(xml_escape("Track <name>"), "Track &lt;name&gt;");
        assert_eq!(xml_escape("Track \"quoted\""), "Track &quot;quoted&quot;");
    }

    #[test]
    fn test_generate_gpx_from_track() {
        let track = crate::models::TrackDetail {
            id: Uuid::new_v4(),
            name: "Test Track".to_string(),
            description: Some("Test Description".to_string()),
            categories: vec!["running".to_string()],
            auto_classifications: vec![],
            geom_geojson: json!({
                "type": "LineString",
                "coordinates": [[37.6176, 55.7558], [37.6177, 55.7559]]
            }),
            length_km: 0.1,
            elevation_profile: Some(json!([200.0, 210.0])),
            hr_data: Some(json!([120, 125])),
            temp_data: None,
            time_data: None,
            elevation_gain: Some(10.0),
            elevation_loss: Some(0.0),
            elevation_min: Some(200.0),
            elevation_max: Some(210.0),
            elevation_enriched: Some(false),
            elevation_enriched_at: None,
            elevation_dataset: None,
            avg_speed: Some(10.0),
            avg_hr: Some(122),
            hr_min: Some(120),
            hr_max: Some(125),
            moving_time: Some(60),
            pause_time: Some(0),
            moving_avg_speed: Some(10.0),
            moving_avg_pace: Some(6.0),
            duration_seconds: Some(60),
            recorded_at: Some(Utc::now()),
            created_at: Some(Utc::now()),
            updated_at: Some(Utc::now()),
            session_id: Some(Uuid::new_v4()),
        };

        let gpx = generate_gpx_from_track(&track);

        assert!(gpx.contains("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        assert!(gpx.contains("<gpx version=\"1.1\" creator=\"Trackly\""));
        assert!(gpx.contains("<name>Test Track</name>"));
        assert!(gpx.contains("<desc>Test Description</desc>"));
        assert!(gpx.contains("lat=\"55.7558000\" lon=\"37.6176000\""));
        assert!(gpx.contains("<ele>200.0</ele>"));
        assert!(gpx.contains("<gpxtpx:hr>120</gpxtpx:hr>"));
    }

    #[test]
    fn test_generate_gpx_from_track_with_time_data() {
        let track = crate::models::TrackDetail {
            id: Uuid::new_v4(),
            name: "Track with Time".to_string(),
            description: Some("Track with timestamps".to_string()),
            categories: vec!["running".to_string()],
            auto_classifications: vec![],
            geom_geojson: json!({
                "type": "LineString",
                "coordinates": [[37.6176, 55.7558], [37.6177, 55.7559]]
            }),
            length_km: 0.1,
            elevation_profile: Some(json!([200.0, 210.0])),
            hr_data: Some(json!([120, 125])),
            temp_data: None,
            time_data: Some(json!(["2024-01-01T10:00:00Z", "2024-01-01T10:01:00Z"])),
            elevation_gain: Some(10.0),
            elevation_loss: Some(0.0),
            elevation_min: Some(200.0),
            elevation_max: Some(210.0),
            elevation_enriched: Some(false),
            elevation_enriched_at: None,
            elevation_dataset: None,
            avg_speed: Some(10.0),
            avg_hr: Some(122),
            hr_min: Some(120),
            hr_max: Some(125),
            moving_time: Some(60),
            pause_time: Some(0),
            moving_avg_speed: Some(10.0),
            moving_avg_pace: Some(6.0),
            duration_seconds: Some(60),
            recorded_at: Some(Utc::now()),
            created_at: Some(Utc::now()),
            updated_at: Some(Utc::now()),
            session_id: Some(Uuid::new_v4()),
        };

        let gpx = generate_gpx_from_track(&track);

        assert!(gpx.contains("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        assert!(gpx.contains("<gpx version=\"1.1\" creator=\"Trackly\""));
        assert!(gpx.contains("<name>Track with Time</name>"));
        assert!(gpx.contains("lat=\"55.7558000\" lon=\"37.6176000\""));
        assert!(gpx.contains("<ele>200.0</ele>"));
        assert!(gpx.contains("<gpxtpx:hr>120</gpxtpx:hr>"));
        assert!(gpx.contains("<time>2024-01-01T10:00:00Z</time>"));
        assert!(gpx.contains("<time>2024-01-01T10:01:00Z</time>"));
    }

    // Tests for elevation-related functionality
    #[test]
    fn test_extract_coordinates_from_geojson_valid() {
        let geojson = json!({
            "type": "LineString",
            "coordinates": [[37.6176, 55.7558], [37.6177, 55.7559], [37.6178, 55.7560]]
        });

        let result = extract_coordinates_from_geojson(&geojson);
        assert!(result.is_ok());

        let coordinates = result.unwrap();
        assert_eq!(coordinates.len(), 3);
        assert_eq!(coordinates[0], (55.7558, 37.6176));
        assert_eq!(coordinates[1], (55.7559, 37.6177));
        assert_eq!(coordinates[2], (55.7560, 37.6178));
    }

    #[test]
    fn test_extract_coordinates_from_geojson_invalid() {
        // Test missing coordinates
        let invalid_geojson1 = json!({
            "type": "LineString"
        });
        assert!(extract_coordinates_from_geojson(&invalid_geojson1).is_err());

        // Test coordinates not an array
        let invalid_geojson2 = json!({
            "type": "LineString",
            "coordinates": "not_an_array"
        });
        assert!(extract_coordinates_from_geojson(&invalid_geojson2).is_err());

        // Test coordinate with insufficient elements
        let invalid_geojson3 = json!({
            "type": "LineString",
            "coordinates": [[37.6176]]
        });
        assert!(extract_coordinates_from_geojson(&invalid_geojson3).is_err());

        // Test non-numeric coordinates
        let invalid_geojson4 = json!({
            "type": "LineString",
            "coordinates": [["not_a_number", 55.7558]]
        });
        assert!(extract_coordinates_from_geojson(&invalid_geojson4).is_err());
    }

    #[test]
    fn test_extract_coordinates_empty() {
        let empty_geojson = json!({
            "type": "LineString",
            "coordinates": []
        });

        let result = extract_coordinates_from_geojson(&empty_geojson);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_extract_coordinates_with_elevation() {
        let geojson_with_elevation = json!({
            "type": "LineString",
            "coordinates": [
                [37.6176, 55.7558, 100.0],
                [37.6177, 55.7559, 110.0],
                [37.6178, 55.7560, 90.0]
            ]
        });

        let result = extract_coordinates_from_geojson(&geojson_with_elevation);
        assert!(result.is_ok());

        let coordinates = result.unwrap();
        assert_eq!(coordinates.len(), 3);
        // Should only extract lat/lon, ignoring elevation
        assert_eq!(coordinates[0], (55.7558, 37.6176));
        assert_eq!(coordinates[1], (55.7559, 37.6177));
        assert_eq!(coordinates[2], (55.7560, 37.6178));
    }

    #[test]
    fn test_extract_coordinates_edge_cases() {
        // Test with extreme coordinate values
        let extreme_geojson = json!({
            "type": "LineString",
            "coordinates": [
                [-180.0, -90.0],
                [180.0, 90.0],
                [0.0, 0.0]
            ]
        });

        let result = extract_coordinates_from_geojson(&extreme_geojson);
        assert!(result.is_ok());

        let coordinates = result.unwrap();
        assert_eq!(coordinates.len(), 3);
        assert_eq!(coordinates[0], (-90.0, -180.0));
        assert_eq!(coordinates[1], (90.0, 180.0));
        assert_eq!(coordinates[2], (0.0, 0.0));
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
            elevation_gain: Some(100.0),
            elevation_loss: Some(90.0),
            elevation_min: Some(200.0),
            elevation_max: Some(300.0),
            elevation_enriched: Some(true),
            elevation_enriched_at: None,
            elevation_dataset: Some("srtm90m".to_string()),
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
}
