# PISCOC

The content management system behind Pinkytoe. It holds articles, the team
roster and carousel quotes, keeps them in step with Airtable, publishes articles
on a schedule, and takes content submissions from people who do not have an
account.

**Express + React + Postgres.** One server process serves both the API and the
dashboard.

- **Using the app?** → [`docs/guide.md`](docs/guide.md), or `/docs` in a running
  instance.
- **Calling the API?** → [`docs/api.md`](docs/api.md), or `/docs?tab=api`.
- **Setting it up?** → you are in the right place.

## Quick start

Requires **Node 20.19+ or 22.12+** (Vite 7 refuses to build on older) and a
Postgres 16+ database.

```bash
git clone <repo-url> && cd PISCOC1
npm install
cp .env.example .env          # then set DATABASE_URL
```

Create the schema. Apply the migrations **in order, once** — `0000` is
Drizzle-generated and has no `IF NOT EXISTS`, so it fails if re-run:

```bash
createdb piscoc
for f in migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

Create a login and start:

```bash
npm run seed:dev              # creates admin / password123
npm run dev
```

The dashboard is on <http://localhost:3000>.

> `npm run db:push` is listed in `package.json` but **does not work** — the
> pinned `drizzle-kit` (0.18.1) has no `push` command for Postgres. Use the
> migration loop above.

## Configuration

Only two variables are read at boot, and the server validates them before doing
anything else — a bad value is a startup failure listing every problem at once,
not a surprise later.

| Variable | Required | Effect |
|---|---|---|
| `DATABASE_URL` | **always** | Postgres connection string. The server will not start without it. |
| `SESSION_SECRET` | **in production** | Signs session cookies. In development it falls back to a known insecure value and warns. |

Everything else is optional:

| Variable | Default | If unset |
|---|---|---|
| `PORT` | — | Set: bound authoritatively, failure is fatal. Unset in dev: tries 3000, 3002, 3003, 3004, 5000, 5001, 5002 (3001 is reserved for the HTTPS listener). |
| `BASE_URL` / `RAILWAY_PUBLIC_DOMAIN` | — | Used to build contributor upload links. **Unset in production means every link points at localhost.** |
| `PRODUCTION_WEBHOOK_URL` | — | Where to tell the live site to drop its cache. Unset, it falls back to this server; with no public domain either, refreshes are skipped and logged. |
| `WEBHOOK_SECRET` | — | Leaves `/api/webhooks/article-published` **open** — a free full-Airtable-sync trigger. Set it in production. |
| `DATABASE_CA_CERT` | — | Supply when your provider terminates TLS with a private CA. |
| `ENABLE_DIAGNOSTIC_ROUTES` | on outside production | Mounts Airtable routes that **write to real records**. |
| `SCHEDULER_INTERVAL_MS` | 60000 | Auto-publish check frequency. |
| `UPLOAD_MAX_IMAGE_BYTES` | 10 MB | Per-image ceiling. |
| `UPLOAD_MAX_ZIP_BYTES` | 50 MB | Per-archive ceiling. |
| `UPLOAD_MAX_ZIP_EXPANDED_BYTES` | 200 MB | Zip-bomb guard. |
| `UPLOAD_MAX_ZIP_ENTRIES` | 500 | Files per archive. |
| `UPLOAD_MAX_ZIP_IMAGES` | 60 | Images per archive. |
| `UPLOAD_TOKEN_TTL_DAYS` | 14 | Contributor link lifetime. |
| `IMGBB_API_KEY` | — | Image uploads answer 400. This is the **only** source for the key — see below. |

**ImgBB's key is environment-only.** `IMGBB_API_KEY` is read once at boot and is
the sole source. It used to also be editable in the CMS and stored in
`integration_settings`, where the stored copy took precedence — so a key saved
once and later rotated kept overriding the deployment's own variable, and
uploads failed with nothing to show why. That page and those endpoints are gone;
set the variable on the host (Railway, `.env` locally) and restart.

An install that used the old page still has the key sitting in
`integration_settings` as plaintext. Nothing reads it, but it should not be
there:

```bash
npm run cleanup:imgbb             # list the leftover rows (masked)
npm run cleanup:imgbb -- --confirm # delete them
```

Dry run by default, safe to re-run, and it touches nothing but the `imgbb` rows.
It cleans whatever `DATABASE_URL` points at, so read the Railway section below
before running it with `--confirm`.

**Airtable credentials are not environment variables.** They live in the
`integration_settings` table and are entered through the admin UI at
`/integrations/airtable`. The app boots fine with no integrations configured; it
simply cannot sync until they are.

> Pointing a development server at your production Airtable base will mutate it —
> the diagnostic routes are on by default outside production and write real
> records.

### Railway

The deployment's variables live in Railway, and that is where they should stay.
Use the CLI to inject them into local commands rather than copying secrets into
your own `.env` — a key that is never written to disk cannot be committed, and
there is one copy to rotate instead of one per laptop.

Turning it on, once per machine:

```bash
brew install railway          # or: bash <(curl -fsSL railway.com/install.sh)
railway login
railway link                  # choose workspace → project → service
railway status                # confirm what you just linked
```

Then prefix commands with `railway run`:

```bash
railway run npm run dev
railway variables             # what the linked environment provides
railway variables --kv        # same, as KEY=value
```

`railway variables` is also how you confirm `IMGBB_API_KEY` is set, and
`railway variables --set "IMGBB_API_KEY=..."` is how you rotate it. Redeploy or
restart afterwards: the value is read once at boot.

**`railway run` gives you production config.** `railway status` prints the linked
environment, and a fresh `railway link` lands on `production`. This project's
`DATABASE_URL` is the public proxy rather than an internal address, so it is
reachable from a laptop — `railway run npm run dev` runs your local server
against **the live database**, with the scheduler auto-publishing real articles
and the Airtable diagnostic routes on (`npm run dev` sets
`NODE_ENV=development`, which is exactly what enables them). `railway run npm run
cleanup:imgbb -- --confirm` deletes from production.

So: **check `railway status` before any command that writes.** If you want the
Railway workflow for day-to-day development, give development its own
environment first:

```bash
railway environment new development
railway environment development                         # link it
railway variables --set "DATABASE_URL=<a dev database>" # and any other overrides
```

`railway environment production` switches back when you need to inspect the
deploy. Reading — `railway status`, `railway variables`, `railway logs` — is safe
against production; running the app or a cleanup script is not.

## Scripts

```
npm run dev              development server
npm run build            client bundle + server bundle into dist/
npm start                production server
npm run check            TypeScript
npm run seed:dev         create the admin / password123 login
npm run test:setup       check the environment looks workable
```

Verification — these exist because the properties they check are easy to break
silently:

```
npm run verify:guards    asserts the unauthenticated route surface matches its allowlist
npm run verify:uploads   upload validation; no server or database needed
npm run routes           every route with its guard
npx tsx scripts/generate-api-docs.mjs --check    docs/api.md matches the router
```

`npm run verify:security` and `npm run verify:routes` need a server on port
**3999** specifically, and `verify:routes` additionally hardcodes a local
database URL — they are developer tools, not general-purpose checks.

`npm run dev:https` is currently identical to `npm run dev`. The HTTPS listener
on port 3001 starts automatically in development whenever certificates exist;
generate them with `npm run setup:https`. It is entirely optional.

## Layout

```
client/src/
  pages/           one file per route, incl. integrations/ and docs-page
  components/      articles/ dashboard/ modals/ layout/ ui/
  hooks/           data fetching and mutations
  lib/             query client, route guards, markdown renderer
