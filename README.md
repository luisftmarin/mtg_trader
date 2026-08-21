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

Order matters here: deploy the backend first so you have its URL to give
the frontend.

1. **Push your project to GitHub.** Railway, Render, Vercel, and Netlify
   all deploy from a Git repo. From the project root:
   `git init`, `git add .`, `git commit -m "initial commit"`, then follow
   GitHub's instructions to create a repo and push. The whole
   `mtg-trade-fullstack` folder can live in one repo — both `server` and
   `client` deploy from subfolders of it.

2. **Deploy the backend.** Sign up at railway.app (or render.com — similar
   flow), create a new project, choose "Deploy from GitHub repo," and set
   the **root directory** to `server`.

3. **Set backend environment variables** in the platform's dashboard:
   - `DATABASE_URL` — your Supabase Session pooler string (same as local `.env`)
   - `ALLOWED_ORIGINS` — leave a placeholder for now, you'll update it in step 5

4. **Copy the backend's public URL** once it's deployed (e.g.
   `mtg-trade-server-production.up.railway.app`).

5. **Deploy the frontend to Vercel.** Import the same GitHub repo, set the
   root directory to `client`, and add an environment variable
   `VITE_API_URL` set to your backend's URL from step 4 (include `https://`,
   no trailing slash). Deploy.

6. **Update `ALLOWED_ORIGINS`** on the backend to your new Vercel URL (e.g.
   `mtg-trade-ledger.vercel.app`) and redeploy the backend. This is what
   lets your deployed frontend actually talk to your backend — without it,
   requests get blocked by CORS.

7. **Test it.** Open the Vercel URL, join with a name, confirm the roster
   loads. Share that URL with friends — they can use it from anywhere, and
   it stays running even when your computer is off.

Your Supabase database is already internet-accessible from step 1 of the
main setup, so no extra step is needed for it.

## Notes

- "Logging in" is just picking a name — there's no password, matching
  what you asked for. Anyone with the app's URL can join and see the
  shared roster.
- Anyone can edit anyone's collection/wishlist right now (same as the
  original single-operator tool, just shared over the network). If you
  want to restrict editing to only your own lists later, that's a
  small change to the API routes — just ask.
