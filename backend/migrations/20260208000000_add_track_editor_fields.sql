-- Migration: Add track editor fields (waypoints, is_draft)
-- Supports interactive track creation and editing per create-and-edit-tracks.md

-- Add waypoints column to store user-placed control points
-- Stored as JSONB array: [{"lat": 55.0, "lon": 37.0, "index": 0}, ...]
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS waypoints JSONB;

-- Add is_draft flag to distinguish saved tracks from in-progress edits
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;

-- Add source field to distinguish file-uploaded tracks from manually created ones
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'upload';

-- Index for drafts lookup (users checking their own drafts)
CREATE INDEX IF NOT EXISTS idx_tracks_is_draft ON tracks(is_draft) WHERE is_draft = TRUE;

-- Comments
COMMENT ON COLUMN tracks.waypoints IS 'User-placed control points for manually created tracks, JSONB array of {lat, lon, index}';
COMMENT ON COLUMN tracks.is_draft IS 'Whether the track is a draft (not yet saved/published)';
COMMENT ON COLUMN tracks.source IS 'Track creation source: upload (file), editor (manual), duplicate (copy)';
