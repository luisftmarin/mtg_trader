# Implementation notes — mapping the prototype to mtg_trader

Based on `main` @ e2bbc95 (server/src/index.js, matching.js, migrations 001–003, client/src/api.js).

## What already exists and is reused
- `friends` (id, name, password_hash, is_admin) → users/roster. Prototype's "last active" needs `last_seen_at TIMESTAMPTZ` (update in `requireAuth`).
- `collection_cards` / `wishlist_cards` (friend_id, card_name, match_key, qty) → Binder. Keep `match_key`; add the columns below.
- `computeMatches()` → the "You get / You give" lists. Output shape (owner, seeker, cardName, tradeAvailable) is already what the Trades screen renders.
- `PUT /friends/:id/collection|wishlist` (replace whole list) → keep for Import; add row-level endpoints for the +/− qty, language and remove actions.
- `importDeckFromUrl` (Archidekt) → stays; Import drawer adds pasted text.

## New migrations (004–007)

```sql
-- 004_card_meta.sql : Scryfall cache + per-row language
CREATE TABLE IF NOT EXISTS scryfall_cards (
  match_key TEXT PRIMARY KEY,           -- same normalisation as matchKey()
  scryfall_id UUID, name TEXT, set_code TEXT, set_name TEXT, type_line TEXT,
  color_identity TEXT, image_small TEXT, image_normal TEXT,
  eur NUMERIC(10,2), eur_foil NUMERIC(10,2), cardmarket_url TEXT,
  fetched_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE collection_cards ADD COLUMN IF NOT EXISTS lang CHAR(2) NOT NULL DEFAULT 'EN';
ALTER TABLE wishlist_cards  ADD COLUMN IF NOT EXISTS lang CHAR(2) NOT NULL DEFAULT 'EN';
ALTER TABLE friends ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS binder_paused BOOLEAN NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS default_lang CHAR(2) NOT NULL DEFAULT 'EN';

-- 005_trades.sql : a match becomes a trade object
CREATE TYPE trade_status AS ENUM ('proposed','accepted','completed','declined','withdrawn');
CREATE TABLE trades (
  id SERIAL PRIMARY KEY,
  proposer_id INT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  partner_id  INT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  status trade_status NOT NULL DEFAULT 'proposed',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), completed_at TIMESTAMPTZ
);
CREATE TABLE trade_items (
  id SERIAL PRIMARY KEY,
  trade_id INT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  from_id INT NOT NULL REFERENCES friends(id),   -- who gives this card
  card_name TEXT NOT NULL, match_key TEXT NOT NULL, qty INT NOT NULL DEFAULT 1, lang CHAR(2),
  eur_at_completion NUMERIC(10,2)                 -- frozen when status -> completed
);
CREATE INDEX ON trade_items(trade_id);

-- 006_comments_notifications.sql
CREATE TABLE trade_comments (
  id SERIAL PRIMARY KEY, trade_id INT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  author_id INT NOT NULL REFERENCES friends(id), body TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY, friend_id INT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                 -- 'match','proposal','accepted','declined','comment','completed'
  payload JSONB NOT NULL, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON notifications(friend_id, read_at);

-- 007_match_cache.sql : compute on write, not on GET
CREATE TABLE match_cache (
  owner_id INT, seeker_id INT, match_key TEXT, card_name TEXT, trade_available INT,
  computed_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (owner_id, seeker_id, match_key)
);
```

## New / changed API

| Route | Notes |
|---|---|
| `GET /api/scryfall/autocomplete?q=` | Proxy to `https://api.scryfall.com/cards/autocomplete`; debounce client 250 ms; server rate-limit ≤10/s. |
| `POST /api/scryfall/resolve` `{names[]}` | Chunks of 75 → `POST /cards/collection`, 550 ms apart; upsert `scryfall_cards`; return `not_found[]` (used by Import preview). Headers: `User-Agent: BinderExchange/2.0 (<contact>)`, `Accept: application/json`. |
| nightly job | Refresh `eur`/`eur_foil` for every `scryfall_cards` row (Scryfall prices update once a day). |
| `PATCH /api/friends/:id/collection/:cardId` | `{qty?, lang?}`; `DELETE` same path. Both re-run match cache for that friend. |
| `POST /api/import/preview` `{list, target}` | Parse "4 Lightning Bolt (CMM) 464" lines; resolve via Scryfall; return rows tagged new/updated/unknown. Nothing written. |
| `POST /api/import/apply` | Applies the preview; responds with the previous list so the client can offer Undo (or store as `import_snapshots`). |
| `GET /api/matches` | Read `match_cache` + `computed_at`. Exclude cards in `trade_items` of `accepted` trades (reserved) and friends with `binder_paused`. |
| `POST /api/trades` `{partner_id, items[]}` | Creates `proposed`; notification to partner. |
| `POST /api/trades/:id/accept|decline|withdraw|complete` | State machine below. `complete` freezes `eur_at_completion`, moves qty between binders, notifies both. |
| `GET /api/trades?status=` | Proposals vs History tabs. |
| `POST /api/trades/:id/comments`, `GET …/comments` | Comments. Polling every 15 s is enough for ~17 people; SSE later. |
| `GET /api/notifications`, `POST /api/notifications/read-all` | Bell + Notifications screen. |
| `GET /api/dashboard` | `stats`, `partners` (sum of EUR both directions per friend), `open_trades`, `wish_available`. |

State machine: `proposed → accepted | declined | withdrawn`; `accepted → completed | declined`. Only `partner_id` may accept/decline; only `proposer_id` may withdraw; either may complete.

## Client
- Keep Vite/React. The prototype's palette, type (Cinzel / Manrope / JetBrains Mono) and inline values can be lifted into `styles.css` tokens.
- Hover preview: show after 350 ms of rest, hide 120 ms after leave, anchor beside the name (never over the row), keyboard focus opens it too.
- Toasts with Undo for remove/import; `prefers-reduced-motion` disables animations.

## Order of work
1. 004 + Scryfall proxy + autocomplete + hover (biggest UX win, no data-model risk).
2. 007 match cache; matches screen uses it.
3. 005/006 trades, comments, notifications; dashboard last.
