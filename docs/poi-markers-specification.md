Frontend UX: Cluster visuals & interactions
Implementation status (as of 2025-12-05):
- Client-side clustering: implemented using `leaflet.markercluster` and `PoiClusterGroup.vue`.
- Clusters should display a bubble with a numeric count and an optional category icon when all POIs in the cluster share the same category.
- Color code clusters by density thresholds (e.g., 2–9, 10–49, 50+), with larger clusters shown with more prominent colors.
- On cluster click:
    - If the cluster contains fewer POIs than `SPIDERFY_THRESHOLD` (e.g. 12), expand with a spiderfy animation to reveal points.
    - Otherwise, zoom the map to the cluster bounding box.
- On cluster hover, show a quick popup summarizing: count, sample POI names, top categories.
 - Clustering is client-only and is not toggleable in settings (no server-side mode available).
# POI/Marker Loading and Display Functionality - Technical Specification

## 1. Overview

This specification defines the functionality for loading Points of Interest (POI) from GPX track files and displaying them on the map. The system will extract waypoints from GPX files, deduplicate them intelligently, and provide a robust API for managing and displaying these markers.

## 2. Requirements

### 2.1 Functional Requirements

1. **Extract waypoints from GPX files** during track upload
2. **Deduplicate POIs** based on location and name
3. **Associate POIs with tracks** while allowing sharing across multiple tracks
4. **Display POIs on the map** with appropriate clustering
5. **Manage POI lifecycle** including creation, deletion, and updates
6. **Search and filter POIs** by various criteria
7. **Cluster POIs dynamically** by zoom level and bounding box for dense areas, with both server-side and client-side clustering strategies to ensure good UX and minimal traffic/CPU use.

### 2.2 Non-Functional Requirements

1. **Performance**: Efficient queries for large datasets (10,000+ POIs)
2. **Data Integrity**: Prevent orphaned POIs and maintain referential integrity
3. **Scalability**: Support growth to 100,000+ POIs
4. **Security**: Proper ownership validation and access control
5. **Responsiveness**: Map interactions (panning/zooming) must remain responsive with POIs and clusters loaded within 200ms for common viewport sizes.

## 3. Database Schema

### 3.1 POIs Table

```sql
CREATE TABLE IF NOT EXISTS pois (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
    description TEXT,
    category VARCHAR(50),
    elevation REAL,
    geom GEOGRAPHY(Point, 4326) NOT NULL,
    dedup_hash VARCHAR(64) NOT NULL GENERATED ALWAYS AS (
        MD5(
            LPAD(FLOOR((ST_Y(geom::geometry) * 100000)::BIGINT)::TEXT, 10, '0') || 
            LPAD(FLOOR((ST_X(geom::geometry) * 100000)::BIGINT)::TEXT, 10, '0') || 
            LOWER(TRIM(name))
        )
    ) STORED,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE UNIQUE INDEX pois_dedup_hash_idx ON pois(dedup_hash);
CREATE INDEX pois_geom_idx ON pois USING GIST(geom);
CREATE INDEX pois_category_idx ON pois(category);
CREATE INDEX pois_session_id_idx ON pois(session_id);
CREATE INDEX pois_name_trgm_idx ON pois USING GIN(name gin_trgm_ops);
CREATE INDEX pois_description_trgm_idx ON pois USING GIN(description gin_trgm_ops);

-- Enable trigram similarity for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

COMMENT ON COLUMN pois.dedup_hash IS 'Hash for deduplication: coordinates rounded to ~1m + lowercase name';
COMMENT ON COLUMN pois.session_id IS 'Owner of manually created POI, NULL for POIs from track uploads';
```

### 3.2 Track-POI Association Table

```sql
CREATE TABLE IF NOT EXISTS track_pois (
    track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    poi_id INTEGER NOT NULL REFERENCES pois(id) ON DELETE CASCADE,
    distance_from_start_m REAL,
    sequence_order INTEGER,
    PRIMARY KEY (track_id, poi_id)
);

CREATE INDEX track_pois_track_id_idx ON track_pois(track_id);
CREATE INDEX track_pois_poi_id_idx ON track_pois(poi_id);
CREATE INDEX track_pois_sequence_idx ON track_pois(track_id, sequence_order);

COMMENT ON TABLE track_pois IS 'Many-to-many relationship between tracks and POIs';
COMMENT ON COLUMN track_pois.distance_from_start_m IS 'Distance along track geometry from start to POI';
COMMENT ON COLUMN track_pois.sequence_order IS 'Order of POI along the track';
```

### 3.3 Audit Log Table

