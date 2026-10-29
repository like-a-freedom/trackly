//! POI HTTP handlers.
//!
//! Stage 1c: handlers call `db::pois`; no raw SQL lives here.

use crate::auth::OptionalAuthUser;
use crate::db;
use crate::error::{AppError, Result};
use crate::handlers::util::{ensure_track_visible, session_id_from_headers, verify_track_owner};
use crate::input_validation::{
    MAX_CATEGORY_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, validate_text_field,
};
use crate::metrics;
use crate::models::{CreatePoiRequest, DeletePoiRequest, Poi, PoiListResponse, PoiQuery};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::info;
use uuid::Uuid;

/// Maximum accepted search string length for POI lookups.
const MAX_SEARCH_LENGTH: usize = 200;

/// Parse and validate a `"minLon,minLat,maxLon,maxLat"` bbox.
fn parse_bbox(raw: &str) -> Result<[f64; 4]> {
    let values: Vec<f64> = raw
        .split(',')
        .map(|part| {
            part.trim()
                .parse::<f64>()
                .map_err(|_| AppError::BadRequest("invalid bbox format".into()))
        })
        .collect::<Result<_>>()?;

    if values.len() != 4 || values.iter().any(|value| !value.is_finite()) {
        return Err(AppError::BadRequest("invalid bbox format".into()));
    }

    if values[0] >= values[2] || values[1] >= values[3] {
        return Err(AppError::BadRequest(
            "bbox must be minLon,minLat,maxLon,maxLat".into(),
        ));
    }

    Ok([values[0], values[1], values[2], values[3]])
}

/// Authorize a POI mutation.
///
/// Owned POIs require the matching anonymous session. Legacy POIs without an
/// owner have no session to compare, so they are editable only by an owner of
/// one of the tracks they are linked to.
async fn verify_poi_access(
    pool: &Arc<PgPool>,
    poi_id: i32,
    auth_user: &OptionalAuthUser,
    session_id: Option<Uuid>,
) -> Result<()> {
    let owner = db::owner_session_id(pool, poi_id)
        .await?
        .ok_or(AppError::NotFound)?;

    if let Some(owner) = owner {
        return if session_id == Some(owner) {
            Ok(())
        } else {
            Err(AppError::Forbidden)
        };
    }

    for track_id in db::track_ids_for_poi(pool, poi_id).await? {
        if verify_track_owner(pool, track_id, auth_user, session_id)
            .await
            .is_ok()
        {
            return Ok(());
        }
    }

    Err(AppError::Forbidden)
}

pub async fn get_pois(
    State(pool): State<Arc<PgPool>>,
    Query(params): Query<PoiQuery>,
) -> Result<Json<PoiListResponse>> {
    let limit = params.limit.unwrap_or(100).clamp(1, 1000);
    let offset = params.offset.unwrap_or(0).max(0);

    let bbox = match params.bbox.as_deref() {
        Some(raw) => Some(parse_bbox(raw)?),
        None => None,
    };

    if let Some(search) = params.search.as_deref()
        && search.chars().count() > MAX_SEARCH_LENGTH
    {
        return Err(AppError::BadRequest(format!(
            "search is too long (max {MAX_SEARCH_LENGTH} characters)"
        )));
    }

    let filter = db::PoiFilter {
        bbox,
        track_id: params.track_id,
        categories: params.categories.as_deref(),
        search: params.search.as_deref(),
    };

    let pois = db::list_filtered(&pool, &filter, limit, offset).await?;
    let total = db::count_filtered(&pool, &filter).await?;

    Ok(Json(PoiListResponse { pois, total }))
}

/// GET /pois/:id - Get POI details
pub async fn get_poi(State(pool): State<Arc<PgPool>>, Path(id): Path<i32>) -> Result<Json<Poi>> {
    let poi = db::get(&pool, id).await?.ok_or(AppError::NotFound)?;
    Ok(Json(poi))
}

