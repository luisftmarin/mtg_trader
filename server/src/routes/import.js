import { requireAuth } from "../auth.js";
import { pool } from "../db.js";
import { resolveNames } from "../scryfall.js";
import { parseImportLines, tagImportRows, applyImportRows } from "../importList.js";
import { canEditFriend, getCards, replaceList, tableFor } from "../lists.js";

function targetFrom(body) {
  const t = String(body?.target || "collection").toLowerCase();
  if (t === "wish" || t === "wishlist") return "wishlist";
  return "collection";
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
      const parsed = parseImportLines(req.body.list);
      const current = await getCards(table, friendId);
      const resolved = await resolveNames(parsed.map((r) => r.name));
      const rows = tagImportRows(parsed, current, resolved);
      res.json({
        target,
        rows,
        summary: {
          new: rows.filter((r) => r.kind === "new").length,
          updated: rows.filter((r) => r.kind === "upd").length,
          unknown: rows.filter((r) => r.kind === "unk").length,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not preview import." });
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
      const current = await getCards(table, friendId);
      const langRow = await pool.query("SELECT default_lang FROM friends WHERE id = $1", [friendId]);
      const defaultLang = langRow.rows[0]?.default_lang || "EN";
      let rows = Array.isArray(req.body.rows) ? req.body.rows : null;
      if (!rows) {
        const parsed = parseImportLines(req.body.list);
        const resolved = await resolveNames(parsed.map((r) => r.name));
        rows = tagImportRows(parsed, current, resolved);
      }
      const previous = current.map((c) => ({ cardName: c.card_name, qty: c.qty, lang: c.lang }));
      const next = applyImportRows(current, rows, defaultLang);
      await replaceList(table, friendId, next);
      const cards = await getCards(table, friendId);
      res.json({ target, cards, previous });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not apply import." });
    }
  });
}
