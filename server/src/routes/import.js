import { requireAuth } from "../auth.js";
import { pool } from "../db.js";
import { resolveNames } from "../scryfall.js";
import { parseImportLines, tagImportRows, applyImportRows } from "../importList.js";
import {
  canEditFriend,
  cleanListName,
  createWishlist,
  getCards,
  replaceList,
  resolveListId,
  tableFor,
} from "../lists.js";

function targetFrom(body) {
  const t = String(body?.target || "collection").toLowerCase();
  if (t === "wish" || t === "wishlist") return "wishlist";
  return "collection";
}

// A wishlist import replaces one named list, never the trader's other lists.
// With `newListName` the import goes into a list that doesn't exist yet.
async function currentCards(target, table, friendId, body) {
  const all = await getCards(table, friendId);
  if (target !== "wishlist") return { current: all, listId: null };
  if (body.newListName != null && body.newListName !== "") {
    cleanListName(body.newListName);
    return { current: [], listId: null };
  }
  const listId = await resolveListId(friendId, body.listId);
  return { current: all.filter((c) => c.list_id === listId), listId };
}

export function mountImportRoutes(app) {
  app.post("/api/import/preview", requireAuth, async (req, res) => {
    const target = targetFrom(req.body);
    const table = tableFor(target);
    const friendId = req.body.friendId || req.user.id;
    if (!canEditFriend(req.user, friendId)) {
      return res.status(403).json({ error: "You can only import into your own binder." });
    }
    try {
      const parsed = parseImportLines(req.body.list, req.body.format);
      const { current } = await currentCards(target, table, friendId, req.body);
      const resolved = await resolveNames(parsed.map((r) => r.name));
      const rows = tagImportRows(parsed, current, resolved);
      res.json({
        target,
        rows,
        summary: {
          new: rows.filter((r) => r.kind === "new").length,
          updated: rows.filter((r) => r.kind === "upd").length,
          kept: rows.filter((r) => r.kind === "keep").length,
          removed: rows.filter((r) => r.kind === "del").length,
          unknown: rows.filter((r) => r.kind === "unk").length,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message || "Could not preview import." });
    }
  });

  app.post("/api/import/apply", requireAuth, async (req, res) => {
    const target = targetFrom(req.body);
    const table = tableFor(target);
    const friendId = req.body.friendId || req.user.id;
    if (!canEditFriend(req.user, friendId)) {
      return res.status(403).json({ error: "You can only import into your own binder." });
    }
    try {
      const { current, listId: existingList } = await currentCards(target, table, friendId, req.body);
      const langRow = await pool.query("SELECT default_lang FROM friends WHERE id = $1", [friendId]);
      const defaultLang = langRow.rows[0]?.default_lang || "EN";
      let rows = Array.isArray(req.body.rows) ? req.body.rows : null;
      if (!rows) {
        const parsed = parseImportLines(req.body.list, req.body.format);
        const resolved = await resolveNames(parsed.map((r) => r.name));
        rows = tagImportRows(parsed, current, resolved);
      }
      const previous = current.map((c) => ({ cardName: c.card_name, qty: c.qty, lang: c.lang }));
      const next = applyImportRows(current, rows, defaultLang);
      let listId = existingList;
      if (target === "wishlist" && !listId) listId = (await createWishlist(friendId, req.body.newListName)).id;
      await replaceList(table, friendId, next, { listId });
      const cards = await getCards(table, friendId);
      res.json({ target, cards, previous, listId });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error(err);
      res.status(500).json({ error: "Could not apply import." });
    }
  });
}
