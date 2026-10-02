import { pool } from "./db.js";
import { matchKey } from "./matchKey.js";
import { canAct, nextStatus, otherPartyId, summarizeItems } from "./trades.js";
import { notify } from "./notifications.js";
import { applyQtyDelta } from "./lists.js";

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function loadTrade(id) {
  const { rows } = await pool.query(
    `SELECT t.*,
            p.name AS proposer_name,
            k.name AS partner_name
     FROM trades t
     JOIN friends p ON p.id = t.proposer_id
     JOIN friends k ON k.id = t.partner_id
     WHERE t.id = $1`,
    [id]
  );
  if (!rows.length) throw httpError(404, "Trade not found.");
  return rows[0];
}

async function loadItems(tradeId) {
  const { rows } = await pool.query(
    `SELECT id, trade_id, from_id, card_name, match_key, qty, lang, eur_at_completion
     FROM trade_items WHERE trade_id = $1 ORDER BY id ASC`,
    [tradeId]
  );
  return rows;
}

function assertParty(trade, userId) {
  if (String(userId) !== String(trade.proposer_id) && String(userId) !== String(trade.partner_id)) {
    throw httpError(403, "You are not part of this trade.");
  }
}

export async function getReservedQty() {
  try {
    const { rows } = await pool.query(
      `SELECT i.from_id, i.match_key, SUM(i.qty)::int AS qty
       FROM trade_items i
       JOIN trades t ON t.id = i.trade_id
       WHERE t.status = 'accepted'
       GROUP BY i.from_id, i.match_key`
    );
    const map = new Map();
    for (const row of rows) map.set(`${row.from_id}:${row.match_key}`, row.qty);
    return map;
  } catch (err) {
    if (err.code === "42P01") return new Map();
    throw err;
  }
}

export async function listTrades(userId, statusGroup) {
  let statusFilter = "t.status IN ('proposed','accepted')";
  if (statusGroup === "history") statusFilter = "t.status IN ('completed','declined','withdrawn')";
  else if (statusGroup === "all") statusFilter = "TRUE";
  const { rows } = await pool.query(
    `SELECT t.*, p.name AS proposer_name, k.name AS partner_name
     FROM trades t
     JOIN friends p ON p.id = t.proposer_id
     JOIN friends k ON k.id = t.partner_id
     WHERE (t.proposer_id = $1 OR t.partner_id = $1) AND ${statusFilter}
     ORDER BY t.updated_at DESC`,
    [userId]
  );
  const ids = rows.map((r) => r.id);
  let items = [];
  if (ids.length) {
    const itemRes = await pool.query(
      `SELECT id, trade_id, from_id, card_name, match_key, qty, lang, eur_at_completion
       FROM trade_items WHERE trade_id = ANY($1::int[]) ORDER BY id ASC`,
      [ids]
    );
    items = itemRes.rows;
  }
  const byTrade = new Map();
  for (const item of items) {
    const list = byTrade.get(item.trade_id) || [];
    list.push(item);
    byTrade.set(item.trade_id, list);
  }
  return rows.map((t) => shapeTrade(t, byTrade.get(t.id) || [], userId));
}

export async function getTrade(id, userId) {
  const trade = await loadTrade(id);
  assertParty(trade, userId);
  const items = await loadItems(id);
  const comments = await listComments(id);
  return { ...shapeTrade(trade, items, userId), comments };
}

function shapeTrade(trade, items, userId) {
  const { get, give } = summarizeItems(items, userId);
  const partnerName =
    String(userId) === String(trade.proposer_id) ? trade.partner_name : trade.proposer_name;
  return {
    id: trade.id,
    status: trade.status,
    proposerId: trade.proposer_id,
    partnerId: trade.partner_id,
    proposerName: trade.proposer_name,
    partnerName: trade.partner_name,
    viewerIsProposer: String(userId) === String(trade.proposer_id),
    otherName: partnerName,
    createdAt: trade.created_at,
    updatedAt: trade.updated_at,
    completedAt: trade.completed_at,
    items,
    get,
    give,
  };
}

