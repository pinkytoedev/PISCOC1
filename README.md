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

> This README was rewritten against the code, not against the previous README.
> Where something is broken or only half-wired, it says so rather than
> describing the intent. Claims that could not be verified from the tree have
> been removed.

## Quick start

Requires **Node 22.12+** (`package.json` `engines` says `>=22.12.0`, `.nvmrc`
pins `22`; Vite 7 will not build on older) and a Postgres 16+ database.

```bash
git clone <repo-url> && cd PISCOC1
npm install
cp .env.example .env          # then set DATABASE_URL
```

Create the schema. Apply the migrations **in order, once**:

```bash
for f in migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

Then create a login — see [Creating the first user](#creating-the-first-user),
because no script in this repo does it correctly — and start the server:

```bash
npm run dev
```

The dashboard is on <http://localhost:3000>.

### On Windows

`npm run dev`, `npm run dev:https` and `npm start` go through `cross-env`, so
they work in `cmd.exe` and PowerShell as well as in a POSIX shell. Previously
they used a bare `NODE_ENV=... <command>` prefix and failed on Windows with
`'NODE_ENV' is not recognized`.

Several of the helper scripts are still Unix-only — `test:setup` shells out to
`mkdir -p`/`touch`, `verify:security` needs the `zip` CLI, and `quick-check.sh`
and `push-env-to-railway.sh` are bash. See [Scripts](#scripts).

### Migrations are not fully re-runnable

`0002`, `0003` and `0004` are guarded and safe to replay. `0000` and `0001` are
not: `0000` is Drizzle-generated with bare `CREATE TABLE`s, and `0001` ends in
an unguarded `ALTER TABLE "session" ADD CONSTRAINT "session_pkey"`. Running the
loop above a second time fails on those two.

Drizzle's own state is stale and should not be trusted: `migrations/meta/_journal.json`
registers only `0000`, and the journal was written in a format (`version: 7`,
`dialect: postgresql`) that the pinned drizzle-kit does not produce. The `.sql`
files are the source of truth.

> `npm run db:push` is listed in `package.json` but **does not work**. The
> pinned `drizzle-kit` is `0.18.1`, whose CLI has no `push` command at all —
> its commands are `generate:pg`, `introspect:pg`, `up:pg`, `check:pg`,
> `push:mysql` and `drop`. There is no `push:pg` either. Use the loop above.

### Creating the first user

There is **no working seed script**. `scripts/createAdmin.js` exists but does not
run at all: it declares `fetchAdminCredentialsFromAirtable` twice, and because
`package.json` sets `"type": "module"` the file loads as ESM, where a duplicate
top-level declaration is an early `SyntaxError`. The module never evaluates, so
its `DELETE FROM users` is unreachable — it is inert, not destructive. Behind
that, its `INSERT` is also missing a comma between two argument arrays, so
fixing the duplicate alone would still leave it broken.

Registration is admin-only (`POST /api/register` carries `isAdmin`), so there is
no self-signup to bootstrap from either. Insert a row by hand. Passwords are
Node `scrypt`, 64-byte key, 16-byte hex salt, stored as `hash.salt` — hash
first:

```bash
node -e "
const {scrypt,randomBytes}=require('crypto');
const salt=randomBytes(16).toString('hex');
scrypt(process.argv[1],salt,64,(e,k)=>console.log(k.toString('hex')+'.'+salt));
" 'your-password-here'
```

Then, with that output as `<hash>`:

```sql
INSERT INTO users (username, password, is_admin) VALUES ('admin', '<hash>', true);
```

## Configuration

Two variables are validated at boot, in `server/lib/env.ts`, which throws at
import time listing every problem at once.

| Variable | Required | Effect |
|---|---|---|
| `DATABASE_URL` | **always** | Postgres connection string. The server will not start without it. |
| `SESSION_SECRET` | **in production** | Signs session cookies. In development it falls back to a known insecure value and warns. |

Everything else is optional:

| Variable | Default | If unset |
|---|---|---|
| `PORT` | — | Set: bound authoritatively, failure is fatal. Unset: tries 3000, **3001**, 3002, 3003, 3004, 5000, 5001, 5002 in order. |
| `BASE_URL` / `RAILWAY_PUBLIC_DOMAIN` | — | Used to build contributor upload links. **Unset in production means every link points at localhost.** |
| `PRODUCTION_WEBHOOK_URL` | — | Where to tell the live site to drop its cache. Unset, it falls back to `https://$RAILWAY_PUBLIC_DOMAIN/api/webhooks/article-published`; with no public domain either, refreshes are skipped and logged. |
| `WEBHOOK_SECRET` | — | Leaves `/api/webhooks/article-published` **open** — a free full-Airtable-sync trigger. Set it in production. Note it is only ever *sent* on the self-URL fallback; an external `PRODUCTION_WEBHOOK_URL` never receives it. |
| `DATABASE_CA_CERT` | — | Production connects over TLS but **does not verify the peer certificate**. Supply the CA when the database is reached over the public internet. |
| `ENABLE_DIAGNOSTIC_ROUTES` | on outside production | Mounts Airtable routes that **write to real records**. See the warning below. |
| `SCHEDULER_INTERVAL_MS` | 60000 | Auto-publish check frequency. |
| `UPLOAD_MAX_IMAGE_BYTES` | 10 MB | Per-image ceiling. |
| `UPLOAD_MAX_ZIP_BYTES` | 50 MB | Per-archive ceiling. |
| `UPLOAD_MAX_ZIP_EXPANDED_BYTES` | 200 MB | Zip-bomb guard. |
| `UPLOAD_MAX_ZIP_ENTRIES` | 500 | Files per archive. |
| `UPLOAD_MAX_ZIP_IMAGES` | 60 | Images per archive. |
| `UPLOAD_TOKEN_TTL_DAYS` | 14 | Contributor link lifetime. |
| `IMGBB_API_KEY` | — | Image hosting is disabled, and the three upload families diverge: the `/api/airtable/upload-image/*` routes fall back to writing a real Airtable attachment, the `/api/imgbb/*` routes answer 400, and the contributor, public and direct upload routes answer 500 (`Image hosting is unavailable`). |

