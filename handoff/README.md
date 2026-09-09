# Handoff: Binder Exchange v2 — UI/UX redesign of mtg_trader

## Overview
mtg_trader is a friends-only Magic: The Gathering trade matcher (React/Vite client, Express + Postgres server). It works but stops at "who has what". This handoff redesigns it into a complete product: dashboard, Scryfall-backed card entry, hover card previews, EUR prices (Cardmarket via Scryfall), a real trade flow (propose → accept → reserved → completed), comments, notifications, profile, import with preview, and a mobile layout.

## About the design files
`design/Binder Exchange.dc.html` and `design/Research Report.dc.html` are **design references built in HTML** (they open in a browser; `support.js` is their runtime). They are not production code. Recreate them in the existing React client using its patterns, and extend the Express server/Postgres schema as described in `IMPLEMENTATION_NOTES.md`.

## Fidelity
**High-fidelity.** Colours, type, spacing, copy, timings and states are final. Match them exactly; use `styles.css` tokens for the values below.

## Design tokens
Colours (all on dark):
- Page background `#0e1015`; app frame outer `#07080b`
- Surface (cards, sidebar hover) `#151821`; surface hover `#1a1e29`
- Borders `#232733` (subtle), `#2c3140` (inputs/controls), row dividers `#1c202a`
- Text primary `#e8e6df`, secondary `#b8bcc4`, muted `#8b919c`, placeholder `#6e7480`
- Gold accent `#d4a843`, gold hover `#e6bb52`, ink on gold `#1a1406`
- Green (you get / success / accepted) `#4fbf7a`; Red (destructive / declined) `#e06c5a`; Blue (your turn) `#8fc0f0` on `rgba(74,144,217,.18)`
- Mana dots: W `#f3ecc7`, U `#4a90d9`, B `#9b8bb0`, R `#e05a48`, G `#4fae6a`, colourless `#8b919c`
- Status badges (bg / text): proposed→awaiting reply `rgba(212,168,67,.15)`/gold; your turn blue; accepted `rgba(79,191,122,.15)`/green; completed & withdrawn `rgba(139,145,156,.15)`/`#b8bcc4`; declined `rgba(224,108,90,.15)`/red

Type (Google Fonts): Cinzel 600 for headings/brand; Manrope 400–800 for UI; JetBrains Mono 400–600 for numbers, prices, IDs, eyebrow labels (10–11px, letter-spacing .12–.16em, uppercase).
Sizes: h1 26–30px Cinzel; card titles 14px/700; body 13–14px; muted 11–12px; stat numbers 30px mono.

Radius: 12px cards/sections, 8px buttons/inputs, 6–7px small controls/chips, 10px popovers, 999px partner chips.
Shadows: popovers `0 20px 50px rgba(0,0,0,.5)`; drawers `-30px 0 60px rgba(0,0,0,.4)`; hover card `drop-shadow(0 20px 40px rgba(0,0,0,.6))`.
Spacing: page padding 28px; section header padding 14px 18px; row padding 10–12px 16–18px; grid gap 16–18px.
Focus: `outline:2px solid #d4a843; outline-offset:1px` on all interactive elements.

Motion (all disabled under `prefers-reduced-motion` and a Profile toggle):
- Screen enter `rise`: opacity 0→1, translateY 12px→0, 350ms ease-out
- Popovers/menus `pop`: opacity 0→1, translateY 6px + scale .96→1, 160–200ms ease-out
- Drawers `slideIn`: translateX 40px→0, 280ms cubic-bezier(.2,.8,.2,1)
- Toasts: 250ms same curve, auto-dismiss 4.2s
- Hover on buttons/cards: 120–150ms; card thumbnails lift `translateY(-4px)` 180ms
- Dashboard stat cards stagger 60ms each
- Loading skeleton shimmer 1.4s linear; unread bell dot pulse 2s
- Balance bars animate width 300–400ms ease

## Screens

### 1. Login
Centred 400px card (`#151821` @90% + backdrop-blur 12px, border `#2c3140`, radius 16, padding 36/32) over a slow-drifting radial gradient background (gold/blue/green at 10–16% alpha, 18s loop). Brand block: 40px gold gradient square with "B" in Cinzel + eyebrow "TRADE WITH FRIENDS" + "Binder Exchange". Fields: Username, Password (11px 12px padding, radius 8). Primary button full-width gold, ink text, 800 weight. Links: Forgot password (muted), Create account (gold). Keep existing register / claim-name / admin-code flows behind "Create account".

