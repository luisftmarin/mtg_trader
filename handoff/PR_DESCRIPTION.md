# UI/UX redesign proposal — Binder Exchange v2

Prototype + research for the next version of mtg_trader. Nothing in `server/` or `client/` is changed by this PR; it adds a `design/` folder with:

- `Binder Exchange.dc.html` — clickable prototype (open in a browser; any username signs in). Live Scryfall autocomplete, hover card previews, EUR prices from Cardmarket via Scryfall.
- `Research Report.dc.html` — heuristic audit of the current UI, learnings from Deckbox / community tools, Scryfall integration spec, NN/g guidelines applied, Now/Next/Later backlog.
- `IMPLEMENTATION_NOTES.md` — schema and API changes needed to make the prototype real, mapped to the current code.

## What changes for users
- Dashboard replaces the empty-right-side Trades page: best partners ranked by two-way value, open trades, wishlist cards now available.
- Cards are typed with Scryfall autocomplete instead of free text (kills the typo-breaks-matching problem).
- Hover any card name → image, type, set, EUR price (350 ms delay, per NN/g).
- A match becomes a **trade object**: proposal → accept/decline/counter → reserved cards → completed, with comments and frozen prices in history.
- Import shows a diff preview (+new / ↑updated / ?unknown) before writing, with undo. Replaces the "save overwrites the current list" panel.
- Language stored per card row; Cardmarket trend price in EUR everywhere.
- Contrast fixed to WCAG AA; mobile layout with bottom tabs.

## How to review
1. `open design/Binder\ Exchange.dc.html` (needs internet for Scryfall).
2. Read `design/Research Report.dc.html` for the reasoning behind each change.
3. Comment on `IMPLEMENTATION_NOTES.md` — especially the new tables and whether matches should be computed on write.

## Suggested branch
`git checkout -b design/binder-exchange-v2 && mkdir design && cp <files> design/ && git add design && git commit -m "Add Binder Exchange v2 UI prototype and research"`
