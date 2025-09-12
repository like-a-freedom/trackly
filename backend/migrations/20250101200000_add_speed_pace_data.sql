-- Add speed_data and pace_data fields for storing calculated point-by-point data
-- This moves pace calculation logic from frontend to backend for better architecture

ALTER TABLE tracks 
ADD COLUMN IF NOT EXISTS speed_data JSONB,
ADD COLUMN IF NOT EXISTS pace_data JSONB;

-- Add comments for documentation
COMMENT ON COLUMN tracks.speed_data IS 'Array of speed values (km/h) for each track point, calculated from GPS coordinates and timestamps';
COMMENT ON COLUMN tracks.pace_data IS 'Array of pace values (min/km) for each track point, calculated from speed data';