import { pool } from "./db.js";
import { matchKey } from "./matchKey.js";
import { warmCache } from "./scryfall.js";

export const LIST_TABLES = {
  collection: "collection_cards",
  wishlist: "wishlist_cards",
};

const LANGS = new Set(["EN", "DE", "PT", "ES", "FR", "IT", "JP"]);

export function normalizeLang(lang) {
  const v = String(lang || "EN")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  return LANGS.has(v) ? v : "EN";
}

export function tableFor(target) {
  return LIST_TABLES[target] || null;
}

export async function getCards(table, friendId) {
  const { rows } = await pool.query(
    `SELECT id, card_name, match_key, qty, lang FROM ${table} WHERE friend_id = $1 ORDER BY card_name ASC`,
    [friendId]
  );
  return rows;
}

export async function replaceList(table, friendId, cards) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM ${table} WHERE friend_id = $1`, [friendId]);

    const cleaned = cards
      .map((c) => ({
        cardName: String(c.cardName || c.card_name || "").trim(),
        qty: Number.isFinite(parseInt(c.qty, 10)) && c.qty > 0 ? parseInt(c.qty, 10) : 1,
        lang: normalizeLang(c.lang),
      }))
      .filter((c) => c.cardName);

    const merged = [];
    const byKey = new Map();
    for (const c of cleaned) {
      const key = matchKey(c.cardName);
      const existing = byKey.get(key);
      if (existing) {
        existing.qty += c.qty;
      } else {
        const row = { cardName: c.cardName, qty: c.qty, lang: c.lang };
        byKey.set(key, row);
        merged.push(row);
      }
    }

    const CHUNK_SIZE = 500;
    for (let i = 0; i < merged.length; i += CHUNK_SIZE) {
      const chunk = merged.slice(i, i + CHUNK_SIZE);
      const values = [];
      const placeholders = chunk.map((c, idx) => {
        const base = idx * 5;
        values.push(friendId, c.cardName, matchKey(c.cardName), c.qty, c.lang);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      });
      await client.query(
        `INSERT INTO ${table} (friend_id, card_name, match_key, qty, lang) VALUES ${placeholders.join(", ")}`,
        values
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function upsertCard(table, friendId, { cardName, qty, lang }) {
  const name = String(cardName || "").trim();
  if (!name) throw Object.assign(new Error("Card name is required."), { status: 400 });
  const q = Number.isFinite(parseInt(qty, 10)) && qty > 0 ? parseInt(qty, 10) : 1;
  const code = normalizeLang(lang);
  const key = matchKey(name);
  const existing = await pool.query(
    `SELECT id, qty FROM ${table} WHERE friend_id = $1 AND match_key = $2`,
    [friendId, key]
  );
  if (existing.rows[0]) {
    await pool.query(`UPDATE ${table} SET qty = qty + $1, lang = $2, card_name = $3 WHERE id = $4`, [
      q,
      code,
      name,
      existing.rows[0].id,
    ]);
  } else {
    await pool.query(
      `INSERT INTO ${table} (friend_id, card_name, match_key, qty, lang) VALUES ($1, $2, $3, $4, $5)`,
      [friendId, name, key, q, code]
    );
  }
  warmCache([name]);
  return getCards(table, friendId);
}

export async function patchCard(table, friendId, cardId, { qty, lang }) {
  const fields = [];
  const values = [];
  if (qty != null) {
    const q = parseInt(qty, 10);
    if (!Number.isFinite(q) || q < 1) throw Object.assign(new Error("Quantity must be at least 1."), { status: 400 });
    values.push(q);
    fields.push(`qty = $${values.length}`);
  }
  if (lang != null) {
    values.push(normalizeLang(lang));
    fields.push(`lang = $${values.length}`);
  }
  if (!fields.length) throw Object.assign(new Error("Nothing to update."), { status: 400 });
  values.push(cardId, friendId);
  const result = await pool.query(
    `UPDATE ${table} SET ${fields.join(", ")} WHERE id = $${values.length - 1} AND friend_id = $${values.length} RETURNING id`,
    values
  );
  if (!result.rows.length) throw Object.assign(new Error("Card not found."), { status: 404 });
  return getCards(table, friendId);
}

export async function deleteCard(table, friendId, cardId) {
  const result = await pool.query(`DELETE FROM ${table} WHERE id = $1 AND friend_id = $2 RETURNING card_name, qty, lang, match_key`, [
    cardId,
    friendId,
  ]);
  if (!result.rows.length) throw Object.assign(new Error("Card not found."), { status: 404 });
  return result.rows[0];
}

export function canEditFriend(user, friendId) {
  return String(user.id) === String(friendId) || !!user.isAdmin;
}
