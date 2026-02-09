-- Add distance markers toggle to tracks metadata
ALTER TABLE tracks
    ADD COLUMN IF NOT EXISTS distance_markers_enabled BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN tracks.distance_markers_enabled IS 'Whether distance markers (measure ticks) are displayed on the map';
