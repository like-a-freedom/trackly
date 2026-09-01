//! Track search handler.
//!
//! GET /api/tracks/search?q=...

use axum::{
    Json,
    extract::{Query, State},
};

use sqlx::PgPool;
use std::sync::Arc;

use crate::db;
use crate::error::Result;
use crate::metrics;
use crate::models::{TrackSearchQuery, TrackSearchResult};

/// Search tracks by name or description.
///
/// GET /api/tracks/search?q=<query>
///
/// Returns matching public tracks, prioritizing name matches over description matches.
/// Limited to 50 results.
pub async fn search_tracks(
    State(pool): State<Arc<PgPool>>,
    Query(params): Query<TrackSearchQuery>,
) -> Result<Json<Vec<TrackSearchResult>>> {
    let query = params.query.trim();
    if query.is_empty() {
        return Ok(Json(Vec::new()));
    }

    let query_type = if query.len() > 3 { "long" } else { "short" };
    metrics::record_track_search("results", query_type);

    let tracks = db::search_tracks(&pool, query).await?;
    Ok(Json(tracks))
}