### 2. App shell
- Top bar 58px: brand (click → Dashboard), global search input (260px, "Search cards or friends…"), bell button 38px with gold unread dot, user chip (avatar initials on gold radial gradient + name) → Profile.
- Notification popover (340px) under the bell: header + "Mark all read", 4 latest items (icon tile 30px, text, mono time, unread dot), footer "View all".
- Sidebar 236px: nav items Dashboard ◈, Trades ⇄ (badge = open trades), Binder ▤, Notifications ◎ (badge = unread). Active item: bg `#151821`, gold text. Below: eyebrow "ROSTER · n" with "● 4 online" in green, then scrollable friend list: 30px initials tile, online dot, name, mono "6.109 · 0 wish", gold match-count pill. Click → Friend screen.
- Main scrolls independently; max content width 1180px.
- Mobile (<760px or `mobile` flag): sidebar and search hidden; bottom tab bar Home/Trades/Binder/Friends/Profile (icon + 10.5px label, gold when active); main gets 80px bottom padding; Roster becomes its own screen.

### 3. Dashboard
Eyebrow date (mono, gold) + h1 "Good evening, {name}". Four stat cards (auto-fit ≥200px): "Cards you can get" (green number, "from n friends · €x"), "Cards friends want", "Open trades" ("n waiting on you"), "Binder value" (EUR, "n cards · Cardmarket trend"). Clickable, hover border gold + lift 2px.
Three sections (auto-fit ≥330px):
- Best trade partners: rows with initials, name, "You get **3** · you give **1** · active 12 min ago", right-aligned balance (+€x green / −€x gold) and a "Propose" outline button. Sorted by total match count.
- Open trades: rows with partner, mono trade id, summary "Get … · Give …", status badge; then eyebrow "RECENT ACTIVITY" with 3 timestamped lines.
- Wishlist now available: horizontal strip of 96×134 card thumbnails (Scryfall `small`), name, "from · €price"; hover lifts and rotates −1°.

### 4. Trades
Header: h1 "Trades", mono "matches computed 2 min ago", gold "+ New trade". Segmented tabs Matches (count) / Proposals (count) / History (active = gold bg, ink text).
- Matches: two sections side by side. "YOU GET" (green eyebrow, "Friends have · you want", total EUR green) and "YOU GIVE" (gold eyebrow). Rows: mana dots (8px), card name with dotted underline (hover target), owner chip (outline, "+2" more owners in gold mono; click → Friend), EUR right-aligned mono.
- Proposals: full-width trade cards (initials 40px, partner name, mono id · date, status badge, summary line, balance + "€get ↔ €give"). Hover: gold border, translateX 3px.
- History: same cards, muted; note "prices at completion".

### 5. New trade
Back link "← Trades", h1. Partner chips row (pill, initials, name, "n matches"; selected = gold border + 12% gold bg). Two checklists: "YOU GET FROM {PARTNER}" (their cards on your wishlist) and "YOU GIVE" (your cards, those on their wishlist first with a green "wants" tag; reserved cards excluded). Selected rows get 5% gold tint. Footer bar: balance labels (green get / centre "balanced" | "you gain €x" | "you give €x more" / give), two-tone bar (green vs gold) animating with selection, optional message textarea, gold "Send proposal" (disabled at 50% opacity until something is selected).

### 6. Trade detail
Back link, 46px initials, h1 "Trade with {partner}", mono "id · date · proposed by …", status badge. If accepted: green info banner "🔒 Both sides accepted. These cards are reserved and hidden from other matches until you mark the trade completed." Two sections YOU GET / YOU GIVE with 34×48 thumbnails, name (hover target), "×qty", EUR. Balance card with bar and footnote "Cardmarket trend prices via Scryfall · live, updated nightly | frozen at completion". Comments: chat bubbles (mine right-aligned gold bg ink text; theirs `#0e1015`), author · time in mono, input + Send, Enter submits, empty state "No comments yet. Agree on where and when to meet." Actions panel by status:
- your turn: Accept (green), Counter-propose (outline → New trade prefilled), Decline (red text)
- awaiting them: explanatory text + "Withdraw proposal"
- accepted: text + gold "Mark as completed"
- closed: note only

### 7. Binder
h1 "Your binder" + mono "collection €x · wishlist €y". Buttons: "Import list" (outline), "+ Add cards" (gold). Toolbar: segmented Collection (count) / Wishlist (count), filter input, list/grid toggle.
List: grid columns `30px minmax(0,1fr) 48px 50px 92px 80px 32px` = mana dots | name (+ tag "felix wants this" gold / "3 friends have it" green / "🔒 reserved") | SET (mono uppercase) | LANG select (EN DE PT ES FR IT JP) | qty stepper −/n/+ (26px buttons) | EUR (qty × price) | ✕ remove (turns red on hover). Remove shows a toast with Undo.
Grid: auto-fill ≥130px cards, aspect 488/680, image `small`, ×qty badge top-right, price badge bottom-left; hover lift + gold border. Empty state: "Nothing here yet" / "Add cards by name, or paste a list…" / gold button.

