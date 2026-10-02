import { matchKey } from "./matchKey.js";

// Handoff grammar: quantity first, optional "x", then the name, then an
// optional "(SET) collector" tail. Lines that don't match still count as
// qty 1 with the whole line as the name.
export const IMPORT_LINE = /^(\d+)\s*x?\s+(.+?)(\s+\([A-Za-z0-9]{2,5}\).*)?$/i;

const HEADER = /^(name|card name|qty|quantity|count|qty x name)\b/i;

const NAME_HEADERS = ["card name", "cardname", "oracle name", "name"];
const QTY_HEADERS = ["quantity", "qty", "count", "copies", "amount"];
const SKIP_NAME_HEADERS = ["edition name", "set name", "binder name", "folder name"];
const SKIP_QTY_HEADERS = ["tradelist count"];
const SECTION_HEADERS = ["binder type", "folder", "section", "board", "category"];
const LANG_HEADERS = ["language", "lang"];
const SKIP_SECTIONS = /^(maybeboard|maybe|sideboard)$/i;

export const CSV_FORMATS = {
  auto: {
    label: "Auto-detect",
    card_name: NAME_HEADERS,
    qty: QTY_HEADERS,
    skipName: SKIP_NAME_HEADERS,
    skipQty: SKIP_QTY_HEADERS,
    lang: LANG_HEADERS,
    section: SECTION_HEADERS,
  },
  archidekt: {
    label: "Archidekt",
    card_name: ["name", "card name"],
    qty: ["quantity", "qty"],
    skipName: SKIP_NAME_HEADERS,
    lang: LANG_HEADERS,
  },
  moxfield: {
    label: "Moxfield",
    card_name: ["name", "card name"],
    qty: ["count", "quantity", "qty"],
    skipName: SKIP_NAME_HEADERS,
    skipQty: SKIP_QTY_HEADERS,
    lang: LANG_HEADERS,
  },
  manabox: {
    label: "ManaBox",
    card_name: ["name (en)", "name", "card name"],
    qty: ["quantity", "qty", "count"],
    skipName: SKIP_NAME_HEADERS,
    lang: LANG_HEADERS,
    section: SECTION_HEADERS,
  },
  deckbox: {
    label: "Deckbox",
    card_name: ["name", "card name"],
    qty: ["count", "quantity", "qty"],
    skipName: SKIP_NAME_HEADERS,
    skipQty: SKIP_QTY_HEADERS,
    lang: LANG_HEADERS,
  },
  names: {
    label: "Names only",
    card_name: ["name", "card name"],
    qty: [],
    skipName: SKIP_NAME_HEADERS,
  },
};

export function parseImportLines(text, format = "auto") {
  const raw = String(text || "").replace(/^\uFEFF/, "");
  const spec = CSV_FORMATS[format] || CSV_FORMATS.auto;
  const csvRows = tryParseCsv(raw, spec);
  if (csvRows) return mergeParsed(csvRows);

  if (format !== "auto" && looksLikeCsv(raw)) {
    const expected = [...spec.card_name, ...(spec.qty || [])]
      .filter(Boolean)
      .map((h) => h.replace(/\b\w/g, (c) => c.toUpperCase()))
      .join(", ");
    throw new Error(`This doesn't look like a ${spec.label} CSV. Expected columns like ${expected}.`);
  }

  const rows = [];
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    if (line.startsWith("//") || line.startsWith("#")) continue;
    if (/^(sideboard|maybeboard|commander|commanders|deck|companion|companions)\s*:?\s*$/i.test(line)) continue;
    if (HEADER.test(line.replace(/"/g, ""))) continue;
    rows.push(parseImportLine(line));
  }
  return mergeParsed(rows);
}

function normHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/^"|"$/g, "")
    .trim()
    .toLowerCase();
}

function detectDelimiter(headerLine) {
  const commas = (headerLine.match(/,/g) || []).length;
  const tabs = (headerLine.match(/\t/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  if (tabs > commas && tabs > semis) return "\t";
  if (semis > commas) return ";";
  return ",";
}

function parseCsvRecords(text, delimiter) {
  const records = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') inQuotes = false;
      else field += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n" || (c === "\r" && next === "\n") || c === "\r") {
      row.push(field);
      records.push(row);
      row = [];
      field = "";
      if (c === "\r" && next === "\n") i += 1;
      continue;
    }
    field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    records.push(row);
  }
  return records;
}

