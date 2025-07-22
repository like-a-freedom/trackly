-- Trackly DB schema (PostgreSQL + PostGIS)
-- Table: tracks
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    categories TEXT[] NOT NULL,
    geom geometry(LineString, 4326) NOT NULL,
    length_km DOUBLE PRECISION NOT NULL,
    elevation_profile JSONB,
    elevation_up DOUBLE PRECISION,
    elevation_down DOUBLE PRECISION,
    avg_speed DOUBLE PRECISION,
    avg_hr INTEGER,
    hr_data JSONB,
    duration_seconds INTEGER,
    hash TEXT NOT NULL,
    recorded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ,
    session_id UUID,
    is_public BOOLEAN DEFAULT TRUE,
    moving_time INTEGER, -- seconds in motion
    pause_time INTEGER, -- seconds paused
    moving_avg_speed DOUBLE PRECISION, -- km/h
    moving_avg_pace DOUBLE PRECISION, -- min/km
    hr_min INTEGER,
    hr_max INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS tracks_hash_idx ON tracks(hash);

-- 1. Add spatial index for geom
CREATE INDEX IF NOT EXISTS tracks_geom_idx ON tracks USING GIST (geom);

-- 2. Add constraint for geometry validity
ALTER TABLE tracks DROP CONSTRAINT IF EXISTS tracks_geom_valid;
ALTER TABLE tracks ADD CONSTRAINT tracks_geom_valid CHECK (ST_IsValid(geom));

-- 4. Document SRID and geometry column
COMMENT ON COLUMN tracks.geom IS 'Track geometry, LineString, SRID=4326 (WGS84)';

-- Add trigger to update updated_at on row update
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_tracks_updated_at ON tracks;
CREATE TRIGGER set_tracks_updated_at
BEFORE UPDATE ON tracks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Table: sessions (for anonymous delete)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now()
);
