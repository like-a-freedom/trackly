//! Sitemap.xml generation from public tracks.

use crate::db;
use axum::extract::State;
use axum::http::StatusCode;
use sqlx::PgPool;
use std::sync::Arc;
use tracing::error;

fn handle_db_error(err: sqlx::Error) -> StatusCode {
    error!(error = ?err, "database error occurred");
    match err {
        sqlx::Error::RowNotFound => StatusCode::NOT_FOUND,
        sqlx::Error::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    }
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
