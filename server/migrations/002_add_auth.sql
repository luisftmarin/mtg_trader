-- Run this against your Supabase/Neon database after 001_init.sql

ALTER TABLE friends ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Note: any traders created before this migration won't have a password set.
-- They'll need to be re-created (delete + sign up again) since there's no
-- way to log in to an account with no password on file.
