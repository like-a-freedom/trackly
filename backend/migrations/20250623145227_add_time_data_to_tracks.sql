-- Add time_data column to tracks table to store temporal information for each track point
-- This will store an array of timestamps corresponding to each coordinate in the track
ALTER TABLE tracks ADD COLUMN time_data JSONB;

-- Add a comment to document the column
COMMENT ON COLUMN tracks.time_data IS 'Array of ISO8601 timestamps for each track point, corresponding to coordinates in geom_geojson';