Three variables are read straight from `process.env` rather than through
`env.ts`, so they are absent from that file's table: `RAILWAY_GIT_COMMIT_SHA`
and `SESSION_SECRET` in `routes/system.ts`, and `AIRTABLE_API_KEY` in
`integrations/airtable/routes.ts` (used only by `POST /api/airtable/update-api-key`,
which copies it into the database).

**The diagnostic-route flag does not do what its name suggests.** The condition
is `ENABLE_DIAGNOSTIC_ROUTES === 'true' || NODE_ENV !== 'production'`. Outside
production these routes are **always on and cannot be switched off** — setting
the variable to `false` has no effect. They PATCH a scratch `Test` column on
real Airtable records, and one of them
(`POST /api/airtable/migrate-to-link-fields/:articleId`) writes the real
`MainImageLink` / `InstaPhotoLink` columns. So pointing a development server at
your production Airtable base will mutate it.

**ImgBB's key is environment-only.** `IMGBB_API_KEY` is read once at boot and is
the sole source: `integration_settings` refuses the `imgbb` service outright and
nothing reads a key from it. Rotating the key requires a restart. If an older
install left a row behind, it is inert but should not be sitting in the database
as plaintext:

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
simply cannot sync until they are. Note that `articles_table` must be set for
*any* Airtable operation to resolve — a quotes-only or team-only sync still
fails without it.

### Railway

The deployment's variables live in Railway, and that is where they should stay.
Use the CLI to inject them into local commands rather than copying secrets into
your own `.env` — a key that is never written to disk cannot be committed, and
there is one copy to rotate instead of one per laptop.

Turning it on, once per machine:

