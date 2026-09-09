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

  return null;
}

const ARCHIDEKT_HEADERS = {
  Accept: "application/json",
  "User-Agent": "MTG-Trader/1.0 (deck import)",
};

async function fetchArchidektDeck(id) {
  const res = await fetch(`https://archidekt.com/api/decks/${id}/`, { headers: ARCHIDEKT_HEADERS });
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
  let nextUrl = `https://archidekt.com/api/collection/${id}/`;

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: ARCHIDEKT_HEADERS });
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
  }

  if (!rows.length) throw new Error("That Archidekt collection has no cards.");
  return { platform: "archidekt", deckName: "Archidekt collection", cards: mergeCardRows(rows) };
}

export async function importDeckFromUrl(url) {
  const parsed = parseDeckUrl(url);
  if (!parsed) {
    throw new Error(
      "Paste a public Archidekt deck or collection link (e.g. archidekt.com/decks/123 or archidekt.com/collection/v2/123)."
    );
  }
  if (parsed.kind === "collection") return fetchArchidektCollection(parsed.id);
  return fetchArchidektDeck(parsed.id);
}
