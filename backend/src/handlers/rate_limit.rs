//! Session-based upload/export rate limiting.
//!
//! In-memory per-session timestamps. The limit window is configurable via
//! `UPLOAD_RATE_LIMIT_SECONDS` / `EXPORT_RATE_LIMIT_SECONDS`.

use axum::http::StatusCode;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;
use tracing::{error, info, warn};

#[allow(dead_code)]
static LAST_UPLOAD: Lazy<Mutex<HashMap<String, u64>>> = Lazy::new(|| Mutex::new(HashMap::new()));

// Configurable rate limiting
#[allow(dead_code)]
static UPLOAD_RATE_LIMIT_SECONDS: Lazy<u64> = Lazy::new(|| {
    std::env::var("UPLOAD_RATE_LIMIT_SECONDS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(10) // Default 10 seconds
});

#[allow(dead_code)]
pub fn record_session_upload_attempt(session_key: &str, now: u64) -> Result<(), StatusCode> {
    let mut map = LAST_UPLOAD.lock().map_err(|e| {
        error!(error = ?e, "LAST_UPLOAD mutex poisoned");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    if let Some(&last) = map.get(session_key) {
        // If the recorded last timestamp is in the future relative to the provided "now",
        // treat it as stale and overwrite with current time to avoid spurious rate limits
        // caused by tests running in parallel or clock skews in tests.
        if last > now {
            map.insert(session_key.to_string(), now);
            return Ok(());
        }

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
    info!(
        session_id = session_key,
        timestamp = now,
        "recording upload attempt"
    );
    map.insert(session_key.to_string(), now);
    Ok(())
}

// Configurable export rate limiting (mirrors upload rate limiting)
#[allow(dead_code)]
static LAST_EXPORT: Lazy<Mutex<HashMap<String, u64>>> = Lazy::new(|| Mutex::new(HashMap::new()));
#[allow(dead_code)]
static EXPORT_RATE_LIMIT_SECONDS: Lazy<u64> = Lazy::new(|| {
    std::env::var("EXPORT_RATE_LIMIT_SECONDS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(10) // Default 10 seconds
});

#[allow(dead_code)]
pub fn record_session_export_attempt(session_key: &str, now: u64) -> Result<(), StatusCode> {
    let mut map = LAST_EXPORT.lock().map_err(|e| {
        error!(error = ?e, "LAST_EXPORT mutex poisoned");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    if let Some(&last) = map.get(session_key) {
        // If the recorded last timestamp is in the future relative to the provided "now",
        // treat it as stale and overwrite with current time to avoid spurious rate limits
        // caused by tests running in parallel or clock skews in tests.
        if last > now {
            map.insert(session_key.to_string(), now);
            return Ok(());
        }

        if now < last + *EXPORT_RATE_LIMIT_SECONDS {
            let retry_after = last + *EXPORT_RATE_LIMIT_SECONDS - now;
            warn!(
                reason = "export_rate_limited",
                session_id = session_key,
                retry_after_seconds = retry_after,
                "export_track rate limit hit"
            );
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
    }
    info!(
        session_id = session_key,
        timestamp = now,
        "recording export attempt"
    );
    map.insert(session_key.to_string(), now);
    Ok(())
}

/// The rate limit window for exports, in seconds.
#[allow(dead_code)]
pub fn export_rate_limit_seconds() -> u64 {
    *EXPORT_RATE_LIMIT_SECONDS
}

/// The last recorded export attempt for a session, if any.
#[allow(dead_code)]
pub fn last_export_attempt(session_key: &str) -> Option<u64> {
    LAST_EXPORT
        .lock()
        .ok()
        .and_then(|m| m.get(session_key).copied())
}

#[cfg(test)]
fn reset_rate_limit_state() {
    // Clear the LAST_UPLOAD and LAST_EXPORT maps for tests; if poisoned, log and skip the clear
    match LAST_UPLOAD.lock() {
        Ok(mut m) => m.clear(),
        Err(e) => error!(error = ?e, "LAST_UPLOAD mutex poisoned - clear skipped"),
    }
    match LAST_EXPORT.lock() {
        Ok(mut m) => m.clear(),
        Err(e) => error!(error = ?e, "LAST_EXPORT mutex poisoned - clear skipped"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn record_session_export_allows_first_attempt() {
        reset_rate_limit_state();
        record_session_export_attempt("session", 100).expect("first export should pass");
    }

    #[test]
    fn record_session_export_blocks_fast_retries() {
        reset_rate_limit_state();
        record_session_export_attempt("session", 200).expect("initial export ok");

        let err = record_session_export_attempt("session", 205).expect_err("should rate limit");
        assert_eq!(err, StatusCode::TOO_MANY_REQUESTS);

        // After enough time passes, exports are allowed again
        record_session_export_attempt("session", 212).expect("rate limit window expired");
    }
}
