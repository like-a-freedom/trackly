// POI Deduplication Service
// Handles finding or creating POIs with intelligent deduplication
// Optimized with bulk operations for better performance

use crate::models::ParsedWaypoint;
use sqlx::{PgPool, Postgres, QueryBuilder, Row};
use std::collections::HashMap;
use std::time::Instant;
use tracing::{debug, info, warn};
use uuid::Uuid;

pub struct PoiDeduplicationService;

impl PoiDeduplicationService {
    /// Generate a dedup key for a waypoint (similar to DB dedup_hash logic)
    /// Used to deduplicate waypoints client-side before bulk insert
    fn generate_dedup_key(waypoint: &ParsedWaypoint) -> String {
        // Round coordinates to ~10m precision (4 decimal places)
        let rounded_lat = (waypoint.lat * 10000.0).round() / 10000.0;
        let rounded_lon = (waypoint.lon * 10000.0).round() / 10000.0;
        let normalized_name = waypoint.name.trim().to_lowercase();
        format!("{}:{}:{}", normalized_name, rounded_lat, rounded_lon)
    }

    /// Deduplicate waypoints by their dedup key, keeping first occurrence
    /// Returns deduplicated waypoints with their original indices
    fn deduplicate_waypoints(waypoints: &[ParsedWaypoint]) -> Vec<(usize, &ParsedWaypoint)> {
        let mut seen: HashMap<String, usize> = HashMap::new();
        let mut result = Vec::new();

        for (idx, waypoint) in waypoints.iter().enumerate() {
            let key = Self::generate_dedup_key(waypoint);
            if !seen.contains_key(&key) {
                seen.insert(key, idx);
                result.push((idx, waypoint));
            }
        }

        if result.len() < waypoints.len() {
            debug!(
                "Deduplicated {} waypoints to {} unique entries",
                waypoints.len(),
                result.len()
            );
        }

        result
    }

    /// Bulk insert or update POIs using QueryBuilder
    /// Returns vector of (index, poi_id) for successfully inserted/updated POIs
    pub async fn bulk_find_or_create_pois(
        pool: &PgPool,
        waypoints: &[ParsedWaypoint],
    ) -> Result<Vec<(usize, i32)>, sqlx::Error> {
        if waypoints.is_empty() {
            return Ok(Vec::new());
        }

        let start = Instant::now();

        // Deduplicate waypoints to avoid "ON CONFLICT DO UPDATE cannot affect row a second time"
        let unique_waypoints = Self::deduplicate_waypoints(waypoints);
        if unique_waypoints.is_empty() {
            return Ok(Vec::new());
        }

        // Build bulk insert query with UNNEST for better performance
        // PostgreSQL will handle dedup_hash generation via trigger/generated column
        let mut query_builder: QueryBuilder<Postgres> = QueryBuilder::new(
            r#"
            INSERT INTO pois (name, description, category, elevation, geom)
            SELECT t.name, t.description, t.category, t.elevation, g.geom FROM UNNEST(
                "#,
        );

        // Build arrays for each column from deduplicated waypoints
        let names: Vec<String> = unique_waypoints
            .iter()
            .map(|(_, w)| w.name.trim().to_string())
            .collect();
        let descriptions: Vec<Option<String>> = unique_waypoints
            .iter()
            .map(|(_, w)| w.description.clone())
            .collect();
        let categories: Vec<Option<String>> = unique_waypoints
            .iter()
            .map(|(_, w)| w.category.clone())
            .collect();
        let elevations: Vec<Option<f32>> =
            unique_waypoints.iter().map(|(_, w)| w.elevation).collect();
        let lons: Vec<f64> = unique_waypoints.iter().map(|(_, w)| w.lon).collect();
        let lats: Vec<f64> = unique_waypoints.iter().map(|(_, w)| w.lat).collect();

        query_builder.push_bind(names);
        query_builder.push("::text[], ");
        query_builder.push_bind(descriptions);
        query_builder.push("::text[], ");
        query_builder.push_bind(categories);
        query_builder.push("::text[], ");
        query_builder.push_bind(elevations);
        query_builder.push("::real[], ");

        // Build geometry points using generate_series to pair lons/lats
        query_builder.push_bind(lons.clone());
        query_builder.push("::double precision[], ");
        query_builder.push_bind(lats.clone());
        query_builder.push(
            r#"::double precision[]
            ) AS t(name, description, category, elevation, lon, lat)
            CROSS JOIN LATERAL (SELECT ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326)::geography AS geom) g
            ON CONFLICT (dedup_hash) DO UPDATE
            SET 
                description = COALESCE(pois.description, EXCLUDED.description),
                category = COALESCE(pois.category, EXCLUDED.category),
                elevation = COALESCE(pois.elevation, EXCLUDED.elevation),
                updated_at = NOW()
            RETURNING id
            "#,
        );

