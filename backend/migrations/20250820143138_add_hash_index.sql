-- Add index on hash field for faster track existence checks
-- This will dramatically improve performance for duplicate checking

CREATE INDEX idx_tracks_hash ON tracks(hash);
