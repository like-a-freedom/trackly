-- Migration: Add POI (Points of Interest) functionality
-- Creates tables for storing POIs, track-POI associations, and audit logs

-- Enable PostGIS and pg_trgm extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Table: pois
-- Stores Points of Interest extracted from GPX waypoints or created manually
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

-- Indexes for pois table
CREATE UNIQUE INDEX IF NOT EXISTS pois_dedup_hash_idx ON pois(dedup_hash);
CREATE INDEX IF NOT EXISTS pois_geom_idx ON pois USING GIST(geom);
CREATE INDEX IF NOT EXISTS pois_category_idx ON pois(category);
CREATE INDEX IF NOT EXISTS pois_session_id_idx ON pois(session_id);
CREATE INDEX IF NOT EXISTS pois_name_trgm_idx ON pois USING GIN(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS pois_description_trgm_idx ON pois USING GIN(description gin_trgm_ops);

COMMENT ON TABLE pois IS 'Points of Interest from GPX waypoints or manually created';
COMMENT ON COLUMN pois.dedup_hash IS 'Hash for deduplication: coordinates rounded to ~1m + lowercase name';
COMMENT ON COLUMN pois.session_id IS 'Owner of manually created POI, NULL for POIs from track uploads';
COMMENT ON COLUMN pois.geom IS 'POI location, Point, SRID=4326 (WGS84)';

-- Table: track_pois
-- Many-to-many relationship between tracks and POIs
CREATE TABLE IF NOT EXISTS track_pois (
    track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    poi_id INTEGER NOT NULL REFERENCES pois(id) ON DELETE CASCADE,
    distance_from_start_m REAL,
    sequence_order INTEGER,
    PRIMARY KEY (track_id, poi_id)
);

-- Indexes for track_pois table
CREATE INDEX IF NOT EXISTS track_pois_track_id_idx ON track_pois(track_id);
CREATE INDEX IF NOT EXISTS track_pois_poi_id_idx ON track_pois(poi_id);
CREATE INDEX IF NOT EXISTS track_pois_sequence_idx ON track_pois(track_id, sequence_order);

COMMENT ON TABLE track_pois IS 'Association between tracks and POIs';
COMMENT ON COLUMN track_pois.distance_from_start_m IS 'Distance along track geometry from start to POI';
COMMENT ON COLUMN track_pois.sequence_order IS 'Order of POI along the track (0-based)';

-- Table: poi_audit_log
-- Audit trail for all POI changes
CREATE TABLE IF NOT EXISTS poi_audit_log (
    id SERIAL PRIMARY KEY,
    poi_id INTEGER REFERENCES pois(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL,
    changed_fields JSONB,
    session_id UUID,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for poi_audit_log table
CREATE INDEX IF NOT EXISTS poi_audit_log_poi_id_idx ON poi_audit_log(poi_id);
CREATE INDEX IF NOT EXISTS poi_audit_log_created_at_idx ON poi_audit_log(created_at DESC);

COMMENT ON TABLE poi_audit_log IS 'Audit trail for all POI changes';
COMMENT ON COLUMN poi_audit_log.action IS 'Action performed: created, updated, merged, deleted';

-- Function: update_poi_updated_at
-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_poi_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: poi_updated_at_trigger
-- Updates updated_at on each POI update
DROP TRIGGER IF EXISTS poi_updated_at_trigger ON pois;
CREATE TRIGGER poi_updated_at_trigger
BEFORE UPDATE ON pois
FOR EACH ROW
EXECUTE FUNCTION update_poi_updated_at();

-- Function: poi_audit_trigger
-- Trigger function to log all POI changes
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

-- Trigger: poi_audit_trigger
-- Logs all POI changes to audit log
DROP TRIGGER IF EXISTS poi_audit_trigger ON pois;
CREATE TRIGGER poi_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON pois
FOR EACH ROW
EXECUTE FUNCTION poi_audit_trigger();

-- Function: cleanup_orphaned_pois
-- Deletes POIs not associated with any track after grace period
-- Only affects auto-created POIs (session_id IS NULL)
CREATE OR REPLACE FUNCTION cleanup_orphaned_pois(grace_period_days INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH orphaned AS (
        DELETE FROM pois
        WHERE id NOT IN (SELECT DISTINCT poi_id FROM track_pois)
          AND session_id IS NULL
          AND updated_at < NOW() - (grace_period_days || ' days')::INTERVAL
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM orphaned;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_orphaned_pois IS 'Delete auto-created POIs not associated with any track after grace period';

-- Function: calculate_poi_distance_on_track
-- Calculates distance from track start to POI along the track geometry
CREATE OR REPLACE FUNCTION calculate_poi_distance_on_track(
    p_track_id UUID,
    p_poi_id INTEGER
) RETURNS REAL AS $$
DECLARE
    distance_m REAL;
    line_fraction FLOAT;
BEGIN
    -- Get the fraction (0-1) of where POI projects onto track line
    SELECT ST_LineLocatePoint(t.geom, p.geom::geometry)
    INTO line_fraction
    FROM tracks t, pois p
    WHERE t.id = p_track_id AND p.id = p_poi_id;
    
    -- Calculate distance using geography for accurate meters
    SELECT ST_Length(
        ST_LineSubstring(
            t.geom,
            0,
            line_fraction
        )::geography
    ) INTO distance_m
    FROM tracks t
    WHERE t.id = p_track_id;
    
    RETURN distance_m;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_poi_distance_on_track IS 'Calculate distance from track start to POI along track geometry';
