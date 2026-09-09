# Prompt for Claude Code (paste everything below the line)

---

You are working in the `mtg_trader` repository (React 18 + Vite client in `client/`, Express + `pg` server in `server/`, Postgres migrations in `server/migrations/`). I have unzipped a design handoff into `handoff/` at the repo root. Read ALL of these before writing code:

1. `handoff/README.md` — full hi-fi spec: tokens, every screen, hover behaviour, motion, data rules.
2. `handoff/IMPLEMENTATION_NOTES.md` — new migrations 004–007, API routes, trade state machine, order of work.
3. `handoff/PR_DESCRIPTION.md` — PR body to use.
4. `handoff/design/Binder Exchange.dc.html` — the interactive prototype. Read its markup and the `class Component` logic at the bottom: it contains the exact inline styles, copy, timings, Scryfall calls, import parser and state transitions to reproduce.
5. `handoff/design/Research Report.dc.html` — rationale (skim).
6. The current code: `server/src/index.js`, `server/src/matching.js`, `server/src/deckImport.js`, `server/src/auth.js`, `server/migrations/*.sql`, `client/src/App.jsx`, `client/src/api.js`, `client/src/styles.css`, `client/src/ui.jsx`.

## Goal
Rebuild the UI to match the prototype pixel-for-pixel and extend the backend so every prototype feature is real. Keep existing auth (register/login/claim/change-password/admin reset), the Archidekt URL import, `matchKey()` normalisation and the deploy setup (Vercel client, Railway server, `VITE_API_URL`, `ALLOWED_ORIGINS`). Do not drop or rename existing tables/columns.

## Deliver as a series of PRs, in this order. For each: create a branch from `main`, commit in small logical steps, open a PR with a clear description (use `handoff/PR_DESCRIPTION.md` as the body of PR 1, adapt for the others), and make sure `npm run build` in `client/` and `node --check` on server files pass before pushing.

### PR 1 — `design/foundation-and-scryfall`
- Add `handoff/` to the repo (it is the design source of truth; keep it).
- `client/src/styles.css`: replace the current theme with CSS variables for every token in `handoff/README.md` → "Design tokens" (colours, radii, shadows, motion durations). Load Google Fonts Cinzel 600/700, Manrope 400–800, JetBrains Mono 400–600. Global focus ring `2px solid var(--gold)`. Add the keyframes `rise`, `pop`, `slideIn`, `toastIn`, `shimmer`, `spin`, `pulse`, `drift` exactly as in the prototype's `<style>`. Respect `prefers-reduced-motion` (all animations/transitions off).
- Server: migration `004_card_meta.sql` (from IMPLEMENTATION_NOTES). New module `server/src/scryfall.js` with:
  - `autocomplete(q)` → proxies `https://api.scryfall.com/cards/autocomplete?q=`.
  - `resolveNames(names)` → chunks of 75 → `POST https://api.scryfall.com/cards/collection`, ≥550 ms between requests, upserts into `scryfall_cards` (match_key, scryfall_id, name, set_code, set_name, type_line, color_identity, image_small, image_normal, eur, eur_foil, cardmarket_url, fetched_at). Handle double-faced cards (`card_faces[0].image_uris`). Returns `{found, not_found}`.
  - `refreshPrices()` → re-resolves every cached card; export it and run it from a `node src/jobs/refreshPrices.js` script (document a nightly cron/Railway cron in README).
  - Always send headers `User-Agent: BinderExchange/2.0 (github.com/luisftmarin/mtg_trader)` and `Accept: application/json`. Back off 30 s on HTTP 429. Simple in-process rate limiter ≤ 8 req/s.
  - Routes: `GET /api/scryfall/autocomplete?q=`, `POST /api/scryfall/resolve {names[]}`, `GET /api/cards?keys=a,b,c` (read cache).
  - Call `resolveNames` after every collection/wishlist write so the cache is warm.
- Client: `CardName` component (dotted underline, `tabIndex=0`) + a single global `CardHoverPreview` implementing the timing and positioning rules in README → "Card hover preview": 350 ms open delay, instant switch when already open, 120 ms close grace, 232px wide, arrow, `role="tooltip"`, `pointer-events:none`, skeleton shimmer while loading. Data comes from `GET /api/cards` (cached), falling back to `/api/scryfall/resolve` for misses.
- Client: `formatEur` using `Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'})`. Every price in the app is EUR from `prices.eur` (Cardmarket).

