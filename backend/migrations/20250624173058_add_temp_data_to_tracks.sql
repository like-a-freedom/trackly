-- Add temp_data column to tracks table for temperature data from GPX files
ALTER TABLE tracks ADD COLUMN temp_data JSONB;

-- Add comment to document the column
COMMENT ON COLUMN tracks.temp_data IS 'Temperature data points from GPX extensions (atemp), stored as JSON array';
