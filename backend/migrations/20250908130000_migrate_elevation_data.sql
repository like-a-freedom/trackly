-- Migrate elevation data from old fields to new unified schema
-- This migration moves data from elevation_up/elevation_down to elevation_gain/elevation_loss

-- Step 1: Migrate existing data from old fields to new fields
UPDATE tracks 
SET 
    elevation_gain = elevation_up,
    elevation_loss = elevation_down
WHERE 
    elevation_up IS NOT NULL 
    AND elevation_gain IS NULL;

-- Step 2: Mark these tracks as having been processed (but not enriched via API)
UPDATE tracks 
SET 
    elevation_enriched = false,
    elevation_dataset = 'original_gpx'
WHERE 
    elevation_gain IS NOT NULL 
    AND elevation_enriched IS NULL;

-- Step 3: Drop old columns (they are no longer needed)
ALTER TABLE tracks DROP COLUMN IF EXISTS elevation_up;
ALTER TABLE tracks DROP COLUMN IF EXISTS elevation_down;

-- Add comments for clarity
COMMENT ON COLUMN tracks.elevation_gain IS 'Total elevation gain in meters (from enrichment API or original track data)';
COMMENT ON COLUMN tracks.elevation_loss IS 'Total elevation loss in meters (from enrichment API or original track data)';
COMMENT ON COLUMN tracks.elevation_min IS 'Minimum elevation in meters (from enrichment API)';
COMMENT ON COLUMN tracks.elevation_max IS 'Maximum elevation in meters (from enrichment API)';
COMMENT ON COLUMN tracks.elevation_enriched IS 'Whether elevation data was enriched via external API';
COMMENT ON COLUMN tracks.elevation_dataset IS 'Source of elevation data: original_gpx, opentopodata, etc.';