### PR 2 — `design/app-shell-and-binder`
- Replace the current layout with the app shell from README → screen 2 (top bar, bell popover, sidebar with nav + roster, mobile bottom tabs under 760px). Use client-side routing (React Router or a small `screen` state like the prototype — your choice, but URLs should be shareable: `/`, `/trades`, `/trades/:id`, `/trades/new`, `/binder`, `/friends/:id`, `/notifications`, `/profile`).
- Login screen per README → screen 1, wrapping the existing auth API (register, claim, admin code live behind "Create account").
- Binder screen per README → screen 7 (list + grid, tabs, filter, qty stepper, language select, remove with Undo toast, wants/have/reserved tags).
  - Server: `PATCH /api/friends/:id/collection/:cardId {qty?, lang?}`, `DELETE` same, and the same for wishlist. Keep `PUT` replace endpoints.
- Add cards drawer per README → screen 8 with Scryfall autocomplete (debounce 250 ms, keyboard nav, preview image, qty, language, "JUST ADDED" with undo).
- Import drawer per README → screen 9. Server: `POST /api/import/preview {list, target}` (parse with the regex in README, resolve names, tag new/updated/unknown) and `POST /api/import/apply` (returns the previous list for Undo). Keep Archidekt URL import as a second input in the same drawer.
- Toast system (bottom-right, 4.2 s, optional Undo action).

### PR 3 — `design/matches-and-dashboard`
- Migration `007_match_cache.sql`. Recompute `match_cache` for the affected friend after every binder write (reuse `computeMatches`); `GET /api/matches` reads the cache and returns `computed_at`. Exclude friends with `binder_paused`.
- Trades screen → Matches tab per README → screen 4 (YOU GET / YOU GIVE, mana dots from `color_identity`, owner chips with "+n", EUR totals).
- Friend screen per README → screen 10.
- Dashboard per README → screen 3 with `GET /api/dashboard` (stats, partners ranked by total matches with two-way EUR balance, open trades, wishlist-available cards). Stagger stat cards 60 ms.
- Update `friends.last_seen_at` in `requireAuth`; show "active …" relative times in roster/partners.

### PR 4 — `design/trades-comments-notifications`
- Migrations `005_trades.sql`, `006_comments_notifications.sql`.
- Trade state machine: `proposed → accepted | declined | withdrawn`; `accepted → completed | declined`. Only `partner_id` may accept/decline, only `proposer_id` may withdraw, either may complete. `complete` freezes `eur_at_completion` on each item, moves qty between binders (decrement giver's collection, increment receiver's collection, remove from receiver's wishlist), recomputes match cache for both, notifies both.
- Reserved cards: items of `accepted` trades are excluded from `GET /api/matches` and from the give-list in New trade, and show the "🔒 reserved" tag in the Binder.
- Routes: `POST /api/trades`, `GET /api/trades?status=`, `GET /api/trades/:id`, `POST /api/trades/:id/(accept|decline|withdraw|complete)`, `GET|POST /api/trades/:id/comments`, `GET /api/notifications`, `POST /api/notifications/read-all`, `POST /api/notifications/:id/read`.
- Notifications are created on: new proposal, accept, decline/withdraw, complete, new comment, and "friend added cards that match your wishlist" (compute in the match-cache step).
- Screens: New trade (README → 5), Trade detail (README → 6, comments poll every 15 s), Proposals + History tabs (README → 4), Notifications (README → 11), bell popover.

### PR 5 — `design/profile-and-polish`
- Profile & settings per README → screen 12 (display name, city, default language, notification toggles persisted in a `friend_settings` JSONB column or table — your call, `binder_paused`, price last-updated, Save, Sign out, existing change-password).
- Mobile pass on every screen (<760px), keyboard access for every interactive element, empty states with the exact copy from README, `data-testid`s on key elements.
- Update `README.md` (root) with the new migrations, env vars, cron job and screenshots.

## Rules
- Match the prototype exactly: same copy, colours, sizes, radii, motion durations. When in doubt, open `handoff/design/Binder Exchange.dc.html` and read the inline style on the equivalent element.
- Contrast: never render text below `#8b919c` on dark surfaces.
- Never call Scryfall from the browser in production except for images; everything else goes through the server cache.
- Keep functions small and files organised (`client/src/screens/*`, `client/src/components/*`, `server/src/routes/*`). Add basic tests for the trade state machine and the import parser.
- After each PR, post a short summary of what was done, what was skipped, and any decision you made that deviates from the handoff.

Start with PR 1 now. Before writing code, list the files you will create/modify and confirm the plan in one short message, then proceed without waiting.
