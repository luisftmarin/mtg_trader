-- Run after 008_profile_settings.sql
-- Named wishlists: each trader can keep several want-lists (one per deck or
-- trade), and every wishlist card belongs to one of them.

CREATE TABLE IF NOT EXISTS wishlists (
  id SERIAL PRIMARY KEY,
  friend_id INTEGER NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (friend_id, name)
);

ALTER TABLE wishlist_cards ADD COLUMN IF NOT EXISTS list_id INTEGER REFERENCES wishlists(id) ON DELETE CASCADE;

-- Cards saved without a list land in the trader's first list, created on
-- demand. Keeps older API builds (which don't send list_id) working.
CREATE OR REPLACE FUNCTION wishlist_cards_default_list() RETURNS trigger AS $$
BEGIN
  IF NEW.list_id IS NULL THEN
    SELECT id INTO NEW.list_id FROM wishlists WHERE friend_id = NEW.friend_id ORDER BY id LIMIT 1;
    IF NEW.list_id IS NULL THEN
      INSERT INTO wishlists (friend_id, name) VALUES (NEW.friend_id, 'Wishlist')
      ON CONFLICT (friend_id, name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id INTO NEW.list_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wishlist_cards_default_list ON wishlist_cards;
CREATE TRIGGER wishlist_cards_default_list
  BEFORE INSERT OR UPDATE ON wishlist_cards
  FOR EACH ROW EXECUTE FUNCTION wishlist_cards_default_list();

INSERT INTO wishlists (friend_id, name)
SELECT id, 'Wishlist' FROM friends
ON CONFLICT (friend_id, name) DO NOTHING;

UPDATE wishlist_cards w SET list_id = l.id
FROM wishlists l
WHERE w.list_id IS NULL AND l.friend_id = w.friend_id AND l.name = 'Wishlist';

ALTER TABLE wishlist_cards ALTER COLUMN list_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wishlist_cards_list ON wishlist_cards(list_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_friend ON wishlists(friend_id);