```sql
CREATE TABLE IF NOT EXISTS poi_audit_log (
    id SERIAL PRIMARY KEY,
    poi_id INTEGER REFERENCES pois(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL, -- 'created', 'updated', 'merged', 'deleted'
    changed_fields JSONB,
    session_id UUID,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX poi_audit_log_poi_id_idx ON poi_audit_log(poi_id);
CREATE INDEX poi_audit_log_created_at_idx ON poi_audit_log(created_at DESC);

COMMENT ON TABLE poi_audit_log IS 'Audit trail for all POI changes';
```

### 3.4 Database Functions

```sql
-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_poi_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER poi_updated_at_trigger
BEFORE UPDATE ON pois
FOR EACH ROW
EXECUTE FUNCTION update_poi_updated_at();

-- Trigger for audit log
CREATE OR REPLACE FUNCTION poi_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO poi_audit_log (poi_id, action, changed_fields)
        VALUES (NEW.id, 'created', row_to_json(NEW)::jsonb);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO poi_audit_log (poi_id, action, changed_fields)
        VALUES (NEW.id, 'updated', jsonb_build_object(
            'old', row_to_json(OLD)::jsonb,
            'new', row_to_json(NEW)::jsonb
        ));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO poi_audit_log (poi_id, action, changed_fields)
        VALUES (OLD.id, 'deleted', row_to_json(OLD)::jsonb);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER poi_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON pois
FOR EACH ROW
EXECUTE FUNCTION poi_audit_trigger();

-- Function to cleanup orphaned POIs
CREATE OR REPLACE FUNCTION cleanup_orphaned_pois(grace_period_days INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH orphaned AS (
        DELETE FROM pois
        WHERE id NOT IN (SELECT DISTINCT poi_id FROM track_pois)
          AND session_id IS NULL  -- Only auto-created POIs
          AND updated_at < NOW() - (grace_period_days || ' days')::INTERVAL
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM orphaned;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_orphaned_pois IS 'Delete POIs not associated with any track after grace period';

-- Function to calculate distance from track start to POI
CREATE OR REPLACE FUNCTION calculate_poi_distance_on_track(
    p_track_id UUID,
    p_poi_id INTEGER
) RETURNS REAL AS $$
DECLARE
    distance_m REAL;
BEGIN
    SELECT ST_Length(
        ST_LineSubstring(
            t.geom::geography,
            0,
            ST_LineLocatePoint(t.geom, p.geom::geometry)
        )
    ) INTO distance_m
    FROM tracks t, pois p
    WHERE t.id = p_track_id AND p.id = p_poi_id;
    
    RETURN distance_m;
END;
$$ LANGUAGE plpgsql;
```

## 4. Backend Implementation

### 4.1 Data Models

Add to `backend/src/models.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Poi {
    pub id: i32,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub elevation: Option<f32>,
    #[sqlx(json)]
    pub geom: serde_json::Value, // GeoJSON Point
    pub session_id: Option<Uuid>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct PoiWithDistance {
    #[sqlx(flatten)]
    pub poi: Poi,
    pub distance_from_start_m: Option<f32>,
    pub sequence_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePoiRequest {
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub elevation: Option<f32>,
    pub lat: f64,
    pub lon: f64,
    pub session_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct PoiQuery {
    pub bbox: Option<String>, // "minLon,minLat,maxLon,maxLat"
    pub categories: Option<Vec<String>>,
    pub track_id: Option<Uuid>,
    pub search: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct PoiListResponse {
    pub pois: Vec<Poi>,
    pub total: i64,
}

// GPX Waypoint structure
#[derive(Debug, Clone)]
pub struct ParsedWaypoint {
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub elevation: Option<f32>,
}
```

### 4.2 POI Deduplication Service

Create `backend/src/poi_deduplication.rs`:

```rust
use crate::models::{ParsedWaypoint, Poi};
use sqlx::PgPool;
use uuid::Uuid;

pub struct PoiDeduplicationService;

impl PoiDeduplicationService {
    /// Find or create POI using hash-based deduplication
    /// Returns the POI id
    pub async fn find_or_create_poi(
        pool: &PgPool,
        waypoint: &ParsedWaypoint,
    ) -> Result<i32, sqlx::Error> {
        // Use INSERT ON CONFLICT for atomic deduplication
        let result = sqlx::query!(
            r#"
            INSERT INTO pois (name, description, category, elevation, geom)
            VALUES (
                $1, $2, $3, $4,
                ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography
            )
            ON CONFLICT (dedup_hash) DO UPDATE
            SET 
                description = COALESCE(pois.description, EXCLUDED.description),
                category = COALESCE(pois.category, EXCLUDED.category),
                elevation = COALESCE(pois.elevation, EXCLUDED.elevation),
                updated_at = NOW()
            RETURNING id
            "#,
            waypoint.name,
            waypoint.description,
            waypoint.category,
            waypoint.elevation,
            waypoint.lon,
            waypoint.lat
        )
        .fetch_one(pool)
        .await?;

        Ok(result.id)
    }

    /// Link POI to track with distance calculation
    pub async fn link_poi_to_track(
        pool: &PgPool,
        track_id: Uuid,
        poi_id: i32,
        sequence_order: i32,
    ) -> Result<(), sqlx::Error> {
        // Calculate distance from track start
        let distance = sqlx::query_scalar!(
            r#"
            SELECT calculate_poi_distance_on_track($1, $2) as "distance!"
            "#,
            track_id,
            poi_id
        )
        .fetch_one(pool)
        .await?;

        // Insert link
        sqlx::query!(
            r#"
            INSERT INTO track_pois (track_id, poi_id, distance_from_start_m, sequence_order)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (track_id, poi_id) DO UPDATE
            SET distance_from_start_m = EXCLUDED.distance_from_start_m,
                sequence_order = EXCLUDED.sequence_order
            "#,
            track_id,
            poi_id,
            distance,
            sequence_order
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Batch link POIs to track
    pub async fn link_pois_to_track(
        pool: &PgPool,
        track_id: Uuid,
        waypoints: Vec<ParsedWaypoint>,
    ) -> Result<usize, sqlx::Error> {
        let mut count = 0;
        
        for (idx, waypoint) in waypoints.into_iter().enumerate() {
            let poi_id = Self::find_or_create_poi(pool, &waypoint).await?;
            Self::link_poi_to_track(pool, track_id, poi_id, idx as i32).await?;
            count += 1;
        }

        Ok(count)
    }

    /// Find potential duplicates using fuzzy matching
    pub async fn find_potential_duplicates(
        pool: &PgPool,
        poi_id: i32,
        similarity_threshold: f32,
        distance_threshold_m: f32,
    ) -> Result<Vec<Poi>, sqlx::Error> {
        let results = sqlx::query_as!(
            Poi,
            r#"
            SELECT 
                p2.id, p2.name, p2.description, p2.category, p2.elevation,
                ST_AsGeoJSON(p2.geom::geometry)::jsonb as "geom!",
                p2.session_id, p2.created_at, p2.updated_at
            FROM pois p1
            JOIN pois p2 ON p2.id != p1.id
            WHERE p1.id = $1
              AND ST_DWithin(p1.geom, p2.geom, $2)
              AND similarity(p1.name, p2.name) > $3
            ORDER BY ST_Distance(p1.geom, p2.geom), similarity(p1.name, p2.name) DESC
            LIMIT 10
            "#,
            poi_id,
            distance_threshold_m as f64,
            similarity_threshold
        )
        .fetch_all(pool)
        .await?;

        Ok(results)
    }
}

    ### 4.6 POI Clustering

    Current Implementation — Client-side clustering (implemented)
    - Clustering is implemented on the frontend using `leaflet.markercluster` in `frontend/src/components/PoiClusterGroup.vue` (client-side).
    - The frontend uses the `usePois` composable (`frontend/src/composables/usePois.js`) to fetch POIs and optionally request clusters. In practice today, the app fetches raw POIs and performs client-side clustering for responsive UX.
    - Clustering behavior implemented on the frontend:
      - Bubble markers with counts, size + color scaled by density
      - Spiderfy for small clusters (configurable via `PoiClusterGroup` props)
      - Click behavior: spiderfy for small clusters or fit bounds/zoom for larger clusters
      - Toggle to show/hide POIs and clustering controls available in `TrackMap` and `TrackView` integrations

    Strategy & UX
    - CLIENT_CLUSTER_THRESHOLD: the frontend prefers client-side clustering for small-to-moderate numbers of POIs (default threshold ~3000). This keeps in-browser interactions snappy and avoids unnecessary server CPU/bandwidth when not required.

    Backend clustering
    - The current Trackly implementation uses client-side clustering exclusively (Leaflet + PoiClusterGroup.vue). Server-side clustering is not supported.

    Testing & Verification
    - Frontend: unit and integration tests should cover `PoiClusterGroup` rendering, `usePois` composable fetching/estimation behavior, and TrackMap interactions (cluster click, spiderfy, marker popups).
    - Backend: No server-side clustering tests are required for client-side-only clustering.

```

### 4.3 GPX Parser Modifications

Modify `backend/src/track_utils/gpx_parser.rs` to extract waypoints:

```rust
// Add to ParsedTrackData struct in models.rs
pub struct ParsedTrackData {
    // ... existing fields ...
    pub waypoints: Vec<ParsedWaypoint>,
}

// In gpx_parser.rs, add waypoint parsing:
fn parse_gpx(bytes: &[u8]) -> Result<ParsedTrackData, String> {
    // ... existing code ...
    
    let mut waypoints = Vec::new();
    let mut in_wpt = false;
    let mut wpt_name: Option<String> = None;
    let mut wpt_desc: Option<String> = None;
    let mut wpt_type: Option<String> = None;
    let mut wpt_sym: Option<String> = None;
    
    // In the XML parsing loop, add:
    "wpt" => {
        in_wpt = true;
        lat = e.attributes().find_map(|a| {
            a.ok().and_then(|attr| {
                if attr.key.as_ref() == b"lat" {
                    std::str::from_utf8(&attr.value).ok()?.parse::<f64>().ok()
                } else {
                    None
                }
            })
        });
        lon = e.attributes().find_map(|a| {
            a.ok().and_then(|attr| {
                if attr.key.as_ref() == b"lon" {
                    std::str::from_utf8(&attr.value).ok()?.parse::<f64>().ok()
                } else {
                    None
                }
            })
        });
        ele = None;
        wpt_name = None;
        wpt_desc = None;
        wpt_type = None;
        wpt_sym = None;
    }
    "name" => {
        if in_wpt {
            capture_text = true;
            text_target = Some("wpt_name".to_string());
        }
    }
    "desc" => {
        if in_wpt {
            capture_text = true;
            text_target = Some("wpt_desc".to_string());
        }
    }
    "type" => {
        if in_wpt {
            capture_text = true;
            text_target = Some("wpt_type".to_string());
        }
    }
    "sym" => {
        if in_wpt {
            capture_text = true;
            text_target = Some("wpt_sym".to_string());
        }
    }
    
    // In Event::End:
    "wpt" => {
        if let (Some(lat), Some(lon), Some(name)) = (lat, lon, wpt_name.clone()) {
            waypoints.push(ParsedWaypoint {
                name,
                description: wpt_desc.clone(),
                category: wpt_type.or(wpt_sym),
                lat,
                lon,
                elevation: ele.map(|e| e as f32),
            });
        }
        in_wpt = false;
    }
    
    // Return waypoints in ParsedTrackData
}
```

### 4.4 API Endpoints

Add to `backend/src/handlers.rs`:

```rust
use crate::poi_deduplication::PoiDeduplicationService;

/// GET /pois - List POIs with filtering
pub async fn get_pois(
    State(pool): State<Arc<PgPool>>,
    Query(params): Query<PoiQuery>,
) -> Result<Json<PoiListResponse>, StatusCode> {
    let limit = params.limit.unwrap_or(100).min(1000);
    let offset = params.offset.unwrap_or(0);
    
    let mut conditions = Vec::new();
    let mut bind_idx = 1;
    
    // Build WHERE clause
    if params.bbox.is_some() {
        conditions.push(format!("ST_Intersects(geom::geometry, ST_MakeEnvelope(${},${},${},${}, 4326))", 
            bind_idx, bind_idx+1, bind_idx+2, bind_idx+3));
        bind_idx += 4;
    }
    
    if params.categories.is_some() {
        conditions.push(format!("category = ANY(${})", bind_idx));
        bind_idx += 1;
    }
    
    if params.track_id.is_some() {
        conditions.push(format!("id IN (SELECT poi_id FROM track_pois WHERE track_id = ${})", bind_idx));
        bind_idx += 1;
    }
    
    if params.search.is_some() {
        conditions.push(format!("(name ILIKE ${}  OR description ILIKE ${})", bind_idx, bind_idx));
        bind_idx += 1;
    }
    
    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };
    
    // Build query with proper parameter binding
    let query_str = format!(
        r#"
        SELECT 
            id, name, description, category, elevation,
            ST_AsGeoJSON(geom::geometry)::jsonb as geom,
            session_id, created_at, updated_at
        FROM pois
        {}
        ORDER BY created_at DESC
        LIMIT ${}
        OFFSET ${}
        "#,
        where_clause, bind_idx, bind_idx + 1
    );
    
    // Execute with proper bindings (implementation depends on parameters)
    // For safety, use query_as with individual bindings
    
    let pois = if let Some(bbox_str) = &params.bbox {
        let bbox_parts: Vec<f64> = bbox_str
            .split(',')
            .filter_map(|s| s.parse().ok())
            .collect();
        
        if bbox_parts.len() != 4 {
            return Err(StatusCode::BAD_REQUEST);
        }
        
        sqlx::query_as!(
            Poi,
            r#"
            SELECT 
                id, name, description, category, elevation,
                ST_AsGeoJSON(geom::geometry)::jsonb as "geom!",
                session_id, created_at, updated_at
            FROM pois
            WHERE ST_Intersects(
                geom::geometry, 
                ST_MakeEnvelope($1, $2, $3, $4, 4326)
            )
            ORDER BY created_at DESC
            LIMIT $5
            OFFSET $6
            "#,
            bbox_parts[0],
            bbox_parts[1],
            bbox_parts[2],
            bbox_parts[3],
            limit,
            offset
        )
        .fetch_all(&**pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    } else {
        sqlx::query_as!(
            Poi,
            r#"
            SELECT 
                id, name, description, category, elevation,
                ST_AsGeoJSON(geom::geometry)::jsonb as "geom!",
                session_id, created_at, updated_at
            FROM pois
            ORDER BY created_at DESC
            LIMIT $1
            OFFSET $2
            "#,
            limit,
            offset
        )
        .fetch_all(&**pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    };
    
    let total = sqlx::query_scalar!("SELECT COUNT(*) FROM pois")
        .fetch_one(&**pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or(0);
    
    Ok(Json(PoiListResponse { pois, total }))
}

/// GET /pois/:id - Get POI details
pub async fn get_poi(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<i32>,
) -> Result<Json<Poi>, StatusCode> {
    let poi = sqlx::query_as!(
        Poi,
        r#"
        SELECT 
            id, name, description, category, elevation,
            ST_AsGeoJSON(geom::geometry)::jsonb as "geom!",
            session_id, created_at, updated_at
        FROM pois
        WHERE id = $1
        "#,
        id
    )
    .fetch_optional(&**pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;
    
    Ok(Json(poi))
}

// Server-side clustering endpoints are not implemented; client-side clustering is used.

/// GET /tracks/:track_id/pois - Get POIs for a track
pub async fn get_track_pois(
    State(pool): State<Arc<PgPool>>,
    Path(track_id): Path<Uuid>,
) -> Result<Json<Vec<PoiWithDistance>>, StatusCode> {
    let pois = sqlx::query_as!(
        PoiWithDistance,
        r#"
        SELECT 
            p.id, p.name, p.description, p.category, p.elevation,
            ST_AsGeoJSON(p.geom::geometry)::jsonb as "geom!",
            p.session_id, p.created_at, p.updated_at,
            tp.distance_from_start_m, tp.sequence_order
        FROM pois p
        JOIN track_pois tp ON p.id = tp.poi_id
        WHERE tp.track_id = $1
        ORDER BY tp.sequence_order
        "#,
        track_id
    )
    .fetch_all(&**pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(Json(pois))
}

/// POST /pois - Create manual POI
pub async fn create_poi(
    State(pool): State<Arc<PgPool>>,
    Json(request): Json<CreatePoiRequest>,
) -> Result<Json<Poi>, StatusCode> {
    // Validate inputs
    if request.name.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    
    let poi = sqlx::query_as!(
        Poi,
        r#"
        INSERT INTO pois (name, description, category, elevation, geom, session_id)
        VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7)
        RETURNING 
            id, name, description, category, elevation,
            ST_AsGeoJSON(geom::geometry)::jsonb as "geom!",
            session_id, created_at, updated_at
        "#,
        request.name.trim(),
        request.description,
        request.category,
        request.elevation,
        request.lon,
        request.lat,
        request.session_id
    )
    .fetch_one(&**pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(Json(poi))
}

/// DELETE /tracks/:track_id/pois/:poi_id - Unlink POI from track
pub async fn unlink_track_poi(
    State(pool): State<Arc<PgPool>>,
    Path((track_id, poi_id)): Path<(Uuid, i32)>,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query!(
        "DELETE FROM track_pois WHERE track_id = $1 AND poi_id = $2",
        track_id,
        poi_id
    )
    .execute(&**pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    
    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /pois/:id - Delete POI (only if not used and user is owner)
pub async fn delete_poi(
    State(pool): State<Arc<PgPool>>,
    Path(id): Path<i32>,
    Json(request): Json<serde_json::Value>,
) -> Result<StatusCode, StatusCode> {
    let session_id = request
        .get("session_id")
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok());
    
    // Check ownership and usage
    let poi = sqlx::query!(
        r#"
        SELECT 
            session_id,
            (SELECT COUNT(*) FROM track_pois WHERE poi_id = $1) as "usage_count!"
        FROM pois
        WHERE id = $1
        "#,
        id
    )
    .fetch_optional(&**pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;
    
    // Only allow deletion if:
    // 1. POI is not used in any track
    // 2. User is the owner (session_id matches) or POI has no owner (auto-created)
    if poi.usage_count > 0 {
        return Err(StatusCode::CONFLICT); // 409: POI is in use
    }
    
    if let Some(owner_id) = poi.session_id {
        if Some(owner_id) != session_id {
            return Err(StatusCode::FORBIDDEN); // 403: Not the owner
        }
    }
    
    sqlx::query!("DELETE FROM pois WHERE id = $1", id)
        .execute(&**pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(StatusCode::NO_CONTENT)
}

/// Modify upload_track handler to process waypoints
pub async fn upload_track(
    State(pool): State<Arc<PgPool>>,
    mut multipart: AxumMultipart,
) -> Result<Json<TrackUploadResponse>, StatusCode> {
    // ... existing code to parse GPX ...
    
    // After inserting track, process waypoints
    if !parsed.waypoints.is_empty() {
        let linked_count = PoiDeduplicationService::link_pois_to_track(
            &pool,
            id,
            parsed.waypoints,
        )
        .await
        .map_err(|e| {
            tracing::error!("Failed to link POIs: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        
        tracing::info!("Linked {} POIs to track {}", linked_count, id);
    }
    
    // ... rest of the function ...
}
```

