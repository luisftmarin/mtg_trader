import { requireAuth } from "../auth.js";
import { listNotifications, markAllRead, markRead } from "../notifications.js";
import { actOnTrade, addComment, createTrade, getTrade, listComments, listTrades } from "../tradeService.js";

function sendError(res, err) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Something went wrong." });
}

export function mountTradeRoutes(app) {
  app.get("/api/trades", requireAuth, async (req, res) => {
    try {
      const group = String(req.query.status || "open").toLowerCase();
      const rows = await listTrades(req.user.id, group === "history" ? "history" : group === "all" ? "all" : "open");
      res.json(rows);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/trades", requireAuth, async (req, res) => {
    try {
      const trade = await createTrade(req.user.id, {
        partnerId: req.body.partnerId ?? req.body.partner_id,
        items: req.body.items,
        message: req.body.message,
      });
      res.status(201).json(trade);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/trades/:id", requireAuth, async (req, res) => {
    try {
      res.json(await getTrade(req.params.id, req.user.id));
    } catch (err) {
      sendError(res, err);
    }
  });

  for (const action of ["accept", "decline", "withdraw", "complete"]) {
    app.post(`/api/trades/:id/${action}`, requireAuth, async (req, res) => {
      try {
        res.json(await actOnTrade(req.params.id, req.user.id, action));
      } catch (err) {
        sendError(res, err);
      }
    });
  }

  app.get("/api/trades/:id/comments", requireAuth, async (req, res) => {
    try {
      await getTrade(req.params.id, req.user.id);
      res.json(await listComments(req.params.id));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/trades/:id/comments", requireAuth, async (req, res) => {
    try {
      res.json(await addComment(req.params.id, req.user.id, req.body.body));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      res.json(await listNotifications(req.user.id));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      await markAllRead(req.user.id);
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      await markRead(req.user.id, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });
}
