-- Migration: Add roles and last_login_at to users

-- Add roles column with default role
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT ARRAY['user']::text[];

-- Add last_login_at for tracking logins
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Backfill last_login_at for existing rows
UPDATE users
SET last_login_at = updated_at
WHERE last_login_at IS NULL;