### 4.5 Router Configuration

Add to `backend/src/main.rs`:

```rust
let app = Router::new()
    // Existing routes...
    .route("/pois", get(handlers::get_pois).post(handlers::create_poi))
    .route("/pois/:id", get(handlers::get_poi).delete(handlers::delete_poi))
    .route("/tracks/:track_id/pois", get(handlers::get_track_pois))
    .route("/tracks/:track_id/pois/:poi_id", delete(handlers::unlink_track_poi))
    // NOTE: The server routes for basic POI CRUD operations used by the frontend.
    .with_state(Arc::new(pool));
```

## 5. Frontend Implementation

### 5.1 POI Store (Pinia)

Create `frontend/src/stores/poiStore.js`:

```javascript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const usePoiStore = defineStore('poi', () => {
    const pois = ref([]);
    const loading = ref(false);
    const error = ref(null);
  
  async function fetchPois(bbox = null, trackId = null) {
    loading.value = true;
    error.value = null;
    
    try {
      const params = new URLSearchParams();
      if (bbox) params.append('bbox', bbox);
      if (trackId) params.append('track_id', trackId);
      
      const response = await fetch(`/pois?${params}`);
      if (!response.ok) throw new Error('Failed to fetch POIs');
      
      const data = await response.json();
    pois.value = data.pois;
    } catch (e) {
      error.value = e.message;
      console.error('Error fetching POIs:', e);
    } finally {
      loading.value = false;
    }
  }
  
  async function fetchTrackPois(trackId) {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await fetch(`/tracks/${trackId}/pois`);
      if (!response.ok) throw new Error('Failed to fetch track POIs');
      
      const data = await response.json();
      return data;
    } catch (e) {
      error.value = e.message;
      console.error('Error fetching track POIs:', e);
      return [];
    } finally {
      loading.value = false;
    }
  }

    // Server-side clustering is not used in the current implementation.
    // The frontend relies on client-side clustering via PoiClusterGroup.vue.
  
    return {
        pois,
        
        loading,
        error,
        fetchPois,
        fetchTrackPois,
        
    };
});
```

### 5.2 POI Marker Component

Create `frontend/src/components/PoiMarker.vue`:

```vue
<template>
  <l-marker
    :lat-lng="[poi.geom.coordinates[1], poi.geom.coordinates[0]]"
    @click="handleClick"
  >
    <l-icon
      :icon-url="getIconUrl()"
      :icon-size="[32, 32]"
      :icon-anchor="[16, 32]"
    />
    <l-tooltip>
      <div class="poi-tooltip">
        <h4>{{ poi.name }}</h4>
        <p v-if="poi.description">{{ poi.description }}</p>
        <span v-if="poi.category" class="category">{{ poi.category }}</span>
        <span v-if="poi.elevation" class="elevation">{{ poi.elevation }}m</span>
      </div>
    </l-tooltip>
  </l-marker>
</template>

<script setup>
import { LMarker, LIcon, LTooltip } from '@vue-leaflet/vue-leaflet';

const props = defineProps({
  poi: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['click']);

function getIconUrl() {
  // Return appropriate icon based on category
  const category = props.poi.category?.toLowerCase() || 'generic';
  return `/icons/poi-${category}.png`;
}

function handleClick() {
  emit('click', props.poi);
}
</script>

<style scoped>
.poi-tooltip {
  min-width: 150px;
}

.poi-tooltip h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: bold;
}

.poi-tooltip p {
  margin: 0 0 4px 0;
  font-size: 12px;
}

.category,
.elevation {
  display: inline-block;
  margin-right: 8px;
  font-size: 11px;
  color: #666;
}
</style>

### 5.2.1 POI Cluster Marker Component

Create `frontend/src/components/PoiClusterMarker.vue`:

```vue
<template>
    <l-marker :lat-lng="[cluster.geometry.coordinates[1], cluster.geometry.coordinates[0]]" @click="onClick">
        <div class="poi-cluster-marker" :style="markerStyle">
            <span class="count">{{ cluster.properties.point_count }}</span>
        </div>
    </l-marker>
</template>

<script setup>
import { computed } from 'vue';
import { LMarker } from '@vue-leaflet/vue-leaflet';

const props = defineProps({
    cluster: { type: Object, required: true }
});
const emit = defineEmits(['click']);