### 8. Add cards drawer (right, 440px)
Segmented Collection / Wishlist. Input "Card name" with placeholder "Start typing… e.g. rhy stu"; spinner at right while fetching; listbox of up to 8 Scryfall autocomplete names (↑↓ Enter Esc; highlighted = `#1a1e29` bg, gold text). Helper "Scryfall autocomplete · ↑↓ to choose · Enter to add". Preview: 150px card image (pops in), name, "type · set name", EUR gold mono, Qty stepper, Language select, gold "Add to collection/wishlist" (disabled until a card is picked). "JUST ADDED" list with ✓ and per-row Undo. Toast on add.

### 9. Import drawer (right, 480px)
Segmented Into collection / Into wishlist. Copy: "Paste any decklist or export: Archidekt, Moxfield, ManaBox, Deckbox CSV. One card per line, quantity first. Nothing is saved until you confirm the preview." Mono textarea. "Preview changes" → summary "+n new  ↑n updated  ?n unknown" and rows with symbol/colour, "qty× name", note ("have 2 → 4", price, "not found on Scryfall"). Gold "Apply n changes" (unknown rows skipped). Toast with Undo. Keep existing Archidekt URL import as a second input.

### 10. Friend
Back, 56px initials, h1 name, mono "n cards · n wishes · active …", gold "Propose trade". Two sections "THEY HAVE · YOU WANT · n" and "THEY WANT · YOU HAVE · n" with mana dots, hover names, EUR. Empty copy: "No overlap with your wishlist." / "They don't want anything you have right now."

### 11. Notifications
h1 + "Mark all read". List rows (36px icon tile, text, mono time, unread dot, unread rows tinted 5% gold). Click marks read and navigates to the trade/friend.

### 12. Profile & settings
72px avatar with gold ring; fields Display name, Username (read-only), City, Default card language. Toggle rows (44×26 switch, gold when on): New match alerts, Trade proposals, Comments, Weekly digest, Pause my binder ("Hide my cards from matching while I'm away"). Prices card: "Cardmarket trend price in EUR via Scryfall, refreshed nightly. Last update {time}." Buttons: Save changes (gold), Sign out (red outline). Keep the existing change-password flow here.

## Card hover preview (global)
Trigger: any card name rendered with dotted underline, focusable (tabIndex 0), on mouseenter/focus. Show after **350 ms** of rest; if a preview is already open, switch instantly to the new card. Hide **120 ms** after leave/blur. Position: 232px wide, 14px to the right of the name (left if no room), vertically clamped to viewport, small rotated-square arrow pointing at the name. Content: image `image_uris.normal` (aspect 488/680, radius 9) or shimmer skeleton with "Loading from Scryfall…" / "Not found on Scryfall"; name 13px/700; type_line muted; set_name uppercase mono left, EUR gold mono right. Double-faced cards: use `card_faces[0].image_uris`. `pointer-events:none`, `role="tooltip"`. Never put info in the popup that isn't also in the row (price/qty stay in the row).

## Data & integration rules
- Prices: `prices.eur` / `prices.eur_foil` (Cardmarket). Format with `Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'})`.
- Scryfall: `GET /cards/autocomplete?q=` (debounce 250 ms), `POST /cards/collection` (≤75 identifiers, ≥550 ms apart, returns `not_found`), `GET /cards/named?exact=`. Send `User-Agent` and `Accept: application/json`. Cache 24 h server-side; refresh prices nightly; images from *.scryfall.io are unlimited.
- Balance = Σ get EUR − Σ give EUR; |d| < €2 → "balanced".
- Reserved = cards in `accepted` trades; hidden from matches and from the give list.
- Matches recomputed on binder write, not on page load; show `computed_at`.
- Import line grammar: `^(\d+)\s*x?\s+(.+?)(\s+\([A-Z0-9]{2,5}\).*)?$`, fallback qty 1.

## Contrast (all ≥ WCAG AA on `#0e1015`)
primary 15.6:1, secondary 9.4:1, muted 5.3:1, gold 8.1:1, ink-on-gold 7.6:1.

## Files
- `design/Binder Exchange.dc.html` — prototype (open in browser; requires `design/support.js` beside it; needs internet for Scryfall)
- `design/Research Report.dc.html` — research and rationale
- `IMPLEMENTATION_NOTES.md` — migrations 004–007, API routes, trade state machine
- `PR_DESCRIPTION.md` — PR body
- `CLAUDE_CODE_PROMPT.md` — prompt to paste into Claude Code