```bash
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
npm run dev              development server          (POSIX shell only)
npm run build            client bundle + server bundle into dist/
npm start                production server           (POSIX shell only)
npm run check            TypeScript
npm run test:setup       check the environment looks workable  (POSIX only)
```

Verification — these exist because the properties they check are easy to break
silently:

```
npm run verify:guards    asserts the unauthenticated route surface matches its allowlist
npm run verify:uploads   upload validation; no server or database needed
npm run routes           every route with its guard (a report, not a gate)
```

`npm run verify:security` and `npm run verify:routes` need a running server and
a `DATABASE_URL` pointing at **the same database that server is using** — they
seed the admin they then log in as. Both default `VERIFY_BASE_URL` to port
**3999**, which is what CI uses, not what `npm run dev` gives you. Run the
server with `PORT=3999`, or set `VERIFY_BASE_URL` to match. `verify:security`
additionally shells out to the `zip` CLI, so it does not run on stock Windows.

`npx tsx scripts/generate-api-docs.mjs --check` currently **fails**, and not
because the router changed: the generated block in `docs/api.md` has been
hand-edited to add a "Public article uploads" group and a `gated` access level
that the generator cannot emit. Re-running the generator would delete them.
Nothing in CI runs either form of this command.

Not wired to npm and worth knowing about: `scripts/createAdmin.js` (broken, see
above), `scripts/quick-check.sh` and `scripts/push-env-to-railway.sh` — both
bash-only and both stale, the latter pushing `FACEBOOK_*` / `INSTAGRAM_*`
variables that exist nowhere in this codebase.

`npm run dev:https` is **byte-for-byte identical** to `npm run dev`; it is not a
separate mode. The HTTPS listener on port 3001 starts automatically in
development whenever `certs/localhost-key.pem` and `certs/localhost.pem` exist;
generate them with `npm run setup:https` (needs `openssl` on PATH). It is
entirely optional — and note that port 3001 is also in the plain-HTTP fallback
list above, so if `PORT` is unset and 3000 is taken, HTTP takes 3001 and the
HTTPS listener's bind failure crashes the process. Set `PORT` explicitly.

## Layout

