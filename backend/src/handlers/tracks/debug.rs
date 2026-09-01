//! Debug endpoint handlers.
//!
//! GET /debug/background_task

use axum::Json;

/// Debug endpoint for testing background task execution.
///
/// GET /debug/background_task
///
/// Returns information about background task configuration.
/// Disabled by default in production.
pub async fn debug_background_task() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "message": "Background task debug endpoint",
    }))
}
