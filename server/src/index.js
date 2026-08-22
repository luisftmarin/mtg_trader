import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db.js";
import { computeMatches } from "./matching.js";
import { hashPassword, verifyPassword, signToken, requireAuth } from "./auth.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173").split(",");

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (Postman, curl, server-to-server)
    if (!origin) return callback(null, true);

    const isExplicitlyAllowed = ALLOWED_ORIGINS.includes(origin);
    const isVercelPreview = /^https:\/\/mtg-trader-.*-luisftmarins-projects\.vercel\.app$/.test(origin);

    if (isExplicitlyAllowed || isVercelPreview) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));





app.use(express.json({ limit: "5mb" }));

function matchKey(name) {
  return String(name || "").trim().split("//")[0].trim().toLowerCase();
}

// --- Auth ---

app.post("/api/auth/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const password = String(req.body.password || "");
  const adminCode = String(req.body.adminCode || "");
  if (!name || !password) return res.status(400).json({ error: "Name and password are required." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  const grantAdmin = !!process.env.ADMIN_SIGNUP_CODE && adminCode === process.env.ADMIN_SIGNUP_CODE;
  try {
    const existing = await pool.query("SELECT id FROM friends WHERE name = $1", [name]);
    if (existing.rows.length) return res.status(409).json({ error: "That name is already taken." });
    const hash = await hashPassword(password);
    const { rows } = await pool.query(
      "INSERT INTO friends (name, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id, name, is_admin",
      [name, hash, grantAdmin]
    );
    const friend = rows[0];
    res.status(201).json({ token: signToken(friend), friend: { id: friend.id, name: friend.name, isAdmin: friend.is_admin } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const password = String(req.body.password || "");
  try {
    const { rows } = await pool.query("SELECT id, name, password_hash, is_admin FROM friends WHERE name = $1", [name]);
    const friend = rows[0];
    if (!friend || !friend.password_hash) {
      return res.status(401).json({ error: "Incorrect name or password." });
    }
    const ok = await verifyPassword(password, friend.password_hash);
    if (!ok) return res.status(401).json({ error: "Incorrect name or password." });
    res.json({ token: signToken(friend), friend: { id: friend.id, name: friend.name, isAdmin: friend.is_admin } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not sign in." });
  }
});

// --- Friends ---
// Viewing the roster and matches doesn't require auth (it's a shared board),
// but every route below that changes data does.

app.get("/api/friends", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT f.id, f.name,
        COALESCE(c.cnt, 0)::int AS collection_count,
        COALESCE(w.cnt, 0)::int AS wishlist_count
      FROM friends f
      LEFT JOIN (SELECT friend_id, COUNT(*) cnt FROM collection_cards GROUP BY friend_id) c ON c.friend_id = f.id
      LEFT JOIN (SELECT friend_id, COUNT(*) cnt FROM wishlist_cards GROUP BY friend_id) w ON w.friend_id = f.id
      ORDER BY f.name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load friends." });
  }
});

app.delete("/api/friends/:id", requireAuth, async (req, res) => {
  if (String(req.user.id) !== String(req.params.id) && !req.user.isAdmin) {
    return res.status(403).json({ error: "You can only remove your own account." });
  }
  try {
    await pool.query("DELETE FROM friends WHERE id = $1", [req.params.id]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove trader." });
  }
});

// --- Cards (collection / wishlist) ---

async function getCards(table, friendId) {
  const { rows } = await pool.query(
    `SELECT id, card_name, match_key, qty FROM ${table} WHERE friend_id = $1 ORDER BY card_name ASC`,
    [friendId]
  );
  return rows;
}

app.get("/api/friends/:id", async (req, res) => {
  try {
    const friend = await pool.query("SELECT id, name FROM friends WHERE id = $1", [req.params.id]);
    if (!friend.rows.length) return res.status(404).json({ error: "Trader not found." });
    const collection = await getCards("collection_cards", req.params.id);
    const wishlist = await getCards("wishlist_cards", req.params.id);
    res.json({ ...friend.rows[0], collection, wishlist });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load trader." });
  }
});

// Replace an entire list (used for CSV import/replace and bulk save from the editor)
async function replaceList(table, friendId, cards) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM ${table} WHERE friend_id = $1`, [friendId]);

    const cleaned = cards
      .map((c) => ({
        cardName: String(c.cardName || "").trim(),
        qty: Number.isFinite(parseInt(c.qty, 10)) && c.qty > 0 ? parseInt(c.qty, 10) : 1,
      }))
      .filter((c) => c.cardName);

    // Insert in one multi-row statement (chunked to stay well under Postgres's
    // parameter limit) instead of one round-trip per card — much faster for
    // large collections, especially over a pooled connection.
    const CHUNK_SIZE = 500;
    for (let i = 0; i < cleaned.length; i += CHUNK_SIZE) {
      const chunk = cleaned.slice(i, i + CHUNK_SIZE);
      const values = [];
      const placeholders = chunk.map((c, idx) => {
        const base = idx * 4;
        values.push(friendId, c.cardName, matchKey(c.cardName), c.qty);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      });
      await client.query(
        `INSERT INTO ${table} (friend_id, card_name, match_key, qty) VALUES ${placeholders.join(", ")}`,
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

app.put("/api/friends/:id/collection", requireAuth, async (req, res) => {
  if (String(req.user.id) !== String(req.params.id) && !req.user.isAdmin) {
    return res.status(403).json({ error: "You can only edit your own collection." });
  }
  try {
    await replaceList("collection_cards", req.params.id, req.body.cards || []);
    res.json(await getCards("collection_cards", req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save collection." });
  }
});

app.put("/api/friends/:id/wishlist", requireAuth, async (req, res) => {
  if (String(req.user.id) !== String(req.params.id) && !req.user.isAdmin) {
    return res.status(403).json({ error: "You can only edit your own wishlist." });
  }
  try {
    await replaceList("wishlist_cards", req.params.id, req.body.cards || []);
    res.json(await getCards("wishlist_cards", req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save wishlist." });
  }
});

// --- Matches ---

app.get("/api/matches", async (req, res) => {
  try {
    const [friendsRes, collRes, wishRes] = await Promise.all([
      pool.query("SELECT id, name FROM friends"),
      pool.query("SELECT friend_id, card_name, match_key, qty FROM collection_cards"),
      pool.query("SELECT friend_id, card_name, match_key, qty FROM wishlist_cards"),
    ]);

    const friendsData = {};
    for (const f of friendsRes.rows) {
      friendsData[f.id] = { name: f.name, collection: [], wishlist: [] };
    }
    for (const row of collRes.rows) {
      if (friendsData[row.friend_id]) friendsData[row.friend_id].collection.push(row);
    }
    for (const row of wishRes.rows) {
      if (friendsData[row.friend_id]) friendsData[row.friend_id].wishlist.push(row);
    }

    res.json(computeMatches(friendsData));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not compute matches." });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`MTG trade API listening on http://localhost:${PORT}`);
});
