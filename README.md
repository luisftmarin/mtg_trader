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

## 2. Run the migrations

Paste the contents of `server/migrations/001_init.sql`, then
`002_add_auth.sql`, `003_add_admin.sql`, then `004_card_meta.sql`, into:
- Supabase: the SQL Editor tab, click Run (once per file, in order).
- Neon: their SQL console, or `psql "<your connection string>" -f server/migrations/001_init.sql`
  (repeat for each file, in order)

This creates the core tables, adds password login, adds an admin flag, then
adds the Scryfall card cache (images, types, EUR prices), a per-card
language column, and the profile columns the redesign uses.

## 3. Set up the server

```
cd server
npm install
cp .env.example .env
```

Edit `.env`:
- Paste your connection string into `DATABASE_URL`.
- Set `JWT_SECRET` to a long random string — you can generate one with:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- Optionally set `ADMIN_SIGNUP_CODE` to a secret phrase — anyone who enters
  it while registering becomes an admin. Leave it blank to disable admin
  signup entirely (you can still promote someone via SQL — see
  `migrations/003_add_admin.sql`).

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

## Nightly price refresh

Card prices come from Scryfall's Cardmarket data (`prices.eur`), which
updates once a day. Rather than hit Scryfall on every page load, the
server keeps a `scryfall_cards` cache and refreshes it on a schedule:

```
cd server && npm run refresh-prices
```

On Railway, add a second service pointed at the same repo with the start
command `node src/jobs/refreshPrices.js` and a cron schedule of `0 4 * * *`
(the Variables tab needs `DATABASE_URL`, nothing else). Locally, a crontab
line does the same job:

```
0 4 * * * cd /path/to/mtg_trader/server && npm run refresh-prices
```

The cache also fills itself whenever someone saves a collection or
wishlist, so a freshly added card previews immediately.

## Design handoff

`handoff/` holds the Binder Exchange v2 design: the hi-fi spec
(`handoff/README.md`), the schema/API notes (`handoff/IMPLEMENTATION_NOTES.md`)
and the clickable prototype (`handoff/design/Binder Exchange.dc.html` — open
it in a browser, it needs `support.js` beside it and internet for Scryfall).
It is the source of truth for colours, copy, sizes and timings.

## Notes

- Accounts now use real passwords (hashed with bcrypt, never stored in
  plain text) and a signed login token, instead of the earlier
  "just pick a name" system.
- Everyone can view the shared roster and calculate matches. Regular
  traders can only edit their own collection and wishlist. Admins can
  edit and delete any trader's data.
- To create an admin: set `ADMIN_SIGNUP_CODE` on the server, then have
  that person register with "Have an admin code?" on the sign-up form
  and enter it. To promote someone already registered, run the SQL in
  `migrations/003_add_admin.sql` directly against your database instead.
- No email system is set up, so password recovery works two ways instead
  of an email reset link: anyone signed in can change their own password
  from the key icon in the header (enter current + new password), and
  admins can reset any trader's password directly from that trader's
  editor screen — useful if someone genuinely forgets and can't sign in.
- On Railway, don't forget to add `JWT_SECRET` (and `ADMIN_SIGNUP_CODE`
  if you're using it) alongside `DATABASE_URL` and `ALLOWED_ORIGINS` in
  the service's Variables tab.
- Any traders created under the old name-only system (before passwords
  existed) already have that name taken, so they can't register fresh
  under it. They should instead use "Existing trader without a password?
  Claim this name" on the sign-in screen, entering their exact existing
  name and a new password — this sets a password on their existing
  account without losing their saved collection/wishlist. An admin can
  also do this for them via "Reset password" in their editor screen if
  they'd rather not do it themselves.
