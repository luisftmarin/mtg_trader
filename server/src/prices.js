const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const BATCH_SIZE = 75;
const BATCH_DELAY_MS = 120;
const SCRYFALL_COLLECTION = "https://api.scryfall.com/cards/collection";

const cache = new Map();

function matchKey(name) {
  return String(name || "").trim().split("//")[0].trim().toLowerCase();
}

function parseEur(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cardToPrice(card) {
  const eur = parseEur(card?.prices?.eur);
  const foilEur = parseEur(card?.prices?.eur_foil);
  return {
    eur: eur ?? foilEur,
    foilEur,
    cardmarketUrl: card?.purchase_uris?.cardmarket || null,
    setName: card?.set_name || null,
  };
}

const emptyPrice = { eur: null, foilEur: null, cardmarketUrl: null, setName: null };

async function fetchCollection(identifiers) {
  const res = await fetch(SCRYFALL_COLLECTION, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "MTG-Trader/1.0 (cardmarket prices)",
    },
    body: JSON.stringify({ identifiers }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Scryfall collection failed (${res.status})${text ? `: ${text}` : ""}`);
  }
  return res.json();
}

export async function lookupPrices(names) {
  const uniqueNames = [];
  const seenKeys = new Set();
  for (const raw of names || []) {
    const name = String(raw || "").trim();
    if (!name) continue;
    const key = matchKey(name);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    uniqueNames.push({ name: name.split("//")[0].trim() || name, key });
  }

  const prices = {};
  const missing = [];
  const now = Date.now();

  for (const item of uniqueNames) {
    const hit = cache.get(item.key);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      prices[item.key] = hit.value;
    } else {
      missing.push(item);
    }
  }

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    if (i > 0) await delay(BATCH_DELAY_MS);
    const chunk = missing.slice(i, i + BATCH_SIZE);
    const data = await fetchCollection(chunk.map((c) => ({ name: c.name })));
    const byKey = new Map();
    for (const card of data.data || []) {
      byKey.set(matchKey(card.name), card);
    }

    for (const item of chunk) {
      const card = byKey.get(item.key);
      const value = card ? cardToPrice(card) : emptyPrice;
      cache.set(item.key, { at: now, value });
      prices[item.key] = value;
    }
  }

  return prices;
}
