-- Add migration script here

ALTER TABLE tracks ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;
