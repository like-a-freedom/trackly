-- Add elevation-related fields to tracks table
ALTER TABLE tracks ADD COLUMN elevation_gain REAL;
ALTER TABLE tracks ADD COLUMN elevation_loss REAL;
ALTER TABLE tracks ADD COLUMN elevation_min REAL;
ALTER TABLE tracks ADD COLUMN elevation_max REAL;
ALTER TABLE tracks ADD COLUMN elevation_enriched BOOLEAN DEFAULT FALSE;
ALTER TABLE tracks ADD COLUMN elevation_enriched_at TIMESTAMP;
ALTER TABLE tracks ADD COLUMN elevation_dataset TEXT;
ALTER TABLE tracks ADD COLUMN elevation_api_calls INTEGER DEFAULT 0;

-- Create index on elevation_gain for efficient filtering
CREATE INDEX idx_tracks_elevation_gain ON tracks(elevation_gain);

-- Create table for tracking API usage limits
CREATE TABLE elevation_api_usage (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    api_calls_count INTEGER NOT NULL DEFAULT 0,
    service_name TEXT NOT NULL,
    UNIQUE(date, service_name)
);

-- Create index for efficient daily lookup
CREATE INDEX idx_elevation_api_usage_date_service ON elevation_api_usage(date, service_name);
