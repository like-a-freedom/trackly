use backend::{db, services::track_editor};
use serde_json::json;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

// Opt-in: mutates only uniquely identified fixtures and removes them before asserting.
#[tokio::test]
#[ignore = "requires the local migrated PostgreSQL database"]
async fn editor_roundtrip_preserves_anchors_places_and_recorded_measurements() {
    let configured = std::env::var("DATABASE_URL")
        .ok()
        .or_else(|| {
            dotenvy::from_filename_iter("../.env")
                .ok()?
                .filter_map(Result::ok)
                .find(|(key, _)| key == "DATABASE_URL")
                .map(|(_, value)| value)
        })
        .expect("DATABASE_URL must be configured for the integration gate");
    let mut url = reqwest::Url::parse(&configured).expect("database URL");
    if matches!(url.host_str(), Some("db" | "postgres" | "postgis")) {
        url.set_host(Some("localhost"))
            .expect("local database hostname");
    }
    let pool = Arc::new(
        PgPool::connect(url.as_str())
            .await
            .expect("local migrated database"),
    );
    sqlx::migrate!("./migrations")
        .run(&*pool)
        .await
        .expect("apply SQLx migrations");
    let session = Uuid::new_v4();
    let id = Uuid::new_v4();
    let offset = f64::from(id.as_bytes()[0]) / 100000.0;
    let geometry = json!({"type":"MultiLineString","coordinates":[[[37.0+offset,56.0],[37.01+offset,56.01],[37.02+offset,56.02]]]});
    let request = json!({"request_id":id,"session_id":session,"name":"Editor integrity fixture","geometry":geometry,"categories":["walking"],"waypoints":[{"lat":56.0,"lon":37.0+offset,"index":0},{"lat":56.02,"lon":37.02+offset,"index":2}],"segment_meta":[{"name":"Day one","color":"#245bd7"}],"pois":[{"lat":56.0,"lon":37.0+offset,"name":"Fixture start","category":"water"}]});
    let mut created = Vec::new();
    let mut poi_ids: Vec<i32> = Vec::new();
    let outcome: anyhow::Result<()> = async {
        let first = track_editor::create_track(&pool, serde_json::from_value(request.clone())?, None).await?;
        created.push(first.id);
        let replay = track_editor::create_track(&pool, serde_json::from_value(request.clone())?, None).await?;
        anyhow::ensure!(first.id == replay.id, "create replay changed identity");
        let detail = db::get_track_detail(&pool,id).await?.ok_or_else(||anyhow::anyhow!("missing fixture"))?;
        anyhow::ensure!(detail.waypoints.as_ref().and_then(|v|v.as_array()).map(Vec::len)==Some(2), "anchors were lost");
        let places = db::find_by_track_with_distance(&pool,id).await?;
        poi_ids.extend(places.iter().map(|p|p.poi.id));
        anyhow::ensure!(places.len()==1 && places[0].distance_from_start_m.is_some(), "place/distance was lost");
        let copy = track_editor::duplicate_track(&pool,id,serde_json::from_value(json!({"session_id":session}))?,None).await?;
        created.push(copy.id);
        let copy_detail = db::get_track_detail(&pool,copy.id).await?.ok_or_else(||anyhow::anyhow!("missing copy"))?;
        anyhow::ensure!(copy_detail.segment_meta==detail.segment_meta, "copy lost segment metadata");
        anyhow::ensure!(db::find_by_track_with_distance(&pool,copy.id).await?.len()==1, "copy lost places");
        sqlx::query("UPDATE tracks SET time_data=$2, recorded_at=NOW() WHERE id=$1").bind(id).bind(json!([100,110,120])).execute(&*pool).await?;
        let before: Vec<u8> = sqlx::query_scalar("SELECT ST_AsEWKB(geom) FROM tracks WHERE id=$1").bind(id).fetch_one(&*pool).await?;
        let update = json!({"geometry":detail.geom_geojson,"session_id":session,"waypoints":request["waypoints"],"segment_meta":request["segment_meta"],"pois":[{"lat":56.0,"lon":37.0+offset,"name":"Renamed fixture start","category":"water"}]});
        track_editor::update_track_geometry(&pool,id,serde_json::from_value(update.clone())?).await?;
        poi_ids.extend(db::find_by_track_with_distance(&pool,id).await?.iter().map(|p|p.poi.id));
        let after: Vec<u8> = sqlx::query_scalar("SELECT ST_AsEWKB(geom) FROM tracks WHERE id=$1").bind(id).fetch_one(&*pool).await?;
        anyhow::ensure!(before==after, "recorded geometry changed");
        let recorded = db::get_track_detail(&pool,id).await?.ok_or_else(||anyhow::anyhow!("missing recording"))?;
        anyhow::ensure!(recorded.time_data==Some(json!([100,110,120])), "measurements changed");
        let mut changed = update;
        changed["geometry"]["coordinates"][0][1][0]=json!(38.0);
        anyhow::ensure!(track_editor::update_track_geometry(&pool,id,serde_json::from_value(changed)?).await.is_err(), "recorded geometry modification was accepted");
        Ok(())
    }.await;
    sqlx::query("DELETE FROM tracks WHERE id=ANY($1)")
        .bind(&created)
        .execute(&*pool)
        .await
        .expect("remove fixture tracks");
    sqlx::query("DELETE FROM pois WHERE id=ANY($1) AND session_id=$2")
        .bind(&poi_ids)
        .bind(session)
        .execute(&*pool)
        .await
        .expect("remove fixture places");
    sqlx::query("DELETE FROM sessions WHERE id=$1")
        .bind(session)
        .execute(&*pool)
        .await
        .expect("remove fixture session");
    outcome.expect("editor persistence integrity");
}
