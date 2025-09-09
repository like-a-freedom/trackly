-- Add index on elevation_gain for better filter performance
CREATE INDEX IF NOT EXISTS idx_tracks_elevation_gain ON tracks(elevation_gain);

-- Add index on elevation_enriched for filtering tracks that need enrichment
CREATE INDEX IF NOT EXISTS idx_tracks_elevation_enriched ON tracks(elevation_enriched);