        let query = query_builder.build();
        let rows = query.fetch_all(pool).await?;

        let elapsed = start.elapsed().as_secs_f64();
        crate::metrics::observe_db_query("bulk_insert_pois", elapsed);
        crate::metrics::record_bulk_operation("pois_inserted", unique_waypoints.len());

        // Map results back to original indices (from deduplicated waypoints)
        let result: Vec<(usize, i32)> = rows
            .iter()
            .enumerate()
            .map(|(row_idx, row)| {
                let original_idx = unique_waypoints[row_idx].0;
                (original_idx, row.get::<i32, _>("id"))
            })
            .collect();

        debug!(
            "Bulk inserted/updated {} POIs ({} unique from {} total) in {:.3}s",
            result.len(),
            unique_waypoints.len(),
            waypoints.len(),
            elapsed
        );

        Ok(result)
    }

    /// Bulk link POIs to track with distance calculation
    /// Uses a single query with UNNEST for all links
    pub async fn bulk_link_pois_to_track(
        pool: &PgPool,
        track_id: Uuid,
        poi_ids_with_order: &[(i32, i32)], // (poi_id, sequence_order)
    ) -> Result<usize, sqlx::Error> {
        if poi_ids_with_order.is_empty() {
            return Ok(0);
        }

        let start = Instant::now();

        let poi_ids: Vec<i32> = poi_ids_with_order.iter().map(|(id, _)| *id).collect();
        let sequence_orders: Vec<i32> =
            poi_ids_with_order.iter().map(|(_, order)| *order).collect();

        // Single bulk insert with distance calculation inline
        let result = sqlx::query(
            r#"
            INSERT INTO track_pois (track_id, poi_id, distance_from_start_m, sequence_order)
            SELECT 
                $1::uuid,
                poi_data.poi_id,
                calculate_poi_distance_on_track($1::uuid, poi_data.poi_id),
                poi_data.seq_order
            FROM UNNEST($2::int[], $3::int[]) AS poi_data(poi_id, seq_order)
            ON CONFLICT (track_id, poi_id) DO UPDATE
            SET 
                distance_from_start_m = EXCLUDED.distance_from_start_m,
                sequence_order = EXCLUDED.sequence_order
            "#,
        )
        .bind(track_id)
        .bind(&poi_ids)
        .bind(&sequence_orders)
        .execute(pool)
        .await?;

        let elapsed = start.elapsed().as_secs_f64();
        crate::metrics::observe_db_query("bulk_link_pois", elapsed);
        crate::metrics::record_bulk_operation("pois_linked", poi_ids_with_order.len());

        let rows_affected = result.rows_affected() as usize;
        debug!(
            "Bulk linked {} POIs to track {} in {:.3}s",
            rows_affected, track_id, elapsed
        );

        Ok(rows_affected)
    }

    /// Optimized batch link POIs to track using bulk operations
    /// Single DB roundtrip for inserts, single for links
    pub async fn link_pois_to_track(
        pool: &PgPool,
        track_id: Uuid,
        waypoints: Vec<ParsedWaypoint>,
    ) -> Result<usize, sqlx::Error> {
        if waypoints.is_empty() {
            debug!("No waypoints to link for track {}", track_id);
            return Ok(0);
        }

        let total_waypoints = waypoints.len();
        info!(
            "Linking {} waypoints to track {} using bulk operations",
            total_waypoints, track_id
        );

        let pipeline_start = Instant::now();

        // Step 1: Bulk insert/update all POIs
        let poi_results = Self::bulk_find_or_create_pois(pool, &waypoints).await?;

        if poi_results.is_empty() {
            warn!("No POIs were created for track {}", track_id);
            return Ok(0);
        }

        // Step 2: Prepare data for bulk linking
        let poi_ids_with_order: Vec<(i32, i32)> = poi_results
            .iter()
            .map(|(idx, poi_id)| (*poi_id, *idx as i32))
            .collect();

        // Step 3: Bulk link all POIs to track
        let linked_count =
            Self::bulk_link_pois_to_track(pool, track_id, &poi_ids_with_order).await?;

        let pipeline_elapsed = pipeline_start.elapsed().as_secs_f64();
        crate::metrics::observe_poi_link_duration("link_pois_to_track", pipeline_elapsed);

        info!(
            "Successfully linked {} out of {} POIs to track {} in {:.3}s",
            linked_count, total_waypoints, track_id, pipeline_elapsed
        );

        if pipeline_elapsed > 1.0 {
            warn!(
                "[poi_deduplication] linking {} POIs took {:.3}s for track {}",
                total_waypoints, pipeline_elapsed, track_id
            );
        }

        Ok(linked_count)
    }

    /// Find potential duplicates using fuzzy matching
    /// Used for suggesting merges to users
    #[allow(dead_code)]
    pub async fn find_potential_duplicates(
        pool: &PgPool,
        poi_id: i32,
        similarity_threshold: f32,
        distance_threshold_m: f32,
    ) -> Result<Vec<i32>, sqlx::Error> {
        debug!(
            "Finding potential duplicates for POI {} (similarity: {}, distance: {}m)",
            poi_id, similarity_threshold, distance_threshold_m
        );

        let results = sqlx::query_scalar::<_, i32>(
            r#"
            SELECT p2.id
            FROM pois p1
            JOIN pois p2 ON p2.id != p1.id
            WHERE p1.id = $1
              AND ST_DWithin(p1.geom, p2.geom, $2)
              AND similarity(p1.name, p2.name) > $3
            ORDER BY ST_Distance(p1.geom, p2.geom), similarity(p1.name, p2.name) DESC
            LIMIT 10
            "#,
        )
        .bind(poi_id)
        .bind(distance_threshold_m as f64)
        .bind(similarity_threshold)
        .fetch_all(pool)
        .await?;

        debug!("Found {} potential duplicates", results.len());

        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ParsedWaypoint;

    #[test]
    fn test_poi_deduplication_service_exists() {
        // Ensure the service can be instantiated
        let _service = PoiDeduplicationService;
    }

    #[test]
    fn test_parsed_waypoint_creation() {
        let waypoint = ParsedWaypoint {
            name: "Test Summit".to_string(),
            description: Some("A beautiful mountain peak".to_string()),
            category: Some("Summit".to_string()),
            lat: 55.7558,
            lon: 37.6173,
            elevation: Some(2500.0),
        };

        assert_eq!(waypoint.name, "Test Summit");
        assert_eq!(waypoint.lat, 55.7558);
        assert_eq!(waypoint.lon, 37.6173);
        assert_eq!(waypoint.elevation, Some(2500.0));
    }

    #[test]
    fn test_parsed_waypoint_minimal() {
        // Test with minimal data (no description, category, or elevation)
        let waypoint = ParsedWaypoint {
            name: "Minimal POI".to_string(),
            description: None,
            category: None,
            lat: 50.0,
            lon: 10.0,
            elevation: None,
        };

        assert_eq!(waypoint.name, "Minimal POI");
        assert!(waypoint.description.is_none());
        assert!(waypoint.category.is_none());
        assert!(waypoint.elevation.is_none());
    }

    #[test]
    fn test_generate_dedup_key_and_deduplicate_waypoints() {
        // Two waypoints with slightly different coordinates but same rounded values
        let wp1 = ParsedWaypoint {
            name: "Dup POI".to_string(),
            description: Some("desc".to_string()),
            category: Some("dot".to_string()),
            lat: 55.12344,
            lon: 37.12344,
            elevation: None,
        };
        let wp2 = ParsedWaypoint {
            name: "Dup POI".to_string(),
            description: Some("desc2".to_string()),
            category: Some("dot".to_string()),
            // Slightly different coords but rounds to same 4 decimals for dedup key
            lat: 55.12343,
            lon: 37.12342,
            elevation: None,
        };

        let waypoints = vec![wp1.clone(), wp2.clone()];
        let deduped = PoiDeduplicationService::deduplicate_waypoints(&waypoints);
        // Should keep only the first occurrence
        assert_eq!(deduped.len(), 1);
        assert_eq!(deduped[0].0, 0_usize);
        // Ensure generated key is the same for both
        let k1 = PoiDeduplicationService::generate_dedup_key(&wp1);
        let k2 = PoiDeduplicationService::generate_dedup_key(&wp2);
        assert_eq!(k1, k2);
    }
}
