// Everything that talks to Scryfall lives here. The browser never calls
// Scryfall directly (except for images, which are unlimited): names, types
// and Cardmarket EUR prices come from the scryfall_cards cache this module
// fills, so we stay well inside Scryfall's rate limits with ~17 traders.
import { pool } from "./db.js";
import { matchKey } from "./matchKey.js";

const API = "https://api.scryfall.com";

const HEADERS = {
  "User-Agent": "BinderExchange/2.0 (github.com/luisftmarin/mtg_trader)",
  Accept: "application/json",
};

// Scryfall asks for 50–100 ms between requests; 8/s is comfortably inside that.
const MIN_INTERVAL_MS = 125;
// How long to stand down after a 429, per the handoff.
const BACKOFF_MS = 30_000;
// The /cards/collection endpoint takes up to 75 identifiers and wants a
// slower cadence than the rest of the API.
const COLLECTION_CHUNK = 75;
const COLLECTION_INTERVAL_MS = 550;
// A cached row older than this is stale for price purposes (prices move once
// a day); the nightly job refreshes everything anyway.
export const CACHE_TTL_HOURS = 24;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One in-process queue so concurrent requests can't burst past the limit.
let queueTail = Promise.resolve();
let nextAllowedAt = 0;

function schedule(task) {
  const run = queueTail.then(async () => {
    const wait = nextAllowedAt - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      nextAllowedAt = Date.now() + MIN_INTERVAL_MS;
    }
  });
  // Keep the chain alive even when a task rejects.
  queueTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function scryfallFetch(path, options = {}) {
  return schedule(async () => {
    let res = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...HEADERS, ...(options.headers || {}) },
    });
    if (res.status === 429) {
      // Stand down for 30 s, then try once more before giving up.
      nextAllowedAt = Date.now() + BACKOFF_MS;
      await sleep(BACKOFF_MS);
      res = await fetch(`${API}${path}`, {
        ...options,
        headers: { ...HEADERS, ...(options.headers || {}) },
      });
    }
    return res;
  });
}

export async function autocomplete(q) {
  const query = String(q || "").trim();
  if (query.length < 2) return [];
  const res = await scryfallFetch(`/cards/autocomplete?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Scryfall autocomplete failed (${res.status}).`);
  const body = await res.json();
  return Array.isArray(body.data) ? body.data : [];
}

// Double-faced cards carry their art on card_faces[0] instead of the card.
function faceOf(card) {
  if (card.image_uris) return card;
  return (card.card_faces && card.card_faces[0]) || card;
}

function toRow(card) {
  const images = faceOf(card).image_uris || {};
  const prices = card.prices || {};
  return {
    match_key: matchKey(card.name),
    scryfall_id: card.id || null,
    name: card.name || null,
    set_code: card.set || null,
    set_name: card.set_name || null,
    type_line: card.type_line || (card.card_faces && card.card_faces[0]?.type_line) || null,
    color_identity: (card.color_identity || []).join(""),
    image_small: images.small || null,
    image_normal: images.normal || null,
    eur: prices.eur != null ? Number(prices.eur) : null,
    eur_foil: prices.eur_foil != null ? Number(prices.eur_foil) : null,
    cardmarket_url: card.purchase_uris?.cardmarket || null,
  };
}

async function upsertCards(rows) {
  for (const row of rows) {
    await pool.query(
      `INSERT INTO scryfall_cards
         (match_key, scryfall_id, name, set_code, set_name, type_line, color_identity,
          image_small, image_normal, eur, eur_foil, cardmarket_url, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       ON CONFLICT (match_key) DO UPDATE SET
         scryfall_id = EXCLUDED.scryfall_id,
         name = EXCLUDED.name,
         set_code = EXCLUDED.set_code,
         set_name = EXCLUDED.set_name,
         type_line = EXCLUDED.type_line,
         color_identity = EXCLUDED.color_identity,
         image_small = EXCLUDED.image_small,
         image_normal = EXCLUDED.image_normal,
         eur = EXCLUDED.eur,
         eur_foil = EXCLUDED.eur_foil,
         cardmarket_url = EXCLUDED.cardmarket_url,
         fetched_at = now()`,
      [
        row.match_key,
        row.scryfall_id,
        row.name,
        row.set_code,
        row.set_name,
        row.type_line,
        row.color_identity,
        row.image_small,
        row.image_normal,
        row.eur,
        row.eur_foil,
        row.cardmarket_url,
      ]
    );
  }
}

// Resolves card names against Scryfall and fills the cache.
// Returns { found: [row], not_found: [name] } — Import preview uses not_found
// to mark rows as unknown.
export async function resolveNames(names) {
  const unique = new Map();
  for (const name of names || []) {
    const clean = String(name || "").trim();
    if (!clean) continue;
    const key = matchKey(clean);
    if (!unique.has(key)) unique.set(key, clean);
  }
  const wanted = [...unique.values()];
  const found = [];
  const notFound = [];

  for (let i = 0; i < wanted.length; i += COLLECTION_CHUNK) {
    const chunk = wanted.slice(i, i + COLLECTION_CHUNK);
    const res = await scryfallFetch("/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers: chunk.map((name) => ({ name })) }),
    });
    if (!res.ok) throw new Error(`Scryfall lookup failed (${res.status}).`);
    const body = await res.json();
    const rows = (body.data || []).map(toRow);
    await upsertCards(rows);
    found.push(...rows);
    for (const miss of body.not_found || []) {
      if (miss?.name) notFound.push(miss.name);
    }
    if (i + COLLECTION_CHUNK < wanted.length) await sleep(COLLECTION_INTERVAL_MS);
  }

  return { found, not_found: notFound };
}

// Fire-and-forget cache warming: called after every collection/wishlist write
// so hovering a freshly added card is instant. Never fails the write.
export function warmCache(names) {
  const list = (names || []).filter(Boolean);
  if (!list.length) return;
  resolveNames(list).catch((err) => {
    console.error("Scryfall cache warm failed:", err.message);
  });
}

export async function getCachedCards(keys) {
  const list = [...new Set((keys || []).map((k) => matchKey(k)).filter(Boolean))];
  if (!list.length) return [];
  const { rows } = await pool.query(
    `SELECT match_key, scryfall_id, name, set_code, set_name, type_line, color_identity,
            image_small, image_normal, eur, eur_foil, cardmarket_url, fetched_at
       FROM scryfall_cards WHERE match_key = ANY($1::text[])`,
    [list]
  );
  return rows;
}

// Nightly job: Scryfall updates prices once a day, so re-resolve everything
// we have cached. Run with `npm run refresh-prices` in server/.
export async function refreshPrices() {
  const { rows } = await pool.query("SELECT name, match_key FROM scryfall_cards ORDER BY match_key");
  const names = rows.map((r) => r.name || r.match_key);
  if (!names.length) return { refreshed: 0, not_found: [] };
  const { found, not_found } = await resolveNames(names);
  return { refreshed: found.length, not_found };
}
