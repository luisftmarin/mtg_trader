import { pool } from "./db.js";
import { mergeSettings, normalizePhone } from "./profileSettings.js";

export async function getProfile(userId) {
  const { rows } = await pool.query(
    `SELECT id, name, display_name, phone, binder_paused, settings, last_seen_at
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
  const phone = normalizePhone(body.phone);
  if (phone === null) {
    const err = new Error("Enter your WhatsApp number with the country code, e.g. +351 912 345 678.");
    err.status = 400;
    throw err;
  }
  const binderPaused = !!(body.binderPaused ?? body.binder_paused);
  const settings = mergeSettings(body.settings);
  const { rows } = await pool.query(
    `UPDATE friends
     SET display_name = $2, phone = $3, binder_paused = $4, settings = $5::jsonb
     WHERE id = $1
     RETURNING id, name, display_name, phone, binder_paused, settings, last_seen_at`,
    [userId, displayName, phone || null, binderPaused, JSON.stringify(settings)]
  );
  const prices = await pool.query("SELECT MAX(fetched_at) AS last_update FROM scryfall_cards");
  return shapeProfile(rows[0], prices.rows[0]?.last_update);
}

// Phone numbers stay off the public roster; only signed-in traders get them.
export async function listContacts() {
  const { rows } = await pool.query(
    "SELECT id, phone FROM friends WHERE phone IS NOT NULL AND phone <> ''"
  );
  return rows;
}

export async function touchLastSeen(userId) {
  if (!userId) return;
  await pool.query(
    `UPDATE friends
     SET last_seen_at = now()
     WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '30 seconds')`,
    [userId]
  );
}

function shapeProfile(row, pricesUpdatedAt) {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name || row.name,
    phone: row.phone || "",
    binderPaused: !!row.binder_paused,
    settings: mergeSettings(row.settings),
    lastSeenAt: row.last_seen_at,
    pricesUpdatedAt: pricesUpdatedAt || null,
  };
}