const markerStyle = computed(() => {
    const count = props.cluster.properties.point_count || 0;
    const size = Math.min(48, 24 + Math.ceil(Math.log2(Math.max(1, count))) * 8);
    return {
        width: size + 'px',
        height: size + 'px',
        borderRadius: '50%',
        background: '#2b86f3',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        border: '3px solid rgba(255,255,255,0.9)'
    };
});

function onClick() {
    emit('click', props.cluster);
}
</script>

<style scoped>
.poi-cluster-marker { cursor: pointer; }
.poi-cluster-marker .count { font-weight: 700; }
</style>
```
```

### 5.3 TrackMap Integration

Modify `frontend/src/components/TrackMap.vue`:

```vue
<script setup>
import { ref, watch, computed } from 'vue';
import { usePoiStore } from '@/stores/poiStore';
import PoiMarker from './PoiMarker.vue';

const poiStore = usePoiStore();
const map = ref(null);
const showPois = ref(true);

// Watch map bounds and fetch POIs for client-side clustering
// Strategy: Always fetch raw POIs for the bounding box and render them client-side
watch(() => map.value?.getBounds(), (bounds) => {
    if (!bounds || !showPois.value) return;

    const bbox = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
    ].join(',');

    // Debounce requests and fetch POIs for client-side clustering
    debounce(async () => {
        try {
            await poiStore.fetchPois(bbox);
        } catch (e) {
            console.error('[TrackMap] Error fetching POIs:', e);
        }
    }, 300);
}, { deep: true });

// Debounce helper
let debounceTimer;
function debounce(fn, delay) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, delay);
}
</script>

<template>
  <div class="track-map">
    <l-map ref="map" :zoom="13" :center="[55.7558, 37.6173]">
      <l-tile-layer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      <!-- Existing track layers -->
      
            <!-- POI Markers / Clusters -->
            <template v-if="showPois">
                <!-- Clusters returned by server: feature collection in poiStore.clusters -->
                <template v-if="poiStore.clusters && poiStore.clusters.length > 0">
                    <component
                        v-for="feature in poiStore.clusters"
                        :key="feature.properties.cluster ? `cluster-${feature.properties.cluster_id}` : `poi-${feature.properties.id}`"
                        :is="feature.properties.cluster ? 'PoiClusterMarker' : 'PoiMarker'"
                        :cluster="feature.properties.cluster ? feature : null"
                        :poi="!feature.properties.cluster ? feature.properties : null"
                        @click="(f) => {
                            // Cluster click behavior
                            // If cluster -> fitBounds & optionally request child POIs for the cluster
                            if (f.properties.cluster) {
                                // Fit to cluster bounds (server can include cluster_bbox)
                                if (f.properties.cluster_bbox) {
                                    const bbox = f.properties.cluster_bbox; // [west, south, east, north]
                                    const boundsObj = [[bbox[1], bbox[0]], [bbox[3], bbox[2]]];
                                    map.value.fitBounds(boundsObj, { animate: true });
                                } else {
                                    // fallback: zoom a couple of levels
                                    const nextZoom = Math.min(map.value.getMaxZoom(), map.value.getZoom() + 2);
                                    map.value.setZoom(nextZoom);
                                }
                            } else {
                                handlePoiClick(f.properties);
                            }
                        }"
                    />
                </template>
                <!-- Or raw POIs when using client-side clustering / small counts -->
                <template v-else>
                    <poi-marker
                        v-for="poi in poiStore.pois"
                        :key="poi.id"
                        :poi="poi"
                        @click="handlePoiClick"
                    />
                </template>
            </template>
    </l-map>
    
    <div class="map-controls">
      <button @click="showPois = !showPois">
        {{ showPois ? 'Hide' : 'Show' }} POIs
      </button>
    </div>
  </div>
</template>
```

## 6. Performance Optimization

### 6.1 Materialized Views for Analytics

```sql
CREATE MATERIALIZED VIEW poi_stats AS
SELECT 
    category,
    COUNT(*) as count,
    AVG(elevation) as avg_elevation,
    COUNT(DISTINCT tp.track_id) as tracks_using
FROM pois p
LEFT JOIN track_pois tp ON p.id = tp.poi_id
GROUP BY category;

CREATE INDEX poi_stats_category_idx ON poi_stats(category);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_poi_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY poi_stats;
END;
$$ LANGUAGE plpgsql;
```

### 6.2 Query Optimization

- Use prepared statements for all queries
- Enable `pg_stat_statements` for monitoring
- Create appropriate indexes (already defined in schema)
- Use `EXPLAIN ANALYZE` for slow queries
- Clustering caching: Use Redis or Postgres materialized views to store and serve cluster tiles by zoom/tile coordinates. Key format: `poi:clusters:z:{zoom}:x:{tileX}:y:{tileY}` with TTL 30–60s for active tiles. If using a materialized view in Postgres, refresh concurrently in the background or rebuild on index change.