function looksLikeCsv(text) {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim());
  return Boolean(firstLine && (firstLine.includes(",") || firstLine.includes("\t") || firstLine.includes(";")));
}

function headerIndex(headers, names, skip = []) {
  const skipSet = new Set(skip);
  for (const name of names || []) {
    const i = headers.findIndex((h) => h === name && !skipSet.has(h));
    if (i >= 0) return i;
  }
  return -1;
}

function tryParseCsv(text, spec = CSV_FORMATS.auto) {
  if (!looksLikeCsv(text)) return null;
  const firstLine = text.split(/\r?\n/).find((l) => l.trim());
  const delimiter = detectDelimiter(firstLine);
  const records = parseCsvRecords(text, delimiter);
  const qtyRequired = (spec.qty || []).length > 0;
  let headerAt = -1;
  let nameIdx = -1;
  let qtyIdx = -1;
  let sectionIdx = -1;
  let langIdx = -1;
  const scan = Math.min(records.length, 8);
  for (let i = 0; i < scan; i++) {
    const headers = records[i].map(normHeader);
    const n = headerIndex(headers, spec.card_name, spec.skipName);
    const q = headerIndex(headers, spec.qty, spec.skipQty);
    if (n >= 0 && (!qtyRequired || q >= 0)) {
      headerAt = i;
      nameIdx = n;
      qtyIdx = q;
      sectionIdx = headerIndex(headers, spec.section || SECTION_HEADERS);
      langIdx = headerIndex(headers, spec.lang || []);
      break;
    }
  }
  if (headerAt < 0) return null;

  const rows = [];
  for (const record of records.slice(headerAt + 1)) {
    if (!record.some((cell) => String(cell).trim())) continue;
    if (sectionIdx >= 0 && SKIP_SECTIONS.test(normHeader(record[sectionIdx]))) continue;
    const name = String(record[nameIdx] ?? "")
      .replace(/\s+\([A-Za-z0-9]{2,5}\).*$/, "")
      .trim();
    if (!name || HEADER.test(name)) continue;
    const qty =
      qtyIdx >= 0 ? parseInt(String(record[qtyIdx] ?? "").replace(/[^\d.-]/g, ""), 10) : 1;
    if (!Number.isFinite(qty) || qty < 1) continue;
    const lang = langIdx >= 0 ? normalizeImportLang(record[langIdx]) : undefined;
    rows.push({ qty, name, match_key: matchKey(name), ...(lang ? { lang } : {}) });
  }
  return rows.length ? rows : null;
}

function normalizeImportLang(value) {
  const v = String(value || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  if (["EN", "DE", "PT", "ES", "FR", "IT", "JP"].includes(v)) return v;
  return undefined;
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

  const incomingKeys = new Set();
  const tagged = parsed.map((row) => {
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
    incomingKeys.add(row.match_key);
    const name = meta.name || row.name;
    const eur = meta.eur != null ? Number(meta.eur) : null;
    if (have && have.qty === row.qty) {
      return {
        ...row,
        name,
        kind: "keep",
        sym: "=",
        color: "#9aa0aa",
        note: `keep ${row.qty}`,
        eur,
      };
    }
    if (have) {
      return {
        ...row,
        name,
        kind: "upd",
        sym: "↑",
        color: "#d4a843",
        note: `have ${have.qty} → ${row.qty}`,
        eur,
      };
    }
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

  for (const have of current || []) {
    if (incomingKeys.has(have.match_key)) continue;
    tagged.push({
      qty: have.qty,
      name: have.card_name || have.cardName,
      match_key: have.match_key,
      kind: "del",
      sym: "−",
      color: "#e06c5a",
      note: "removed",
    });
  }

  return tagged;
}

function formatPlainEur(n) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

export function applyImportRows(current, rows, defaultLang = "EN") {
  const currentByKey = new Map();
  for (const c of current || []) {
    currentByKey.set(c.match_key || matchKey(c.card_name || c.cardName), c);
  }
  const next = [];
  for (const row of rows || []) {
    if (row.kind === "unk" || row.kind === "del") continue;
    const key = row.match_key || matchKey(row.name);
    const prev = currentByKey.get(key);
    next.push({
      cardName: row.name,
      qty: row.qty,
      lang: row.lang || prev?.lang || defaultLang,
    });
  }
  return next;
}
