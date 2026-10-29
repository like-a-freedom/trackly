//! Track export handler.
//!
//! GET /api/tracks/{id}/export?format=gpx|kml|geojson

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, header},
    response::IntoResponse,
};

use serde::Deserialize;
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Instant;

use crate::auth::OptionalAuthUser;
use crate::db;
use crate::error::{AppError, Result};
use crate::handlers::util::{ensure_track_visible, session_id_from_headers};
use crate::metrics;
use crate::models::TrackDetail;
use crate::services::gpx_export;

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    pub format: Option<String>,
}

/// Export a track in the requested format.
///
/// GET /api/tracks/{id}/export?format=gpx|kml|geojson
///
/// Returns a downloadable file with full track data.
pub async fn export_track(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<uuid::Uuid>,
    Query(query): Query<ExportQuery>,
    auth_user: OptionalAuthUser,
    headers: HeaderMap,
) -> Result<impl IntoResponse> {
    let viewer_session = session_id_from_headers(&headers);
    ensure_track_visible(&pool, track_id, &auth_user, viewer_session).await?;

    let track = db::get_track_detail(&pool, track_id)
        .await?
        .ok_or(AppError::NotFound)?;

    let format = query.format.as_deref().unwrap_or("gpx");

    // Record session engagement heartbeat once per export request.
    metrics::record_session_activity(viewer_session, "export");

    // The timer starts after the track is loaded so the histogram measures
    // serialization cost, not database latency (which `HttpMetricsLayer`
    // already tracks separately).
    let started = Instant::now();

    match format {
        "gpx" => Ok(export_response(
            "gpx",
            "gpx",
            "application/gpx+xml",
            &track,
            gpx_export::generate_gpx,
            started,
        )),
        "kml" => Ok(export_response(
            "kml",
            "kml",
            "application/vnd.google-earth.kml+xml",
            &track,
            crate::services::kml_export::generate_kml,
            started,
        )),
        "geojson" => Ok(export_response(
            "geojson",
            "json",
            "application/geo+json",
            &track,
            crate::services::geojson_export::generate_geojson,
            started,
        )),
        _ => Err(AppError::BadRequest(format!(
            "Unsupported export format: {format}. Use gpx, kml, or geojson."
        ))),
    }
}

/// Serialize `track` into a downloadable response and record the export metrics.
///
/// `format` is the label shared by `track_exports_total` and
/// `track_export_duration_seconds`, so both stay queryable with the same value.
fn export_response(
    format: &'static str,
    extension: &'static str,
    content_type: &'static str,
    track: &TrackDetail,
    generate: impl FnOnce(&TrackDetail) -> String,
    started: Instant,
) -> (HeaderMap, String) {
    let content = generate(track);
    let filename = gpx_export::sanitize_filename(&track.name);

    metrics::record_track_export(format);
    metrics::observe_track_export_duration(format, started.elapsed().as_secs_f64());

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    headers.insert(
        header::CONTENT_DISPOSITION,
        content_disposition(&filename, extension),
    );

    (headers, content)
}

/// Build a download `Content-Disposition` value for `filename`.
///
/// `sanitize_filename` keeps letters, digits, `-`, `_` and spaces, but letters
/// may be non-ASCII (e.g. "Прогулка по парку"), and `HeaderValue` rejects any
/// byte outside the visible-ASCII range. Building the value with `parse()` and
/// unwrapping it would therefore panic on a non-Latin track name, so the header
/// follows RFC 6266/5987 instead: an ASCII-only `filename` fallback plus a
/// percent-encoded `filename*` carrying the real UTF-8 name.
fn content_disposition(filename: &str, extension: &str) -> HeaderValue {
    let fallback: String = filename
        .chars()
        .map(|c| {
            if c.is_ascii_graphic() && c != '"' && c != '\\' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let encoded = percent_encode_utf8(filename);
    let value = format!(
        "attachment; filename=\"{fallback}.{extension}\"; filename*=UTF-8''{encoded}.{extension}"
    );
    // Every byte of `value` is visible ASCII, so this cannot fail; `expect` is
    // still avoided because a panic here would kill the request thread.
    HeaderValue::from_str(&value).unwrap_or_else(|_| HeaderValue::from_static("attachment"))
}

/// Percent-encode a string for the RFC 5987 `ext-value` form.
///
/// The RFC 5987 `attr-char` set is kept as-is; everything else becomes `%XX`,
/// which is always valid header material.
fn percent_encode_utf8(value: &str) -> String {
    const UNRESERVED: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut out = String::with_capacity(value.len() * 3);
    for byte in value.bytes() {
        if byte.is_ascii() && UNRESERVED.contains(byte as char) {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_encode_keeps_unreserved_characters() {
        assert_eq!(percent_encode_utf8("My Track-1.0"), "My%20Track-1.0");
    }

    #[test]
    fn percent_encode_escapes_non_ascii_bytes() {
        // "Пр" in UTF-8 is D0 9F D1 80.
        assert_eq!(percent_encode_utf8("Пр"), "%D0%9F%D1%80");
    }

    #[test]
    fn content_disposition_is_valid_header_value_for_ascii_name() {
        let value = content_disposition("Morning_Run", "gpx");
        assert_eq!(
            value.to_str().expect("ascii header"),
            "attachment; filename=\"Morning_Run.gpx\"; filename*=UTF-8''Morning_Run.gpx"
        );
    }

    #[test]
    fn content_disposition_never_panics_on_non_ascii_name() {
        // Regression: a Cyrillic track name used to abort the export because
        // `HeaderValue::from_str` rejects non-visible-ASCII bytes.
        let value = content_disposition("Прогулка_по_парку", "kml");
        let text = value.to_str().expect("header stays visible ASCII");
        assert!(text.starts_with("attachment; filename=\""), "{text}");
        assert!(text.contains("filename*=UTF-8''"), "{text}");
        // The UTF-8 name survives through the RFC 5987 form.
        assert!(text.contains("%D0%9F%D1%80"), "{text}");
        // The ASCII fallback is free of the original non-ASCII bytes.
        let fallback = text
            .split("filename=\"")
            .nth(1)
            .and_then(|rest| rest.split('"').next())
            .expect("fallback present");
        assert!(fallback.is_ascii(), "{fallback}");
        // 17 substituted characters plus ".kml".
        assert_eq!(
            fallback.chars().count(),
            "Прогулка_по_парку".chars().count() + ".kml".len()
        );
    }

    #[test]
    fn content_disposition_quotes_are_never_injected_into_the_header() {
        let value = content_disposition("evil\"name", "gpx");
        let text = value.to_str().expect("header stays visible ASCII");
        assert!(
            text.starts_with("attachment; filename=\"evil_name.gpx\""),
            "{text}"
        );
    }
}
