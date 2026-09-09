import express from "express";
import { autocomplete, resolveNames, getCachedCards } from "../scryfall.js";

export const scryfallRouter = express.Router();

// Typeahead for the Add cards drawer. The client debounces 250 ms; this
// proxy keeps the Scryfall User-Agent and rate limiting on the server.
scryfallRouter.get("/scryfall/autocomplete", async (req, res) => {
  try {
    res.json({ data: await autocomplete(req.query.q) });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Could not reach Scryfall." });
  }
});

// Resolve names and fill the cache. Used by Import preview (for not_found)
// and by the hover preview when a card isn't cached yet.
scryfallRouter.post("/scryfall/resolve", async (req, res) => {
  const names = Array.isArray(req.body?.names) ? req.body.names.slice(0, 300) : [];
  if (!names.length) return res.json({ found: [], not_found: [] });
  try {
    res.json(await resolveNames(names));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Could not reach Scryfall." });
  }
});

// Cache read: the whole app reads card metadata and EUR prices from here.
scryfallRouter.get("/cards", async (req, res) => {
  const keys = String(req.query.keys || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  try {
    res.json(await getCachedCards(keys));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load cards." });
  }
});
