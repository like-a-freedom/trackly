use axum::{Router, body::Body, http::Request, routing::post};
use backend::handlers::upload_track;
use sqlx::PgPool;
use std::sync::Arc;
use tower::ServiceExt;
use uuid::Uuid;

// Uses the real HTTP handler, parser and PostGIS constraint; cleans its own fixtures.
#[tokio::test]
#[ignore = "requires the local migrated PostgreSQL database"]
async fn upload_discards_isolated_samples_and_rejects_unusable_routes() {
    let configured = std::env::var("DATABASE_URL")
        .ok()
        .or_else(|| {
            dotenvy::from_filename_iter("../.env")
                .ok()?
                .filter_map(Result::ok)
                .find(|(key, _)| key == "DATABASE_URL")
                .map(|(_, value)| value)
        })
        .expect("configured database");
    let mut url = reqwest::Url::parse(&configured).unwrap();
    if matches!(url.host_str(), Some("db" | "postgres" | "postgis")) {
        url.set_host(Some("127.0.0.1")).unwrap();
    }
    let pool = Arc::new(PgPool::connect(url.as_str()).await.unwrap());
    sqlx::migrate!("./migrations").run(&*pool).await.unwrap();
    let app = Router::new()
        .route("/upload", post(upload_track))
        .with_state(pool.clone());
    let session = Uuid::new_v4();
    let mut created = None;
    let outcome: anyhow::Result<()> = async {
        for (points, expected_status) in [
            (r#"<trkpt lat="43" lon="76"><ele>9999</ele></trkpt><trkpt lat="55" lon="37"><ele>100</ele></trkpt><trkpt lat="55.001" lon="37.001"><ele>110</ele></trkpt>"#, 201),
            (r#"<trkpt lat="43" lon="76"></trkpt>"#, 400),
            (r#"<trkpt lat="43" lon="76"></trkpt><trkpt lat="43" lon="76"></trkpt>"#, 400),
        ] {
            let gpx = format!("<gpx><!--{session}--><trk><trkseg>{points}</trkseg></trk></gpx>");
            let body = format!("--boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"regression.gpx\"\r\nContent-Type: application/gpx+xml\r\n\r\n{gpx}\r\n--boundary\r\nContent-Disposition: form-data; name=\"categories\"\r\n\r\nhiking\r\n--boundary\r\nContent-Disposition: form-data; name=\"session_id\"\r\n\r\n{session}\r\n--boundary--\r\n");
            let response = app.clone().oneshot(Request::builder().uri("/upload").method("POST")
                .header("content-type", "multipart/form-data; boundary=boundary").body(Body::from(body))?).await?;
            let status = response.status().as_u16();
            let bytes = axum::body::to_bytes(response.into_body(),4096).await?;
            let data: serde_json::Value = serde_json::from_slice(&bytes)?;
            if let Some(id) = data["id"].as_str() { created = Some(Uuid::parse_str(id)?); }
            anyhow::ensure!(status == expected_status, "expected {expected_status}, got {status}: {data}");
            if status == 201 {
                let (valid, points, samples): (bool,i32,i32) = sqlx::query_as("SELECT ST_IsValid(geom), ST_NPoints(geom), jsonb_array_length(elevation_profile) FROM tracks WHERE id=$1")
                    .bind(created).fetch_one(&*pool).await?;
                anyhow::ensure!(valid && points == 2 && samples == 2, "invalid geometry or misaligned samples");
            } else {
                anyhow::ensure!(data["error"] == "invalid gpx file", "incorrect validation response");
            }
        }
        Ok(())
    }.await;
    if let Some(id) = created {
        sqlx::query("DELETE FROM tracks WHERE id=$1")
            .bind(id)
            .execute(&*pool)
            .await
            .unwrap();
    }
    sqlx::query("DELETE FROM sessions WHERE id=$1")
        .bind(session)
        .execute(&*pool)
        .await
        .unwrap();
    outcome.unwrap();
}