### 6.3 Connection Pooling

Configure sqlx pool in `backend/src/main.rs`:

```rust
let pool = PgPoolOptions::new()
    .max_connections(20)
    .acquire_timeout(Duration::from_secs(5))
    .connect(&database_url)
    .await?;

-- Client-side clustering advice for performance
- When implementing client-side clustering, prefer `supercluster` for performance and predictability.
- The frontend should cap raw POI arrays to the CLIENT_CLUSTER_THRESHOLD (e.g., 3000) to avoid high memory usage in browsers. For larger results, use bounding, limiting, or pagination strategies to reduce the data sent to clients and keep clustering local.
```

## 7. Testing Strategy

### 7.1 Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_poi_deduplication() {
        // Test that identical POIs are deduplicated
    }
    
    #[tokio::test]
    async fn test_poi_linking() {
        // Test POI-track associations
    }
    
    #[tokio::test]
    async fn test_distance_calculation() {
        // Test distance from track start calculation
    }
}
```

### 7.2 Integration Tests

```rust
#[tokio::test]
async fn test_upload_track_with_waypoints() {
    // Test full workflow: upload GPX with waypoints
    // Verify waypoints are extracted and linked
}

#[tokio::test]
async fn test_poi_api_endpoints() {
    // Test all CRUD operations
}

#[tokio::test]
async fn test_poi_client_side_clustering_rendering() {
    // Client-side tests: ensure the frontend clusters POIs correctly using PoiClusterGroup
    // - Create synthetic POIs inside a bbox with known distribution
    // - Render the TrackMap/ POI components in test environment
    // - Verify number of rendered cluster markers and unclustered markers match expectations
    // - Verify spiderfy/zoom-to-bounds behavior on cluster interactions
}
```

## 8. Migration Plan

### 8.1 Database Migration

Create `backend/migrations/YYYYMMDDHHMMSS_add_poi_tables.sql`:

```sql
-- Include all schema from section 3
```

### 8.2 Deployment Steps

1. **Backup database** before migration
2. **Run migrations** with `sqlx migrate run`
3. **Deploy backend** with new POI endpoints
4. **Deploy frontend** with POI visualization
5. **Monitor performance** and optimize as needed

### 8.3 Rollback Plan

```sql
-- Rollback migration if needed
DROP TRIGGER IF EXISTS poi_audit_trigger ON pois;
DROP TRIGGER IF EXISTS poi_updated_at_trigger ON pois;
DROP FUNCTION IF EXISTS cleanup_orphaned_pois CASCADE;
DROP FUNCTION IF EXISTS calculate_poi_distance_on_track CASCADE;
DROP FUNCTION IF EXISTS update_poi_updated_at CASCADE;
DROP FUNCTION IF EXISTS poi_audit_trigger CASCADE;
DROP TABLE IF EXISTS poi_audit_log CASCADE;
DROP TABLE IF EXISTS track_pois CASCADE;
DROP TABLE IF EXISTS pois CASCADE;
```

## 9. Monitoring and Maintenance

### 9.1 Key Metrics

- POI query response time
- Number of POIs per track
- Deduplication hit rate
- Orphaned POI count

### 9.2 Scheduled Maintenance

```sql
-- Run weekly to cleanup orphaned POIs
SELECT cleanup_orphaned_pois(7);

-- Refresh materialized views daily
SELECT refresh_poi_stats();
```

### 9.3 Alerts

Set up monitoring for:
- Slow POI queries (>100ms)
- High orphaned POI count (>1000)
- Failed POI extractions during upload

## 10. Future Enhancements

1. **Clustering on map**: Use MarkerCluster for large POI datasets
2. **POI categories**: Predefined category system with icons
3. **POI photos**: Allow attaching images to POIs
4. **POI ratings**: User ratings and reviews
5. **Export POIs**: Export as separate GPX file
6. **Import POIs**: Batch import from CSV/GPX
7. **POI merge UI**: Manual merge interface for duplicates
8. **POI suggestions**: ML-based duplicate detection

## 11. Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Performance degradation with 100K+ POIs | High | Proper indexing, materialized views, pagination |
| Incorrect deduplication | Medium | Fuzzy matching for suggestions, manual merge UI |
| Orphaned POIs accumulating | Low | Automated cleanup with grace period |
| Security: unauthorized POI deletion | High | Strict ownership validation |

## 12. Success Criteria

1. ✅ Waypoints extracted from 100% of uploaded GPX files
2. ✅ POI queries respond in <100ms for 10K POIs
3. ✅ Deduplication accuracy >95%
4. ✅ Zero orphaned POIs after cleanup
5. ✅ Frontend displays POIs with <500ms load time

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-10  
**Status**: Ready for Implementation
