-- Run this against your Supabase/Neon database after 003_add_admin.sql
--
-- Adds the server-side Scryfall cache (card images, types, EUR Cardmarket
-- prices) plus the per-row language and the profile columns the redesign
-- needs. Nothing is dropped or renamed.

CREATE TABLE IF NOT EXISTS scryfall_cards (
  match_key TEXT PRIMARY KEY,           -- same normalisation as matchKey()
  scryfall_id UUID,
  name TEXT,
  set_code TEXT,
  set_name TEXT,
  type_line TEXT,
  color_identity TEXT,
  image_small TEXT,
  image_normal TEXT,
  eur NUMERIC(10,2),
  eur_foil NUMERIC(10,2),
  cardmarket_url TEXT,
  fetched_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE collection_cards ADD COLUMN IF NOT EXISTS lang CHAR(2) NOT NULL DEFAULT 'EN';
ALTER TABLE wishlist_cards  ADD COLUMN IF NOT EXISTS lang CHAR(2) NOT NULL DEFAULT 'EN';

ALTER TABLE friends ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS binder_paused BOOLEAN NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS default_lang CHAR(2) NOT NULL DEFAULT 'EN';
