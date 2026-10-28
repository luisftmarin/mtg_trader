-- Run after 006_comments_notifications.sql
-- Profile fields: display name, city, and notification toggles.
-- last_seen_at, binder_paused, and default_lang already come from 004.

ALTER TABLE friends ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE friends ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE friends ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE friends SET display_name = name WHERE display_name IS NULL OR display_name = '';