/// PATCH /pois/:id - Update POI details
pub async fn update_poi(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<i32>,
    auth_user: OptionalAuthUser,
    headers: HeaderMap,
    Json(request): Json<crate::models::UpdatePoiRequest>,
) -> Result<Json<Poi>> {
    let has_changes =
        request.name.is_some() || request.description.is_some() || request.category.is_some();
    if !has_changes {
        return Err(AppError::BadRequest("no changes provided".into()));
    }

    if let Some(name) = request.name.as_deref() {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest("name cannot be empty".into()));
        }
        validate_text_field(name, MAX_NAME_LENGTH, "name")?;
    }

    if let Some(Some(desc)) = request.description.as_ref() {
        validate_text_field(desc, MAX_DESCRIPTION_LENGTH, "description")?;
    }

    if let Some(Some(cat)) = request.category.as_ref() {
        validate_text_field(cat, MAX_CATEGORY_LENGTH, "category")?;
    }

    let session_id = request
        .session_id
        .or_else(|| session_id_from_headers(&headers));

    verify_poi_access(&pool, id, &auth_user, session_id).await?;

    let poi = db::update(&pool, id, &request).await?;

    info!("Updated POI {}", poi.id);
    Ok(Json(poi))
}

/// GET /tracks/:track_id/pois - Get POIs for a track with distance info
pub async fn get_track_pois(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<Uuid>,
    auth_user: OptionalAuthUser,
    headers: HeaderMap,
) -> Result<Json<Vec<crate::models::PoiWithDistance>>> {
    ensure_track_visible(
        &pool,
        track_id,
        &auth_user,
        session_id_from_headers(&headers),
    )
    .await?;

    let pois = db::find_by_track_with_distance(&pool, track_id).await?;
    Ok(Json(pois))
}

/// POST /pois - Create manual POI
pub async fn create_poi(
    State(pool): State<Arc<PgPool>>,
    headers: HeaderMap,
    Json(mut request): Json<CreatePoiRequest>,
) -> Result<Json<Poi>> {
    // Every POI must have an owner, otherwise any client could later edit it.
    let session_id = request
        .session_id
        .or_else(|| session_id_from_headers(&headers))
        .ok_or_else(|| AppError::BadRequest("session_id is required".into()))?;
    request.session_id = Some(session_id);

    // Validate inputs
    if request.name.trim().is_empty() {
        return Err(AppError::BadRequest("POI name cannot be empty".into()));
    }

    validate_text_field(&request.name, MAX_NAME_LENGTH, "name")?;

    if let Some(ref desc) = request.description {
        validate_text_field(desc, MAX_DESCRIPTION_LENGTH, "description")?;
    }

    if !request.lat.is_finite()
        || !request.lon.is_finite()
        || !(-90.0..=90.0).contains(&request.lat)
        || !(-180.0..=180.0).contains(&request.lon)
    {
        return Err(AppError::BadRequest(
            "Coordinates must be finite and within valid latitude/longitude ranges".into(),
        ));
    }

    let poi = db::create(&pool, &request).await?;

    info!("Created POI {} (id: {})", poi.name, poi.id);
    metrics::record_poi_created("manual");
    Ok(Json(poi))
}

