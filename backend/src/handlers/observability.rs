//! Observability handlers: map interaction metrics and health checks.

use crate::metrics;
use crate::models::MapInteractionEvent;
use axum::{Json, http::StatusCode};
use tracing::debug;

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

fn bucket_zoom_level(zoom: Option<f64>) -> &'static str {
    match zoom {
        Some(z) if z < 10.0 => "low",
        Some(z) if z < 14.0 => "mid",
        Some(_) => "high",
        None => "mid",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bucket_zoom_level_partitions() {
        assert_eq!(bucket_zoom_level(Some(5.0)), "low");
        assert_eq!(bucket_zoom_level(Some(12.0)), "mid");
        assert_eq!(bucket_zoom_level(Some(16.0)), "high");
        assert_eq!(bucket_zoom_level(None), "mid");
    }
}
