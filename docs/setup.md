# Setup

How to run Binder Exchange on your machine, or host a copy for your own
playgroup. For what the app *is*, see the [README](../README.md).

## 1. Postgres

Create a free database on [Supabase](https://supabase.com) or
[Neon](https://neon.tech) and copy the connection string
(`postgresql://…?sslmode=require`). On Supabase, use the **Session pooler**
URI and put your database password in place of `[YOUR-PASSWORD]`.

## 2. Migrations

Run the files in `server/migrations/` **in order** (001 through 008) in the
SQL editor or with `psql -f`. That creates traders, binders, the Scryfall
cache, trades, comments, notifications, and profile settings (`display_name`,
notification toggles). `007` (match cache) is optional and not
required for the live matcher.

## 3. API

```
cd server
npm install
cp .env.example .env
```

In `.env`:

- `DATABASE_URL` — the connection string
- `JWT_SECRET` — a long random string, e.g.
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `ADMIN_SIGNUP_CODE` — optional. Anyone who enters it at register becomes
  an admin. Leave blank to disable that path (you can still promote someone
  with the SQL in `003_add_admin.sql`).

```
npm run dev
```

`http://localhost:3001/api/health` should return `{"ok":true}`.

## 4. Client

```
cd client
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). Vite proxies
`/api` to the Express server.

Register a name, then open an incognito window and register a second
trader. Import or type a few cards, then open **Trades** for matches.

Traders created before passwords existed can use **Forgot password** on
the sign-in screen to claim their name. Signed-in users change their own
password from Profile; admins can reset someone else’s from that trader’s
screen.

## Deploy

Deploy the API first so the client has a URL.

1. Push this repo to GitHub.
2. Host `server/` (Railway, Render, etc.). Set `DATABASE_URL`, `JWT_SECRET`,
   `ALLOWED_ORIGINS` (your frontend origin), and optionally
   `ADMIN_SIGNUP_CODE`.
3. Host `client/` (Vercel, Netlify, etc.). Set `VITE_API_URL` to the API
   origin (`https://…`, no trailing slash).
4. Confirm `ALLOWED_ORIGINS` matches the frontend URL, then redeploy the
   API if you had a placeholder.

Cardmarket EUR prices live in `scryfall_cards` and refresh with
`cd server && npm run refresh-prices`. On Railway, a second service with
start command `node src/jobs/refreshPrices.js` and cron `0 4 * * *` does
the same (`DATABASE_URL` only). The cache also fills when someone saves a
binder.