server/
  routes/          thin Express routers, one per resource — wiring only
  services/        domain logic: articles, reupload, uploadTokens, siteRefresh,
                   settings, activity, images/
  integrations/    airtable/, imgbb, contributorUpload, directUpload,
                   teamPublicUpload, airtableTest
  middleware/      auth, csrf, rateLimit, upload, webhookAuth, staticMiddleware
  lib/             env, logger, httpError, sanitizeHtml, redact, airtableClient
  utils/           zipProcessor, airtableHelpers, apiCache, fileUpload, ...
  scheduler.ts     the auto-publisher
  storage.ts       every database query
shared/schema.ts   Drizzle tables + Zod schemas, used by both sides
docs/              guide.md and api.md - rendered at /docs and on GitHub
migrations/        plain SQL, applied in order
```

Layering runs one way: routes → services → lib. Routes parse and respond;
services decide; lib has no domain knowledge.

## Security

The unauthenticated surface is **7 endpoints**, and `npm run verify:guards`
fails if it grows without being documented in the allowlist.

- Session cookies are `HttpOnly`, `Secure` and `SameSite=None` in production,
  which is what makes CSRF tokens load-bearing: every state-changing request
  must echo the readable `csrf_token` cookie in an `x-csrf-token` header. Three
  paths are exempt because their callers have no cookie — see `docs/api.md`.
- Contributor links are 256-bit secrets stored only as SHA-256 hashes, scoped to
  one article and one set of asset types, and expiring.
- Uploads are verified from their leading bytes, not their filename. SVG is
  refused. HTML is sanitized before storage. ZIP expansion is bounded before
  anything is written to disk.
- Anything that fetches a remote image is SSRF-hardened: every resolved address
  must be public, and redirects are re-validated at each hop.
- Integration credentials are masked on the way out; the full value is never
  returned once stored.
- Request logging records method, path, status and duration only. Response
  bodies are never serialized — they used to carry password hashes and API keys
  into the platform logs.

## Deployment

Railway, via nixpacks. `railway.toml` builds with `npm install && npm run build`,
starts with `npm start`, and health-checks `/api/health` — which reports booleans
only, never values.

`railway run npm run dev` injects the deployed environment, including `PORT`, so
the app binds that port rather than falling back to 3000.

`npm run build` emits two bundles: `dist/index.js` (the normal server) and
`dist/app.js`, a serverless export. **The serverless entry deliberately does not
start the scheduler**, so a deployment using it has no auto-publishing.

The scheduler holds no distributed lock — running more than one instance would
publish twice. Rate limits are per-process for the same reason.
