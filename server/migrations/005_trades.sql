-- Run after 004_card_meta.sql
-- Trade objects: a match becomes a proposal that can be accepted, declined,
-- withdrawn, or completed. Accepted items reserve copies in the giver's binder.

DO $$ BEGIN
  CREATE TYPE trade_status AS ENUM ('proposed','accepted','completed','declined','withdrawn');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  proposer_id INT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  partner_id  INT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  status trade_status NOT NULL DEFAULT 'proposed',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trade_items (
  id SERIAL PRIMARY KEY,
  trade_id INT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  from_id INT NOT NULL REFERENCES friends(id),
  card_name TEXT NOT NULL,
  match_key TEXT NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  lang CHAR(2),
  eur_at_completion NUMERIC(10,2)
);

CREATE INDEX IF NOT EXISTS trade_items_trade_id_idx ON trade_items(trade_id);
CREATE INDEX IF NOT EXISTS trade_items_from_key_idx ON trade_items(from_id, match_key);