/// DELETE /tracks/:track_id/pois/:poi_id - Unlink POI from track
pub async fn unlink_track_poi(
    State(pool): State<Arc<PgPool>>,
    Path((track_id, poi_id)): Path<(Uuid, i32)>,
    auth_user: OptionalAuthUser,
    headers: HeaderMap,
) -> Result<StatusCode> {
    verify_track_owner(
        &pool,
        track_id,
        &auth_user,
        session_id_from_headers(&headers),
    )
    .await?;

    let affected = db::unlink_from_track(&pool, track_id, poi_id).await?;

    if affected == 0 {
        return Err(AppError::NotFound);
    }

    info!("Unlinked POI {} from track {}", poi_id, track_id);
    metrics::record_poi_deleted("unlink_track");
    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /pois/:id - Delete POI (only if not used and user is owner)
pub async fn delete_poi(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<i32>,
    auth_user: OptionalAuthUser,
    headers: HeaderMap,
    Json(request): Json<DeletePoiRequest>,
) -> Result<StatusCode> {
    let session_id = request
        .session_id
        .or_else(|| session_id_from_headers(&headers));

    verify_poi_access(&pool, id, &auth_user, session_id).await?;

    let usage_count = db::usage_count(&pool, id).await?;
    if usage_count > 0 {
        return Err(AppError::Conflict("POI is in use".into()));
    }

    db::delete(&pool, id).await?;

    info!("Deleted POI {}", id);
    metrics::record_poi_deleted("delete_poi");
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_bbox_accepts_valid_bbox() {
        assert_eq!(
            parse_bbox("2.0,48.0,3.0,49.0").expect("valid bbox"),
            [2.0, 48.0, 3.0, 49.0]
        );
    }

    #[test]
    fn parse_bbox_rejects_wrong_length() {
        assert!(matches!(parse_bbox("1,2,3"), Err(AppError::BadRequest(_))));
        assert!(matches!(
            parse_bbox("1,2,3,4,5"),
            Err(AppError::BadRequest(_))
        ));
    }

    #[test]
    fn parse_bbox_rejects_non_finite_and_non_numeric() {
        assert!(matches!(
            parse_bbox("1,2,3,NaN"),
            Err(AppError::BadRequest(_))
        ));
        assert!(matches!(
            parse_bbox("a,b,c,d"),
            Err(AppError::BadRequest(_))
        ));
    }

    #[test]
    fn parse_bbox_rejects_inverted_or_empty_bbox() {
        // min must be strictly less than max
        assert!(matches!(
            parse_bbox("3.0,48.0,2.0,49.0"),
            Err(AppError::BadRequest(_))
        ));
        assert!(matches!(
            parse_bbox("2.0,48.0,3.0,48.0"),
            Err(AppError::BadRequest(_))
        ));
    }

    // POI mutation authorization requires a database; gated so the default
    // `cargo test` stays green without DATABASE_URL.
    async fn maybe_pool() -> Option<Arc<PgPool>> {
        let url = std::env::var("DATABASE_URL").ok()?;
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .ok()?;
        Some(Arc::new(pool))
    }

    fn poi_request(name: &str, session_id: Option<Uuid>) -> CreatePoiRequest {
        CreatePoiRequest {
            name: name.into(),
            description: None,
            category: Some("water".into()),
            elevation: None,
            lon: 37.0,
            lat: 55.0,
            session_id,
        }
    }

    /// An owned POI is writable only by its session: the owner passes, any
    /// other session and a header-less caller are rejected.
    #[tokio::test]
    async fn verify_poi_access_requires_matching_owner_session() {
        let Some(pool) = maybe_pool().await else {
            return; // no DATABASE_URL: skip
        };
        let owner = Uuid::new_v4();
        let intruder = Uuid::new_v4();
        // `pois.session_id` references `sessions`, so the owner must exist.
        sqlx::query("INSERT INTO sessions (id) VALUES ($1)")
            .bind(owner)
            .execute(&*pool)
            .await
            .expect("insert fixture session");
        let poi = db::create(&pool, &poi_request("access fixture", Some(owner)))
            .await
            .expect("create poi");

        let as_owner = verify_poi_access(&pool, poi.id, &OptionalAuthUser(None), Some(owner)).await;
        assert!(as_owner.is_ok(), "owner session must be allowed");

        let as_intruder =
            verify_poi_access(&pool, poi.id, &OptionalAuthUser(None), Some(intruder)).await;
        assert!(
            matches!(as_intruder, Err(AppError::Forbidden)),
            "foreign session must be forbidden"
        );

        let anonymous = verify_poi_access(&pool, poi.id, &OptionalAuthUser(None), None).await;
        assert!(
            matches!(anonymous, Err(AppError::Forbidden)),
            "missing session must be forbidden for an owned POI"
        );

        db::delete(&pool, poi.id).await.expect("remove fixture poi");
        sqlx::query("DELETE FROM sessions WHERE id = $1")
            .bind(owner)
            .execute(&*pool)
            .await
            .expect("remove fixture session");
    }

    /// A POI with no owner session falls back to track ownership, so a caller
    /// with no identity at all is rejected even though the POI itself is free.
    #[tokio::test]
    async fn verify_poi_access_rejects_unowned_poi_without_identity() {
        let Some(pool) = maybe_pool().await else {
            return; // no DATABASE_URL: skip
        };
        let poi = db::create(&pool, &poi_request("legacy access fixture", None))
            .await
            .expect("create poi");

        let anonymous = verify_poi_access(&pool, poi.id, &OptionalAuthUser(None), None).await;
        assert!(
            matches!(anonymous, Err(AppError::Forbidden)),
            "legacy POI must not be writable without a track-owning identity"
        );

        db::delete(&pool, poi.id).await.expect("remove fixture poi");
    }
}