export async function createTrade(userId, { partnerId, items, message }) {
  const pid = parseInt(partnerId, 10);
  if (!Number.isFinite(pid) || pid === userId) throw httpError(400, "Pick a friend to trade with.");
  const rows = Array.isArray(items) ? items : [];
  const cleaned = [];
  for (const raw of rows) {
    const fromId = parseInt(raw.fromId ?? raw.from_id, 10);
    const qty = parseInt(raw.qty, 10);
    const name = String(raw.cardName || raw.card_name || "").trim();
    if (!name || !Number.isFinite(fromId) || !Number.isFinite(qty) || qty < 1) continue;
    if (fromId !== userId && fromId !== pid) throw httpError(400, "Cards must come from you or your partner.");
    cleaned.push({ fromId, cardName: name, match_key: matchKey(name), qty });
  }
  if (!cleaned.length) throw httpError(400, "Select at least one card.");

  const partner = await pool.query("SELECT id, name FROM friends WHERE id = $1", [pid]);
  if (!partner.rows.length) throw httpError(404, "Trader not found.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: created } = await client.query(
      `INSERT INTO trades (proposer_id, partner_id) VALUES ($1, $2)
       RETURNING *`,
      [userId, pid]
    );
    const trade = created[0];
    for (const item of cleaned) {
      await client.query(
        `INSERT INTO trade_items (trade_id, from_id, card_name, match_key, qty)
         VALUES ($1, $2, $3, $4, $5)`,
        [trade.id, item.fromId, item.cardName, item.match_key, item.qty]
      );
    }
    const note = String(message || "").trim();
    if (note) {
      await client.query("INSERT INTO trade_comments (trade_id, author_id, body) VALUES ($1, $2, $3)", [
        trade.id,
        userId,
        note,
      ]);
    }
    await client.query("COMMIT");
    const me = await pool.query("SELECT name FROM friends WHERE id = $1", [userId]);
    await notify(pid, "proposal", {
      tradeId: trade.id,
      fromId: userId,
      fromName: me.rows[0]?.name,
      itemCount: cleaned.length,
    });
    return getTrade(trade.id, userId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function actOnTrade(id, userId, action) {
  const trade = await loadTrade(id);
  assertParty(trade, userId);
  if (!canAct(trade, userId, action)) {
    throw httpError(403, "You can't do that on this trade.");
  }
  const status = nextStatus(trade.status, action);
  if (!status) throw httpError(409, `Can't ${action} a ${trade.status} trade.`);

  if (action === "complete") await completeTrade(trade, userId);
  else {
    await pool.query("UPDATE trades SET status = $1, updated_at = now() WHERE id = $2", [status, id]);
    const me = await pool.query("SELECT name FROM friends WHERE id = $1", [userId]);
    const kind = action === "accept" ? "accepted" : action === "decline" ? "declined" : "declined";
    const notifyKind = action === "withdraw" ? "declined" : kind;
    await notify(otherPartyId(trade, userId), notifyKind, {
      tradeId: trade.id,
      fromId: userId,
      fromName: me.rows[0]?.name,
      action,
    });
  }
  return getTrade(id, userId);
}

async function completeTrade(trade, userId) {
  const items = await loadItems(trade.id);
  const keys = [...new Set(items.map((i) => i.match_key))];
  const prices = new Map();
  if (keys.length) {
    const { rows } = await pool.query("SELECT match_key, eur FROM scryfall_cards WHERE match_key = ANY($1)", [keys]);
    for (const row of rows) prices.set(row.match_key, row.eur != null ? Number(row.eur) : null);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of items) {
      const eur = prices.has(item.match_key) ? prices.get(item.match_key) : null;
      await client.query("UPDATE trade_items SET eur_at_completion = $1 WHERE id = $2", [eur, item.id]);
      const receiverId =
        String(item.from_id) === String(trade.proposer_id) ? trade.partner_id : trade.proposer_id;
      await applyQtyDelta(client, "collection_cards", item.from_id, item.match_key, -item.qty);
      await applyQtyDelta(client, "collection_cards", receiverId, item.match_key, item.qty, item.card_name, item.lang);
      await applyQtyDelta(client, "wishlist_cards", receiverId, item.match_key, -item.qty);
    }
    await client.query(
      "UPDATE trades SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1",
      [trade.id]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const me = await pool.query("SELECT name FROM friends WHERE id = $1", [userId]);
  const payload = { tradeId: trade.id, fromId: userId, fromName: me.rows[0]?.name, action: "complete" };
  await notify(trade.proposer_id, "completed", payload);
  await notify(trade.partner_id, "completed", payload);
}

export async function listComments(tradeId) {
  const { rows } = await pool.query(
    `SELECT c.id, c.trade_id, c.author_id, c.body, c.created_at, f.name AS author_name
     FROM trade_comments c
     JOIN friends f ON f.id = c.author_id
     WHERE c.trade_id = $1
     ORDER BY c.created_at ASC`,
    [tradeId]
  );
  return rows;
}

export async function addComment(tradeId, userId, body) {
  const trade = await loadTrade(tradeId);
  assertParty(trade, userId);
  const text = String(body || "").trim();
  if (!text) throw httpError(400, "Write a comment first.");
  await pool.query("INSERT INTO trade_comments (trade_id, author_id, body) VALUES ($1, $2, $3)", [
    tradeId,
    userId,
    text,
  ]);
  await pool.query("UPDATE trades SET updated_at = now() WHERE id = $1", [tradeId]);
  const me = await pool.query("SELECT name FROM friends WHERE id = $1", [userId]);
  await notify(otherPartyId(trade, userId), "comment", {
    tradeId,
    fromId: userId,
    fromName: me.rows[0]?.name,
    preview: text.slice(0, 120),
  });
  return listComments(tradeId);
}

export async function notifyNewMatches(ownerId, ownerName, matchKeys) {
  const keys = [...new Set((matchKeys || []).filter(Boolean))];
  if (!keys.length) return;
  const { rows } = await pool.query(
    `SELECT DISTINCT friend_id FROM wishlist_cards
     WHERE match_key = ANY($1) AND friend_id <> $2`,
    [keys, ownerId]
  );
  for (const row of rows) {
    await notify(row.friend_id, "match", { fromId: ownerId, fromName: ownerName, keys });
  }
}
