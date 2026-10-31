-- Run after 006_comments_notifications.sql
-- Profile fields: display name, WhatsApp number, and notification toggles.
-- last_seen_at and binder_paused already come from 004.

ALTER TABLE friends ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE friends ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE friends ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE friends SET display_name = name WHERE display_name IS NULL OR display_name = '';
