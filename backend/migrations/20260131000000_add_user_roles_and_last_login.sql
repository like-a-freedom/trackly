-- Migration: Add roles and last_login_at to users

DO $$
BEGIN
    IF to_regclass('public.users') IS NULL THEN
        RAISE NOTICE 'Skipping users role migration because users table does not exist yet';
        RETURN;
    END IF;

    ALTER TABLE users
        ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT ARRAY['user']::text[];

    ALTER TABLE users
        ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

    UPDATE users
    SET last_login_at = updated_at
    WHERE last_login_at IS NULL;
END $$;
