import { matchKey } from "./matchKey.js";

// Handoff grammar: quantity first, optional "x", then the name, then an
// optional "(SET) collector" tail. Lines that don't match still count as
// qty 1 with the whole line as the name.
export const IMPORT_LINE = /^(\d+)\s*x?\s+(.+?)(\s+\([A-Za-z0-9]{2,5}\).*)?$/i;

const HEADER = /^(name|card name|qty|quantity|count|qty x name)\b/i;

export function parseImportLines(text) {
  const rows = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("//") || line.startsWith("#")) continue;
    if (/^sideboard\b/i.test(line) || /^maybeboard\b/i.test(line)) continue;
    if (HEADER.test(line.replace(/"/g, ""))) continue;
    rows.push(parseImportLine(line));
  }
  return mergeParsed(rows);
}

export function parseImportLine(line) {
  const m = String(line).trim().match(IMPORT_LINE);
  let qty = 1;
  let name = String(line).trim();
  if (m) {
    qty = parseInt(m[1], 10);
    name = m[2];
  }
  name = name.replace(/,\s*$/, "").replace(/^"|"$/g, "").trim();
  if (!Number.isFinite(qty) || qty < 1) qty = 1;
  return { qty, name, match_key: matchKey(name) };
}

function mergeParsed(rows) {
  const byKey = new Map();
  const merged = [];
  for (const row of rows) {
    if (!row.name) continue;
    const existing = byKey.get(row.match_key);
    if (existing) existing.qty += row.qty;
    else {
      const next = { ...row };
      byKey.set(row.match_key, next);
      merged.push(next);
    }
  }
  return merged;
}

export function tagImportRows(parsed, current, resolved) {
  const foundByKey = new Map();
  for (const card of resolved.found || []) {
    foundByKey.set(card.match_key, card);
  }
  const currentByKey = new Map();
  for (const row of current || []) {
    currentByKey.set(row.match_key, row);
  }

  return parsed.map((row) => {
    const meta = foundByKey.get(row.match_key);
    const have = currentByKey.get(row.match_key);
    if (!meta) {
      return {
        ...row,
        kind: "unk",
        sym: "?",
        color: "#e06c5a",
        note: "not found on Scryfall",
      };
    }
    const name = meta.name || row.name;
    if (have) {
      return {
        ...row,
        name,
        kind: "upd",
        sym: "↑",
        color: "#d4a843",
        note: `have ${have.qty} → ${have.qty + row.qty}`,
        eur: meta.eur ?? null,
      };
    }
    const eur = meta.eur != null ? Number(meta.eur) : null;
    return {
      ...row,
      name,
      kind: "new",
      sym: "+",
      color: "#4fbf7a",
      note: eur != null ? formatPlainEur(eur) : "",
      eur,
    };
  });
}

function formatPlainEur(n) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

export function applyImportRows(current, rows, defaultLang = "EN") {
  const list = (current || []).map((c) => ({
    cardName: c.card_name || c.cardName,
    qty: c.qty,
    lang: c.lang || defaultLang,
  }));
  for (const row of rows.filter((r) => r.kind !== "unk")) {
    const key = matchKey(row.name);
    const i = list.findIndex((c) => matchKey(c.cardName) === key);
    if (i >= 0) list[i] = { ...list[i], qty: list[i].qty + row.qty };
    else list.push({ cardName: row.name, qty: row.qty, lang: defaultLang });
  }
  return list;
}