```
client/src/
  pages/           one file per route, incl. integrations/ and docs-page
  components/      articles/ dashboard/ modals/ layout/ ui/ (ui/ is vendored shadcn)
  hooks/           data fetching and mutations
  lib/             query client, route guards, markdown renderer
server/
  routes/          thin Express routers, one per resource — wiring only
  services/        domain logic: articles, reupload, uploadTokens, siteRefresh,
                   settings, activity, images/
  integrations/    airtable/, imgbb, contributorUpload, directUpload,
                   publicArticleUpload, teamPublicUpload, airtableTest
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

Dead or unwired code you will otherwise waste time on: `server/utils/apiCache.ts`
has no callers; `server/services/images/fetch.ts` has no callers outside its own
directory; `tokenKeyGenerator` in `middleware/rateLimit.ts` is exported but never
passed to a limiter; `getGitHubToken` in `services/settings.ts` is dead and there
is no GitHub integration; `theme.json` is a Replit leftover nothing reads;
`attached_assets/` is debugging detritus; `cookies.txt` is an empty curl cookie
jar.

## Security

**18 API endpoints answer without a session.** Two numbers circulate here, so be
precise about which one you mean:

- **18** is how many are reachable with no cookie at all.
- **12** is how many carry no credential *of any kind*. That is the figure
  `npm run verify:guards` enforces against its `INTENTIONALLY_PUBLIC` allowlist,
  which deliberately treats a contributor token in the URL and the webhook
  shared secret as guards. CI fails if that set of 12 grows without being
  documented in the allowlist — and also if an allowlist entry goes stale.

The 18 break down as:

- 3 with no credential and no gate: `GET /api/health`,
  `GET /api/public/article-upload-status`, `GET /api/public/team-upload-status`
- 2 credential endpoints: `POST /api/login`, `POST /api/logout`
- 5 authorized by a contributor token in the URL (`/api/public-upload/:token/*`)
- 7 gated by a database switch an admin can flip
- 1 shared-secret webhook (`POST /api/webhooks/article-published`) — which is
  **not** a guard at all when `WEBHOOK_SECRET` is unset

Plus `GET /uploads/*` static and the SPA catch-all.

- Session cookies are `HttpOnly`, `Secure` and `SameSite=None` in production,
  which is what makes CSRF tokens load-bearing: every non-GET/HEAD/OPTIONS
  request must echo the readable `csrf_token` cookie in an `x-csrf-token`
  header. Exempt: the exact path `POST /api/public/team-member-update`, and
  anything under `/api/public-upload/` or `/api/webhooks/`.
- Contributor links are 256-bit secrets stored only as SHA-256 hashes, scoped to
  one article and one set of asset types, and expiring. Note that no caller sets
  `maxUses`, so every issued link is unlimited-use until it expires — and
  deleting an article does **not** revoke its outstanding links.
- The token-free submission pages (`/public-upload`, `/team-upload`) are off by
  default and behind an admin switch. While one is on, anyone with the link can
  submit — so open them for a submission window and close them again. Published
  articles are never listed and are refused if named directly.
- Uploads are verified from their leading bytes, not their filename. SVG is
  refused. HTML is sanitized before storage. ZIP expansion is bounded before
  anything is written to disk.
- Integration credentials are masked on the way out; the full value is never
  returned once stored.
- Request logging records method, path, status and duration only. Response
  bodies are never serialized.

Known gaps, stated plainly because the code reads as though they are covered:

- **The SSRF guard is not wired up.** `services/images/fetch.ts` genuinely does
  resolve every address, reject private ranges and revalidate redirects — but
  nothing calls it. The two routes that accept an image URL hand the raw
  user-supplied URL to ImgBB and let ImgBB fetch it. That avoids SSRF against
  this server, but applies no timeout, size or content-type checking.
- **SVG is refused everywhere except inside a ZIP.** `utils/zipProcessor.ts`
  keeps `.svg` in its own extension list, and images inside an archive get no
  magic-byte check at all — their type is inferred from the extension.
- **The WebP magic-byte check matches the bare `RIFF` header**, not the `WEBP`
  tag at offset 8, so any RIFF file (WAV, AVI) passes as an image.
- **Rate limits key on IP, not token**, despite a helper written to do the
  latter. Contributors behind one NAT share a budget.
- **`insertAdminRequestSchema` omits nothing.** It passes `id`/`createdAt`/
  `updatedAt` as refinements rather than through `.omit()`, so
  `POST /api/admin-requests` accepts a caller-supplied `id`.
- **`/api/admin-requests` is `isAuthenticated`, not `isAdmin`**, despite the name.
- **`GET /api/airtable/debug-schema/:tableId`** lets any signed-in user dump
  records from any table id in the base.

## Deployment

Railway, via nixpacks. `railway.toml` builds with `npm install && npm run build`,
starts with `npm start`, and health-checks `/api/health`. That endpoint probes
the database with `select 1` and answers 503 when it fails. It returns the
commit SHA and the environment name; the credential fields are booleans only.

`nixpacks.toml` pins `nodejs_22` directly — it does not read `.nvmrc`, though
the two agree today.

`npm run build` emits **one** server bundle, `dist/index.js`, plus the client
into `dist/public`. There is no serverless entry: `build.config.js` records that
a second `dist/app.js` was deliberately removed, and `server/app.ts` does not
exist.

The scheduler holds no distributed lock — running more than one instance would
publish twice. Rate limits are per-process for the same reason.

There is also a **second publisher in the browser**: the dashboard runs its own
catch-up loop while a tab is open, with a 2-hour window against the server's 24,
and without the server's check that the article has never been published. The
two do not agree, and the user-facing guide documents the server's rules.
