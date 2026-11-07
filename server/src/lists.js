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

const isWishlist = (table) => table === "wishlist_cards";

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// --- Named wishlists ---

export function cleanListName(raw) {
  const name = String(raw || "").replace(/\s+/g, " ").trim();
  if (!name) throw httpError(400, "Give the list a name.");
  if (name.length > 40) throw httpError(400, "List names can be at most 40 characters.");
  return name;
}

export async function listWishlists(friendId, db = pool) {
  const { rows } = await db.query(
    `SELECT l.id, l.name, COALESCE(SUM(w.qty), 0)::int AS count
     FROM wishlists l LEFT JOIN wishlist_cards w ON w.list_id = l.id
     WHERE l.friend_id = $1
     GROUP BY l.id ORDER BY l.id ASC`,
    [friendId]
  );
  return rows;
}

// The first list doubles as the default for cards added without one.
export async function defaultListId(friendId, db = pool) {
  const found = await db.query("SELECT id FROM wishlists WHERE friend_id = $1 ORDER BY id LIMIT 1", [friendId]);
  if (found.rows[0]) return found.rows[0].id;
  const made = await db.query(
    `INSERT INTO wishlists (friend_id, name) VALUES ($1, 'Wishlist')
     ON CONFLICT (friend_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [friendId]
  );
  return made.rows[0].id;
}

// Returns a list id that belongs to friendId, or the default list when none is given.
export async function resolveListId(friendId, listId, db = pool) {
  if (listId == null || listId === "") return defaultListId(friendId, db);
  const { rows } = await db.query("SELECT id FROM wishlists WHERE id = $1 AND friend_id = $2", [listId, friendId]);
  if (!rows[0]) throw httpError(404, "That wishlist doesn't exist.");
  return rows[0].id;
}

export async function createWishlist(friendId, rawName) {
  const name = cleanListName(rawName);
  try {
    const { rows } = await pool.query(
      "INSERT INTO wishlists (friend_id, name) VALUES ($1, $2) RETURNING id, name",
      [friendId, name]
    );
    return { ...rows[0], count: 0 };
  } catch (err) {
    if (err.code === "23505") throw httpError(409, `You already have a list called "${name}".`);
    throw err;
  }
}

export async function renameWishlist(friendId, listId, rawName) {
  const name = cleanListName(rawName);
  try {
    const { rows } = await pool.query(
      "UPDATE wishlists SET name = $1 WHERE id = $2 AND friend_id = $3 RETURNING id",
      [name, listId, friendId]
    );
    if (!rows[0]) throw httpError(404, "That wishlist doesn't exist.");
  } catch (err) {
    if (err.code === "23505") throw httpError(409, `You already have a list called "${name}".`);
    throw err;
  }
}

export async function deleteWishlist(friendId, listId) {
  const lists = await listWishlists(friendId);
  if (!lists.some((l) => String(l.id) === String(listId))) throw httpError(404, "That wishlist doesn't exist.");
  if (lists.length < 2) throw httpError(400, "You need at least one wishlist. Clear it instead.");
  await pool.query("DELETE FROM wishlists WHERE id = $1 AND friend_id = $2", [listId, friendId]);
}

// --- Cards ---

export async function getCards(table, friendId) {
  const { rows } = await pool.query(
    `SELECT id, card_name, match_key, qty, lang${isWishlist(table) ? ", list_id" : ""}
     FROM ${table} WHERE friend_id = $1 ORDER BY card_name ASC`,
    [friendId]
  );
  return rows;
}

// Replaces the friend's list. For wishlists, `listId` limits the replace to
// one named list; without it every wishlist card is replaced. Cards may carry
// their own listId (used to undo a clear across all lists).
export async function replaceList(table, friendId, cards, { listId } = {}) {
  const wish = isWishlist(table);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let scopeList = null;
    let ownLists = new Set();
    if (wish) {
      if (listId != null && listId !== "") scopeList = await resolveListId(friendId, listId, client);
      ownLists = new Set((await listWishlists(friendId, client)).map((l) => String(l.id)));
      if (!ownLists.size) ownLists.add(String(await defaultListId(friendId, client)));
    }
    if (scopeList) {
      await client.query(`DELETE FROM ${table} WHERE friend_id = $1 AND list_id = $2`, [friendId, scopeList]);
    } else {
      await client.query(`DELETE FROM ${table} WHERE friend_id = $1`, [friendId]);
    }
    const fallbackList = wish ? scopeList || Number([...ownLists][0]) : null;

    const cleaned = cards
      .map((c) => {
        const own = c.listId ?? c.list_id;
        return {
          cardName: String(c.cardName || c.card_name || "").trim(),
          qty: Number.isFinite(parseInt(c.qty, 10)) && c.qty > 0 ? parseInt(c.qty, 10) : 1,
          lang: normalizeLang(c.lang),
          listId: wish ? (!scopeList && own != null && ownLists.has(String(own)) ? Number(own) : fallbackList) : null,
        };
      })
      .filter((c) => c.cardName);

    const merged = [];
    const byKey = new Map();
    for (const c of cleaned) {
      const key = `${c.listId ?? ""}|${matchKey(c.cardName)}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.qty += c.qty;
      } else {
        const row = { ...c };
        byKey.set(key, row);
        merged.push(row);
      }
    }

    const cols = wish ? 6 : 5;
    const CHUNK_SIZE = 500;
    for (let i = 0; i < merged.length; i += CHUNK_SIZE) {
      const chunk = merged.slice(i, i + CHUNK_SIZE);
      const values = [];
      const placeholders = chunk.map((c, idx) => {
        const base = idx * cols;
        values.push(friendId, c.cardName, matchKey(c.cardName), c.qty, c.lang);
        if (wish) values.push(c.listId);
        return `(${Array.from({ length: cols }, (_, k) => `$${base + k + 1}`).join(", ")})`;
      });
      await client.query(
        `INSERT INTO ${table} (friend_id, card_name, match_key, qty, lang${wish ? ", list_id" : ""}) VALUES ${placeholders.join(", ")}`,
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

export async function upsertCard(table, friendId, { cardName, qty, lang, listId }) {
  const name = String(cardName || "").trim();
  if (!name) throw Object.assign(new Error("Card name is required."), { status: 400 });
  const q = Number.isFinite(parseInt(qty, 10)) && qty > 0 ? parseInt(qty, 10) : 1;
  const code = normalizeLang(lang);
  const key = matchKey(name);
  const list = isWishlist(table) ? await resolveListId(friendId, listId) : null;
  const existing = await pool.query(
    `SELECT id, qty FROM ${table} WHERE friend_id = $1 AND match_key = $2${list ? " AND list_id = $3" : ""}`,
    list ? [friendId, key, list] : [friendId, key]
  );
  if (existing.rows[0]) {
    await pool.query(`UPDATE ${table} SET qty = qty + $1, lang = $2, card_name = $3 WHERE id = $4`, [
      q,
      code,
      name,
      existing.rows[0].id,
    ]);
  } else if (list) {
    await pool.query(
      `INSERT INTO ${table} (friend_id, card_name, match_key, qty, lang, list_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [friendId, name, key, q, code, list]
    );
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

// Used when completing a trade: move qty between binders. Negative qty
// removes copies (and the row if it hits 0). Positive qty upserts.
export async function applyQtyDelta(client, table, friendId, key, delta, cardName, lang) {
  const n = parseInt(delta, 10);
  if (!Number.isFinite(n) || n === 0) return;
  const { rows } = await client.query(
    `SELECT id, qty, card_name, lang FROM ${table} WHERE friend_id = $1 AND match_key = $2 ORDER BY id FOR UPDATE`,
    [friendId, key]
  );
  const row = rows[0];
  if (n < 0) {
    // A wishlist card can sit on several named lists; take copies off each in turn.
    let left = -n;
    for (const r of rows) {
      if (left < 1) break;
      const take = Math.min(left, r.qty);
      left -= take;
      if (r.qty - take < 1) {
        await client.query(`DELETE FROM ${table} WHERE id = $1`, [r.id]);
      } else {
        await client.query(`UPDATE ${table} SET qty = $1 WHERE id = $2`, [r.qty - take, r.id]);
      }
    }
    return;
  }
  if (row) {
    await client.query(`UPDATE ${table} SET qty = qty + $1 WHERE id = $2`, [n, row.id]);
    return;
  }
  if (table !== "collection_cards") return;
  const name = String(cardName || key).trim();
  if (!name) return;
  await client.query(
    `INSERT INTO ${table} (friend_id, card_name, match_key, qty, lang) VALUES ($1, $2, $3, $4, $5)`,
    [friendId, name, key, n, normalizeLang(lang)]
  );
}
