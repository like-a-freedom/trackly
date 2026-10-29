//! Track listing handlers.
//!
//! - GET /api/tracks           → list_tracks_geojson
//! - GET /api/tracks/heatmap   → list_tracks_heatmap
//! - GET /api/account/tracks   → list_account_tracks

use axum::{
    Json,
    extract::{Query, State},
    http::HeaderMap,
};

use sqlx::PgPool;
use std::sync::Arc;

use crate::auth::{AuthUser, OptionalAuthUser};
use crate::db;
use crate::error::Result;
use crate::handlers::util::session_id_from_headers;
use crate::models::{HeatmapPoint, TrackGeoJsonCollection, TrackGeoJsonQuery};

/// Query parameters for listing a user's tracks (account page).
#[derive(Debug, serde::Deserialize)]
pub struct UserTracksQuery {
    pub sort: Option<String>,
    pub order: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Response for user's track list.
#[derive(Debug, serde::Serialize)]
pub struct UserTracksResponse {
    pub tracks: Vec<db::UserTrackSummary>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

/// List tracks as GeoJSON features for the map.
///
/// GET /api/tracks?bbox=...&zoom=...&mode=...
///
/// Supports bbox filtering, zoom-based simplification, and ownership filtering.
pub async fn list_tracks_geojson(
    State(pool): State<Arc<PgPool>>,
    auth_user: OptionalAuthUser,
    headers: HeaderMap,
    Query(mut params): Query<TrackGeoJsonQuery>,
) -> Result<Json<TrackGeoJsonCollection>> {
    bind_owner_filter(&mut params, &auth_user, &headers);

    let bbox = params.bbox.as_deref();
    let zoom = params.zoom;
    let mode = params.mode.as_deref();

    let collection = db::list_tracks_geojson(&pool, bbox, zoom, mode, &params).await?;
    Ok(Json(collection))
}

/// Bind ownership filters to the verified request identity.
///
/// Query parameters `owner_user_id`/`owner_session_id` are ignored: accepting
/// them would let any caller request another identity's private tracks. The
/// JWT identity wins; anonymous callers can only use the `x-session-id` header.
fn bind_owner_filter(
    params: &mut TrackGeoJsonQuery,
    auth_user: &OptionalAuthUser,
    headers: &HeaderMap,
) {
    match auth_user.user_id() {
        Some(user_id) => {
            params.owner_user_id = Some(user_id);
            params.owner_session_id = None;
        }
        None => {
            params.owner_user_id = None;
            params.owner_session_id = session_id_from_headers(headers);
        }
    }
}

/// Get track density heatmap data.
///
/// GET /api/tracks/heatmap?bbox=...&zoom=...
///
/// Returns a grid of weighted points showing track density.
pub async fn list_tracks_heatmap(
    State(pool): State<Arc<PgPool>>,
    auth_user: OptionalAuthUser,
    headers: HeaderMap,
    Query(mut params): Query<TrackGeoJsonQuery>,
) -> Result<Json<Vec<HeatmapPoint>>> {
    bind_owner_filter(&mut params, &auth_user, &headers);

    let bbox = params.bbox.as_deref();
    let zoom = params.zoom;

    let points = db::list_tracks_heatmap(&pool, bbox, zoom, &params).await?;
    Ok(Json(points))
}

/// List user's tracks (account page).
///
/// GET /api/account/tracks?sort=...&order=...&limit=...&offset=...
///
/// Returns paginated list of the authenticated user's tracks.
pub async fn list_account_tracks(
    State(pool): State<Arc<PgPool>>,
    auth_user: AuthUser,
    Query(params): Query<UserTracksQuery>,
) -> Result<Json<UserTracksResponse>> {
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);

    let (tracks, total) = db::list_user_tracks(
        &pool,
        auth_user.user_id,
        params.sort.as_deref(),
        params.order.as_deref(),
        limit,
        offset,
    )
    .await?;

    Ok(Json(UserTracksResponse {
        tracks,
        total,
        limit,
        offset,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::{AuthUser, Claims};
    use axum::http::{HeaderMap, HeaderValue};
    use uuid::Uuid;

    fn empty_query() -> TrackGeoJsonQuery {
        TrackGeoJsonQuery {
            bbox: None,
            zoom: None,
            mode: None,
            categories: None,
            min_length: None,
            max_length: None,
            elevation_gain_min: None,
            elevation_gain_max: None,
            slope_min: None,
            slope_max: None,
            owner_session_id: None,
            owner_user_id: None,
            mine: None,
        }
    }

    fn auth(user_id: Uuid) -> OptionalAuthUser {
        OptionalAuthUser(Some(AuthUser {
            user_id,
            email: "test@example.com".to_string(),
            name: None,
            nickname: None,
            avatar_url: None,
            roles: vec![],
            claims: Claims {
                sub: user_id.to_string(),
                email: "test@example.com".to_string(),
                name: String::new(),
                nickname: None,
                avatar_url: None,
                roles: vec![],
                exp: 0,
                iat: 0,
                iss: "trackly-app".to_string(),
                aud: "trackly-web".to_string(),
            },
        }))
    }

    fn session_header(session_id: Uuid) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-session-id",
            HeaderValue::from_str(&session_id.to_string()).expect("uuid is a valid header value"),
        );
        headers
    }

    #[test]
    fn bind_owner_filter_overrides_spoofed_params_for_auth_user() {
        let user_id = Uuid::new_v4();
        let spoofed_user = Uuid::new_v4();
        let spoofed_session = Uuid::new_v4();

        let mut params = empty_query();
        params.owner_user_id = Some(spoofed_user);
        params.owner_session_id = Some(spoofed_session);

        bind_owner_filter(&mut params, &auth(user_id), &HeaderMap::new());

        assert_eq!(params.owner_user_id, Some(user_id));
        assert_eq!(params.owner_session_id, None);
    }

    #[test]
    fn bind_owner_filter_ignores_spoofed_params_for_anonymous() {
        let mut params = empty_query();
        params.owner_user_id = Some(Uuid::new_v4());
        params.owner_session_id = Some(Uuid::new_v4());

        let session = Uuid::new_v4();
        bind_owner_filter(
            &mut params,
            &OptionalAuthUser(None),
            &session_header(session),
        );

        assert_eq!(params.owner_user_id, None);
        assert_eq!(params.owner_session_id, Some(session));
    }

    #[test]
    fn bind_owner_filter_anonymous_without_header_is_public_only() {
        let mut params = empty_query();
        params.owner_user_id = Some(Uuid::new_v4());

        bind_owner_filter(&mut params, &OptionalAuthUser(None), &HeaderMap::new());

        assert_eq!(params.owner_user_id, None);
        assert_eq!(params.owner_session_id, None);
    }
}
