import { pool } from "./db.js";
import { mergeSettings } from "./profileSettings.js";

const LANGS = new Set(["EN", "DE", "PT", "ES", "FR", "IT", "JP"]);

function normalizeLang(lang) {
  const v = String(lang || "EN")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  return LANGS.has(v) ? v : "EN";
}

export async function getProfile(userId) {
  const { rows } = await pool.query(
    `SELECT id, name, display_name, city, default_lang, binder_paused, settings, last_seen_at
     FROM friends WHERE id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) {
    const err = new Error("Trader not found.");
    err.status = 404;
    throw err;
  }
  const prices = await pool.query("SELECT MAX(fetched_at) AS last_update FROM scryfall_cards");
  return shapeProfile(row, prices.rows[0]?.last_update);
}

export async function updateProfile(userId, body) {
  const displayName = String(body.displayName ?? body.display_name ?? "").trim().slice(0, 40);
  if (!displayName) {
    const err = new Error("Display name is required.");
    err.status = 400;
    throw err;
  }
  const city = String(body.city ?? "").trim().slice(0, 80);
  const defaultLang = normalizeLang(body.defaultLang ?? body.default_lang);
  const binderPaused = !!(body.binderPaused ?? body.binder_paused);
  const settings = mergeSettings(body.settings);
  const { rows } = await pool.query(
    `UPDATE friends
     SET display_name = $2, city = $3, default_lang = $4, binder_paused = $5, settings = $6::jsonb
     WHERE id = $1
     RETURNING id, name, display_name, city, default_lang, binder_paused, settings, last_seen_at`,
    [userId, displayName, city || null, defaultLang, binderPaused, JSON.stringify(settings)]
  );
  const prices = await pool.query("SELECT MAX(fetched_at) AS last_update FROM scryfall_cards");
  return shapeProfile(rows[0], prices.rows[0]?.last_update);
}

export async function touchLastSeen(userId) {
  if (!userId) return;
  await pool.query(
    `UPDATE friends
     SET last_seen_at = now()
     WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '2 minutes')`,
    [userId]
  );
}

function shapeProfile(row, pricesUpdatedAt) {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name || row.name,
    city: row.city || "",
    defaultLang: row.default_lang || "EN",
    binderPaused: !!row.binder_paused,
    settings: mergeSettings(row.settings),
    lastSeenAt: row.last_seen_at,
    pricesUpdatedAt: pricesUpdatedAt || null,
  };
}
