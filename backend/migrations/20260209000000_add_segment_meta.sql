-- Add segment metadata for multi-day planning
ALTER TABLE tracks
    ADD COLUMN IF NOT EXISTS segment_meta JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN tracks.segment_meta IS 'Per-segment metadata (name, color) for multi-day planning';
