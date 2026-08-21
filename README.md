# MTG Group Trade Ledger — Full Stack

React frontend + Node/Express API + Postgres, so the whole group shares
one live trade board instead of data living in a single browser.

```
mtg-trade-fullstack/
  server/   Express API + Postgres access
  client/   React frontend (Vite)
```

## 1. Create a free Postgres database

Pick one:

- **Supabase** (supabase.com) — new project → click the **Connect** button
  near the top of the dashboard → copy the **Session pooler** connection
  string → replace `[YOUR-PASSWORD]` in it with your actual database
  password.
- **Neon** (neon.tech) — new project → Dashboard → Connection Details.
  Copy the connection string.

Either way you'll get something like:
```
postgresql://user:password@host:5432/dbname?sslmode=require
```

## 2. Run the migration

Paste the contents of `server/migrations/001_init.sql` into:
- Supabase: the SQL Editor tab, click Run.
- Neon: their SQL console, or `psql "<your connection string>" -f server/migrations/001_init.sql`

This creates the `friends`, `collection_cards`, and `wishlist_cards` tables.

## 3. Set up the server

```
cd server
npm install
cp .env.example .env
```

Edit `.env` and paste your connection string into `DATABASE_URL`.

```
npm run dev
```

You should see `MTG trade API listening on http://localhost:3001`.
Visit `http://localhost:3001/api/health` — it should return `{"ok":true}`.

## 4. Set up the client

In a second terminal:

```
cd client
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). The dev server
proxies `/api` requests to your local Express server automatically.

## 5. Try it

- You'll land on a "Who's trading?" screen — type a name and hit Join.
- Open the same URL in another browser (or incognito window) and join
  as a second person — you'll both see the same shared roster.
- Click any trader's row to open the editor: upload a CSV, or add/edit
  cards manually.
- Once at least two traders have data, hit "Calculate group matches."

## Deploying so friends can access it over the internet

- **Frontend:** `cd client && npm run build`, then deploy the `dist/`
  folder to Vercel or Netlify (drag-and-drop or connect a GitHub repo).
  Set the environment variable `VITE_API_URL` to your deployed backend's
  URL before building.
- **Backend:** deploy the `server/` folder to Railway, Render, or Fly.io
  (all have free tiers). Set `DATABASE_URL` and `ALLOWED_ORIGINS`
  (your frontend's deployed URL) as environment variables there.
- Your Supabase/Neon database is already internet-accessible, so no
  extra step is needed for it.

## Notes

- "Logging in" is just picking a name — there's no password, matching
  what you asked for. Anyone with the app's URL can join and see the
  shared roster.
- Anyone can edit anyone's collection/wishlist right now (same as the
  original single-operator tool, just shared over the network). If you
  want to restrict editing to only your own lists later, that's a
  small change to the API routes — just ask.
