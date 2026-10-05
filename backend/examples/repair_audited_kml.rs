//! Repair the audited KML only when its source hash and stored source geometry match.
use backend::track_utils::kml_parser::parse_kml;
use std::{error::Error, path::Path};
#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    dotenvy::from_path(Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env")).ok();
    let source = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../tracks/kml/Смоленское поозерье - разведка.kml");
    let parsed = parse_kml(&std::fs::read(source)?).map_err(std::io::Error::other)?;
    if parsed.hash != "72ad2cf94271a0d18f101db3c30b1b4543af7c193f292740562044b0dbea009b"
        || (parsed.length_km - 128.44642078202975).abs() > 0.000001
    {
        return Err("Source reference mismatch".into());
    }
    let pool =
        sqlx::PgPool::connect(&std::env::var("DATABASE_URL")?.replace("@db:", "@127.0.0.1:"))
            .await?;
    let id = uuid::Uuid::parse_str("049dbd57-8949-4b07-b505-0c1a45955840")?;
    let mut tx = pool.begin().await?;
    let (hash, geometry, length, source): (String, String, f64, Option<String>) = sqlx::query_as(
        "SELECT hash,ST_AsGeoJSON(geom,15),length_km,source FROM tracks WHERE id=$1 FOR UPDATE",
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;
    if hash != parsed.hash || source.as_deref() != Some("upload") {
        return Err("Historical source identity mismatch".into());
    }
    let geometry: serde_json::Value = serde_json::from_str(&geometry)?;
    let current = geometry["coordinates"][0]
        .as_array()
        .ok_or("Missing historical line")?;
    let corrected = parsed.geom_geojson["coordinates"]
        .as_array()
        .ok_or("Missing source line")?;
    if current.len() < corrected.len()
        || current[current.len() - corrected.len()..] != corrected[..]
    {
        return Err("Stored geometry does not match source; refusing repair".into());
    }
    let before = serde_json::json!({"id":id,"source_hash":hash,"length_before":length,"points_before":current.len(),"length_after":parsed.length_km,"points_after":corrected.len()});
    if !std::env::args().any(|a| a == "--apply") {
        println!("{before}");
        return Ok(());
    }
    // Preserve the previous complete row before the authorized, scoped repair.
    let backup: serde_json::Value =
        sqlx::query_scalar("SELECT to_jsonb(tracks) FROM tracks WHERE id=$1")
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open("/private/tmp/trackly-audited-kml-before.json")?;
    file.write_all(serde_json::to_string(&backup)?.as_bytes())?;
    sqlx::query("UPDATE tracks SET geom=ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2),4326)),length_km=$3,elevation_profile=$4,elevation_gain=$5,elevation_loss=$6,elevation_min=$7,elevation_max=$8,slope_min=$9,slope_max=$10,slope_avg=$11,slope_histogram=$12,slope_segments=$13,updated_at=NOW() WHERE id=$1")
 .bind(id).bind(parsed.geom_geojson.to_string()).bind(parsed.length_km).bind(serde_json::to_value(parsed.elevation_profile)?).bind(parsed.elevation_gain).bind(parsed.elevation_loss).bind(parsed.elevation_min).bind(parsed.elevation_max).bind(parsed.slope_min).bind(parsed.slope_max).bind(parsed.slope_avg).bind(parsed.slope_histogram).bind(parsed.slope_segments).execute(&mut *tx).await?;
    sqlx::query("UPDATE track_pois SET distance_from_start_m=calculate_poi_distance_on_track($1::uuid,poi_id) WHERE track_id=$1").bind(id).execute(&mut *tx).await?;
    tx.commit().await?;
    println!("{before}");
    Ok(())
}
