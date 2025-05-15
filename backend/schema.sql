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
    elevation_up DOUBLE PRECISION,
    elevation_down DOUBLE PRECISION,
    avg_speed DOUBLE PRECISION,
    avg_hr INTEGER,
    duration_seconds INTEGER,
    hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    session_id UUID,
    is_public BOOLEAN DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS tracks_hash_idx ON tracks(hash);

-- Table: sessions (for anonymous delete)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now()
);
