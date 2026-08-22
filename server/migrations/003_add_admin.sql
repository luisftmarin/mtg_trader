-- Run this against your Supabase/Neon database after 001_init.sql and 002_add_auth.sql

ALTER TABLE friends ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- To make an existing trader an admin directly in SQL, run:
--   UPDATE friends SET is_admin = true WHERE name = 'their-name-here';
