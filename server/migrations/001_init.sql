-- Run this once against your Supabase/Neon database
-- (Supabase: SQL Editor tab. Neon: their SQL console, or `psql` with your connection string.)

CREATE TABLE IF NOT EXISTS friends (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collection_cards (
  id SERIAL PRIMARY KEY,
  friend_id INTEGER NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  card_name TEXT NOT NULL,
  match_key TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS wishlist_cards (
  id SERIAL PRIMARY KEY,
  friend_id INTEGER NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  card_name TEXT NOT NULL,
  match_key TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_collection_friend ON collection_cards(friend_id);
CREATE INDEX IF NOT EXISTS idx_collection_match_key ON collection_cards(match_key);
CREATE INDEX IF NOT EXISTS idx_wishlist_friend ON wishlist_cards(friend_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_match_key ON wishlist_cards(match_key);
