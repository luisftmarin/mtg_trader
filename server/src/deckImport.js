import { matchKey } from "./matchKey.js";

function mergeCardRows(rows) {
  const byKey = new Map();
  const merged = [];
  for (const row of rows) {
    const key = matchKey(row.cardName);
    const existing = byKey.get(key);
    if (existing) {
      existing.qty += row.qty;
    } else {
      const entry = { cardName: row.cardName, qty: row.qty };
      byKey.set(key, entry);
      merged.push(entry);
    }
  }
  return merged;
}

export function parseDeckUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;

  const archidektDeck = trimmed.match(/archidekt\.com\/decks\/(\d+)/i);
  if (archidektDeck) return { kind: "deck", id: archidektDeck[1] };

  const archidektCollection = trimmed.match(/archidekt\.com\/collection(?:\/v2)?\/(\d+)/i);
  if (archidektCollection) return { kind: "collection", id: archidektCollection[1] };

  const moxfield = trimmed.match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i);
  if (moxfield) return { kind: "moxfield", id: moxfield[1] };

  return null;
}

const ARCHIDEKT_HEADERS = {
  Accept: "application/json",
  "User-Agent": "MTG-Trader/1.0 (deck import)",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(res, attempt) {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) {
    return Math.min(header * 1000, 15_000);
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function fetchArchidekt(url) {
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url, { headers: ARCHIDEKT_HEADERS });
    if (res.status !== 429 && res.status !== 503) return res;
    if (attempt === maxAttempts - 1) {
      throw new Error(
        "Archidekt is rate-limiting right now (429). Wait a minute and try Load again, or paste an exported list."
      );
    }
    await sleep(retryAfterMs(res, attempt));
  }
  throw new Error("Could not load Archidekt.");
}

async function fetchArchidektDeck(id) {
  const res = await fetchArchidekt(`https://archidekt.com/api/decks/${id}/`);
  if (res.status === 404) throw new Error("Archidekt deck not found — check the link is public.");
  if (!res.ok) throw new Error(`Could not load Archidekt deck (${res.status}).`);
  const data = await res.json();
  const rows = archidektDeckRows(data.cards);
  if (!rows.length) throw new Error("That Archidekt deck has no cards.");
  return { platform: "archidekt", deckName: data.name || null, cards: mergeCardRows(rows) };
}

function archidektDeckRows(cards) {
  return (cards || [])
    .map((entry) => ({
      cardName: entry.card?.oracleCard?.name || entry.card?.displayName || "",
      qty: Number.isFinite(entry.quantity) && entry.quantity > 0 ? entry.quantity : 1,
    }))
    .filter((row) => row.cardName.trim());
}

async function fetchArchidektCollection(id) {
  const rows = [];
  let nextUrl = `https://archidekt.com/api/collection/${id}/?pageSize=200`;
  let page = 0;

  while (nextUrl) {
    if (page > 0) await sleep(450);
    const res = await fetchArchidekt(nextUrl);
    if (res.status === 404) throw new Error("Archidekt collection not found — check the link is public.");
    if (!res.ok) throw new Error(`Could not load Archidekt collection (${res.status}).`);
    const data = await res.json();
    for (const entry of data.results || []) {
      const cardName = entry.card?.oracleCard?.name || entry.card?.displayName || "";
      if (!cardName.trim()) continue;
      const qty = Number.isFinite(entry.quantity) && entry.quantity > 0 ? entry.quantity : 1;
      rows.push({ cardName, qty });
    }
    nextUrl = data.next || null;
    page += 1;
  }

  if (!rows.length) throw new Error("That Archidekt collection has no cards.");
  return { platform: "archidekt", deckName: "Archidekt collection", cards: mergeCardRows(rows) };
}

const MOXFIELD_HEADERS = {
  Accept: "application/json",
  "User-Agent": "BinderExchange/2.0 (github.com/luisftmarin/mtg_trader)",
};

const MOXFIELD_BOARDS = ["commanders", "mainboard", "companions", "sideboard", "signatureSpells"];

function moxfieldBoard(data, key) {
  if (data?.boards?.[key]?.cards) return data.boards[key].cards;
  return data?.[key];
}

function moxfieldCardName(entry, fallbackKey) {
  return (
    entry?.card?.name ||
    entry?.cardName ||
    (typeof fallbackKey === "string" && !/^[0-9a-f-]{8,}$/i.test(fallbackKey) ? fallbackKey : "") ||
    ""
  );
}

function moxfieldQty(entry) {
  const q = entry?.quantity ?? entry?.qty;
  return Number.isFinite(q) && q > 0 ? q : 1;
}

export function extractMoxfieldCards(data) {
  const rows = [];
  for (const key of MOXFIELD_BOARDS) {
    const board = moxfieldBoard(data, key);
    if (!board) continue;
    const entries = Array.isArray(board) ? board.map((e, i) => [i, e]) : Object.entries(board);
    for (const [k, entry] of entries) {
      const cardName = moxfieldCardName(entry, k);
      if (!String(cardName).trim()) continue;
      rows.push({ cardName: String(cardName).trim(), qty: moxfieldQty(entry) });
    }
  }
  return mergeCardRows(rows);
}

async function fetchMoxfieldDeck(id) {
  const urls = [
    `https://api2.moxfield.com/v3/decks/all/${encodeURIComponent(id)}`,
    `https://api2.moxfield.com/v2/decks/all/${encodeURIComponent(id)}`,
    `https://api.moxfield.com/v2/decks/all/${encodeURIComponent(id)}`,
  ];
  let lastStatus = 0;
  for (const url of urls) {
    const res = await fetch(url, { headers: MOXFIELD_HEADERS });
    lastStatus = res.status;
    if (!res.ok) continue;
    const data = await res.json();
    const cards = extractMoxfieldCards(data);
    if (!cards.length) continue;
    return { platform: "moxfield", deckName: data.name || null, cards };
  }
  if (lastStatus === 404) {
    throw new Error("Moxfield deck not found — check the link is public.");
  }
  if (lastStatus === 403) {
    throw new Error(
      "Moxfield blocks automated downloads. Open the deck, use Export → Text, and paste the list above."
    );
  }
  throw new Error("Could not load that Moxfield deck. Make sure it is public, or paste the exported list instead.");
}

export async function importDeckFromUrl(url) {
  const parsed = parseDeckUrl(url);
  if (!parsed) {
    throw new Error(
      "Paste a public Archidekt or Moxfield link (archidekt.com/decks/…, archidekt.com/collection/v2/…, or moxfield.com/decks/…)."
    );
  }
  if (parsed.kind === "collection") return fetchArchidektCollection(parsed.id);
  if (parsed.kind === "moxfield") return fetchMoxfieldDeck(parsed.id);
  return fetchArchidektDeck(parsed.id);
}
