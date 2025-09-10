-- Add slope-related fields to tracks table
ALTER TABLE tracks ADD COLUMN slope_min REAL;
ALTER TABLE tracks ADD COLUMN slope_max REAL;
ALTER TABLE tracks ADD COLUMN slope_avg REAL;
ALTER TABLE tracks ADD COLUMN slope_histogram JSONB;
ALTER TABLE tracks ADD COLUMN slope_bucket_mask BIGINT;
ALTER TABLE tracks ADD COLUMN slope_calculated BOOLEAN DEFAULT FALSE;
ALTER TABLE tracks ADD COLUMN slope_calculated_at TIMESTAMP;
ALTER TABLE tracks ADD COLUMN uphill_distance_percent REAL;
ALTER TABLE tracks ADD COLUMN downhill_distance_percent REAL;

-- Create index on slope_min and slope_max for efficient filtering
CREATE INDEX idx_tracks_slope_min ON tracks(slope_min);
CREATE INDEX idx_tracks_slope_max ON tracks(slope_max);

-- Create index on slope_bucket_mask for efficient bitmask filtering
CREATE INDEX idx_tracks_slope_bucket_mask ON tracks(slope_bucket_mask);

-- Create index on slope_calculated for filtering tracks that need slope calculation
CREATE INDEX idx_tracks_slope_calculated ON tracks(slope_calculated);

-- Add comments for clarity
COMMENT ON COLUMN tracks.slope_min IS 'Minimum slope percentage in track (from smoothed slope calculation)';
COMMENT ON COLUMN tracks.slope_max IS 'Maximum slope percentage in track (from smoothed slope calculation)';
COMMENT ON COLUMN tracks.slope_avg IS 'Average slope percentage weighted by segment length';
COMMENT ON COLUMN tracks.slope_histogram IS 'Histogram of slope distribution by predefined buckets';
COMMENT ON COLUMN tracks.slope_bucket_mask IS 'Bitmask for efficient slope range filtering (each bit represents a histogram bucket)';
COMMENT ON COLUMN tracks.slope_calculated IS 'Whether slope data has been calculated for this track';
COMMENT ON COLUMN tracks.slope_calculated_at IS 'Timestamp when slope data was calculated';
COMMENT ON COLUMN tracks.uphill_distance_percent IS 'Percentage of track distance with positive slope (uphill)';
COMMENT ON COLUMN tracks.downhill_distance_percent IS 'Percentage of track distance with negative slope (downhill)';
