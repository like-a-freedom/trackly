//! Observability handlers: map interaction metrics and health checks.

use crate::error::Result;
use crate::metrics;
use crate::models::MapInteractionEvent;
use axum::{Json, http::StatusCode};
use serde::Serialize;
use tracing::debug;

pub async fn record_map_interaction(Json(event): Json<MapInteractionEvent>) -> Result<StatusCode> {
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

fn bucket_zoom_level(zoom: Option<f64>) -> &'static str {
    match zoom {
        Some(z) if z < 10.0 => "low",
        Some(z) if z < 14.0 => "mid",
        Some(_) => "high",
        None => "mid",
    }
}

/// Response for the feature flags endpoint.
#[must_use]
#[derive(Serialize)]
pub struct FeatureFlagsResponse {
    pub auth: bool,
    pub editor: bool,
}

pub async fn get_feature_flags() -> Json<FeatureFlagsResponse> {
    let editor = std::env::var("FEATURE_EDITOR")
        .map(|v| v != "false")
        .unwrap_or(true);

    Json(FeatureFlagsResponse {
        auth: crate::auth::config::is_auth_configured(),
        editor,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::Mutex;

    // Serialize tests that mutate the FEATURE_EDITOR env var to avoid races.
    static ENV_LOCK: Mutex<()> = Mutex::const_new(());

    #[test]
    fn bucket_zoom_level_partitions() {
        assert_eq!(bucket_zoom_level(Some(5.0)), "low");
        assert_eq!(bucket_zoom_level(Some(12.0)), "mid");
        assert_eq!(bucket_zoom_level(Some(16.0)), "high");
        assert_eq!(bucket_zoom_level(None), "mid");
    }

    #[tokio::test]
    async fn get_feature_flags_returns_defaults() {
        let _guard = ENV_LOCK.lock().await;
        unsafe { std::env::remove_var("FEATURE_EDITOR") };
        let response = get_feature_flags().await;
        let body = response.0;
        assert!(body.editor, "editor should default to true");
        // auth depends on env vars — just assert it's a valid bool
        let _ = body.auth;
        unsafe { std::env::remove_var("FEATURE_EDITOR") };
    }

    #[tokio::test]
    async fn get_feature_flags_respects_editor_env() {
        let _guard = ENV_LOCK.lock().await;
        unsafe { std::env::set_var("FEATURE_EDITOR", "false") };
        let response = get_feature_flags().await;
        assert!(
            !response.0.editor,
            "FEATURE_EDITOR=false should disable editor"
        );

        unsafe { std::env::set_var("FEATURE_EDITOR", "true") };
        let response = get_feature_flags().await;
        assert!(
            response.0.editor,
            "FEATURE_EDITOR=true should enable editor"
        );

        unsafe { std::env::remove_var("FEATURE_EDITOR") };
    }
}
