-- Add slope_segments field to tracks table (hotfix for existing databases)
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS slope_segments JSONB;

-- Add comment for clarity
COMMENT ON COLUMN tracks.slope_segments IS 'Detailed slope segments with coordinates and gradients for visualization';
