//! Track detail handlers.
//!
//! - GET /api/tracks/{id}              → get_track (adaptive simplification)
//! - GET /api/tracks/{id}/simplified   → get_track_simplified

use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};

use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::OptionalAuthUser;
use crate::db;
use crate::error::{AppError, Result};
use crate::handlers::util::session_id_from_headers;
use crate::metrics;
use crate::models::{TrackDetail, TrackSimplificationQuery};

/// Ownership label for a track view.
///
/// An authenticated viewer owns the track when the track's `user_id` matches;
/// otherwise ownership falls back to the anonymous `x-session-id` match against
/// the track's `session_id`. Returns `"own"` or `"public"`.
fn track_view_ownership(
    track_user_id: Option<Uuid>,
    track_session_id: Option<Uuid>,
    viewer_user_id: Option<Uuid>,
    viewer_session: Option<Uuid>,
) -> &'static str {
    if let Some(user_id) = viewer_user_id {
        return if track_user_id == Some(user_id) {
            "own"
        } else {
            "public"
        };
    }
    if let Some(session) = viewer_session {
        return if track_session_id == Some(session) {
            "own"
        } else {
            "public"
        };
    }
    "public"
}

/// Get track detail with adaptive simplification based on zoom level.
///
/// GET /api/tracks/{id}?zoom=...&mode=...&referrer=...
///
/// Geometry and chart data are simplified on-the-fly based on the
/// requested zoom level and mode (overview vs. detail).
pub async fn get_track(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
    Query(params): Query<TrackSimplificationQuery>,
    auth_user: OptionalAuthUser,
    headers: HeaderMap,
) -> Result<Json<TrackDetail>> {
    let track = db::get_track_detail_adaptive(&pool, track_id, params.zoom, params.mode.as_deref())
        .await?
        .ok_or(AppError::NotFound)?;

    // Record the view: product metric (ownership + referrer) and engagement heartbeat.
    // Background refreshes (elevation polling, post-enrich refetch) are not views.
    if !params.background {
        let viewer_session = session_id_from_headers(&headers);
        let ownership = track_view_ownership(
            track.user_id,
            track.session_id,
            auth_user.user_id(),
            viewer_session,
        );
        metrics::record_track_view(ownership, params.referrer.as_deref().unwrap_or("direct"));
        metrics::record_session_activity(viewer_session, "view");
    }

    Ok(Json(track))
}

/// Get track detail with full geometry (no simplification).
///
/// GET /api/tracks/{id}/simplified
///
/// Returns the complete track data for export or detailed analysis.
pub async fn get_track_simplified(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
) -> Result<Json<TrackDetail>> {
    let track = db::get_track_detail(&pool, track_id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(track))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ownership_own_when_authenticated_user_matches_track_user() {
        let track_user = Uuid::new_v4();
        assert_eq!(
            track_view_ownership(Some(track_user), None, Some(track_user), None),
            "own"
        );
    }

    #[test]
    fn ownership_public_when_authenticated_user_differs() {
        assert_eq!(
            track_view_ownership(Some(Uuid::new_v4()), None, Some(Uuid::new_v4()), None),
            "public"
        );
    }

    #[test]
    fn ownership_own_when_anonymous_session_matches_track_session() {
        let session = Uuid::new_v4();
        assert_eq!(
            track_view_ownership(None, Some(session), None, Some(session)),
            "own"
        );
    }

    #[test]
    fn ownership_public_when_no_viewer_identity() {
        let track_session = Uuid::new_v4();
        assert_eq!(
            track_view_ownership(None, Some(track_session), None, None),
            "public"
        );
    }

    #[test]
    fn ownership_auth_takes_precedence_over_session_match() {
        let track_user = Uuid::new_v4();
        let shared_session = Uuid::new_v4();
        // Viewer is authenticated as a different user but shares the session id:
        // auth identity wins, so the view is not "own".
        assert_eq!(
            track_view_ownership(
                Some(track_user),
                Some(shared_session),
                Some(Uuid::new_v4()),
                Some(shared_session)
            ),
            "public"
        );
    }
}
