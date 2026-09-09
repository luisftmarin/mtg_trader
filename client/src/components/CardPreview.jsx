import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { formatEur, matchKey } from "../lib/format.js";

// Card metadata for the whole app plus the single hover preview.
// Anything that shows a card name asks this context for its data; requests
// are batched into one /api/cards call and misses fall back to
// /api/scryfall/resolve, which also warms the server cache.

const CardContext = createContext(null);

// Timings from handoff/README.md → "Card hover preview".
const OPEN_DELAY_MS = 350;
const CLOSE_GRACE_MS = 120;
const PREVIEW_W = 232;
const PREVIEW_H = 430;
const EDGE = 8;
const GAP = 14;

// A short window so a screenful of names becomes one request.
const BATCH_MS = 40;

export function CardProvider({ children }) {
  const [cards, setCards] = useState({});
  const store = useRef({});
  const requested = useRef(new Set());
  const queue = useRef(new Set());
  const flushTimer = useRef(null);
  const [hover, setHover] = useState(null);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);

  const commit = useCallback((entries) => {
    Object.assign(store.current, entries);
    setCards({ ...store.current });
  }, []);

  const flush = useCallback(async () => {
    flushTimer.current = null;
    const names = [...queue.current];
    queue.current.clear();
    if (!names.length) return;

    const keys = names.map(matchKey);
    let rows = [];
    try {
      rows = await api.getCards(keys);
    } catch {
      // Cache read failed — fall through to the resolve step below.
    }
    const found = {};
    for (const row of rows) found[row.match_key] = row;
    commit(found);

    // Anything the cache didn't have gets resolved from Scryfall, which
    // stores it for next time.
    const missing = names.filter((n) => !found[matchKey(n)]);
    if (!missing.length) return;
    try {
      const { found: resolved, not_found } = await api.resolveCards(missing);
      const next = {};
      for (const row of resolved) next[row.match_key] = row;
      for (const name of not_found) next[matchKey(name)] = { match_key: matchKey(name), name, missing: true };
      commit(next);
    } catch {
      const next = {};
      for (const name of missing) next[matchKey(name)] = { match_key: matchKey(name), name, failed: true };
      commit(next);
    }
  }, [commit]);

  const ensureCards = useCallback(
    (names) => {
      let queued = false;
      for (const name of names || []) {
        const key = matchKey(name);
        if (!key || store.current[key] || requested.current.has(key)) continue;
        requested.current.add(key);
        queue.current.add(name);
        queued = true;
      }
      if (queued && !flushTimer.current) flushTimer.current = setTimeout(flush, BATCH_MS);
    },
    [flush]
  );

  const getCard = useCallback((name) => store.current[matchKey(name)] || null, []);

  // Anchor the preview beside the name: to its right when there's room,
  // otherwise to its left, always clamped inside the viewport.
  const place = useCallback((name, rect) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const toRight = rect.right + GAP <= vw - PREVIEW_W - EDGE;
    let x = toRight ? rect.right + GAP : rect.left - PREVIEW_W - GAP;
    if (x < EDGE) x = EDGE;
    const y = Math.min(Math.max(EDGE, rect.top - 24), Math.max(EDGE, vh - PREVIEW_H - EDGE));
    return { name, x, y, toRight };
  }, []);

  const openPreview = useCallback(
    (name, element) => {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      clearTimeout(closeTimer.current);
      clearTimeout(openTimer.current);
      ensureCards([name]);
      // Once a preview is open, moving to another name switches instantly.
      setHover((current) => {
        if (current) return place(name, rect);
        openTimer.current = setTimeout(() => setHover(place(name, rect)), OPEN_DELAY_MS);
        return current;
      });
    },
    [ensureCards, place]
  );

  const closePreview = useCallback(() => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHover(null), CLOSE_GRACE_MS);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
      clearTimeout(flushTimer.current);
    },
    []
  );

  // Scrolling moves the row out from under the preview, so close it.
  useEffect(() => {
    if (!hover) return undefined;
    const close = () => setHover(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [hover]);

  const value = useMemo(
    () => ({ cards, getCard, ensureCards, openPreview, closePreview }),
    [cards, getCard, ensureCards, openPreview, closePreview]
  );

  return (
    <CardContext.Provider value={value}>
      {children}
      <CardHoverPreview hover={hover} card={hover ? cards[matchKey(hover.name)] : null} />
    </CardContext.Provider>
  );
}

export function useCards() {
  const ctx = useContext(CardContext);
  if (!ctx) throw new Error("useCards must be used inside <CardProvider>.");
  return ctx;
}

// Loads (and returns) the cached data for a set of card names.
export function useCardData(names) {
  const { cards, ensureCards } = useCards();
  const key = (names || []).join("|");
  useEffect(() => {
    ensureCards(names || []);
    // names is compared by its joined key so a fresh array each render is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ensureCards]);
  return cards;
}

function CardHoverPreview({ hover, card }) {
  if (!hover) return null;
  const image = card?.image_normal;
  const emptyText = card?.missing ? "Not found on Scryfall" : "Loading from Scryfall…";
  return (
    <div
      role="tooltip"
      className="hovercard"
      style={{ left: `${hover.x}px`, top: `${hover.y}px` }}
      data-testid="card-hover-preview"
    >
      <span className={`hovercard__arrow hovercard__arrow--${hover.toRight ? "left" : "right"}`} />
      <div className="hovercard__body">
        <div className="hovercard__art">
          {image ? (
            <img src={image} alt={hover.name} />
          ) : (
            <div className="hovercard__skeleton">{emptyText}</div>
          )}
        </div>
        <div className="hovercard__meta">
          <div className="hovercard__name">{card?.name || hover.name}</div>
          <div className="hovercard__type">{card?.type_line || ""}</div>
          <div className="hovercard__foot">
            <span className="hovercard__set">{card?.set_name || card?.set_code || ""}</span>
            <span className="hovercard__price">{card?.eur != null ? formatEur(card.eur) : ""}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
