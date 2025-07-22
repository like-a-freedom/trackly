-- Add auto_classifications column to tracks table
-- This column will store automatically determined classifications for tracks
-- Classifications include: interval, fartlek, half_marathon, marathon, trail, hiking, 
-- walk, aerobic_run, tempo_run, recovery_run, long_run

ALTER TABLE tracks 
ADD COLUMN auto_classifications TEXT[] DEFAULT '{}';

-- Add comment to document the column purpose
COMMENT ON COLUMN tracks.auto_classifications IS 'Automatically determined track classifications based on metrics analysis';

-- Add index for querying tracks by classifications
CREATE INDEX IF NOT EXISTS tracks_auto_classifications_idx ON tracks USING GIN (auto_classifications);
