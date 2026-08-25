# GitHub Actions in this repo

Three workflows. **None of them deploy.** Railway already auto-deploys from GitHub on
push, so a deploy step here would deploy twice. Actions' job is to be a correctness gate
before merge, and to verify and announce the deploy afterwards.

| Workflow | File | Runs on | Needs secrets? |
| --- | --- | --- | --- |
| CI | `ci.yml` | Every PR to `main`, every push to `main`, manual | No |
| Post-deploy verification | `post-deploy.yml` | Railway `deployment_status` = success on a production environment, manual | One, optional |
| Dependency audit | `audit.yml` | Mondays 06:17 UTC, manual | No |

All three read `.nvmrc` for the Node version. `nixpacks` reads the same file, so Railway
and CI stay pinned together. Vite 7.3 requires Node `>= 22.12`, so do not lower it.

---

## Source changes these workflows depend on

Five edits outside `.github/` are load-bearing. If any is reverted, the symptom is listed
next to it, because none of them fail in an obvious place.

| File | Change | Symptom if reverted |
| --- | --- | --- |
| `scripts/verify-route-guards.mjs` | Exits 1 on stale allowlist entries too, not just unexpected public routes | Half of the *Verify route guards* gate goes quiet: a stale allowlist stops describing the real public surface, and a genuinely new public route can hide behind an entry left over from a route that was guarded or deleted |
| `.nvmrc` | Pins `22` | `setup-node`'s `node-version-file` cannot resolve and every job fails at setup. Also read by nixpacks, so deleting it lets CI and Railway drift onto different majors |
| `scripts/verify-routes.mjs` | Reads `DATABASE_URL` and `VERIFY_BASE_URL` instead of the hardcoded `postgresql://jawednur@localhost:5432/piscoc_verify` and `http://localhost:3999` | `e2e` fails 100% of runs at *Verify authenticated route surface*, on an unhandled top-level rejection (`ECONNREFUSED`, or `database "piscoc_verify" does not exist`) that names nothing in the workflow |
| `scripts/verify-security.mjs` | Reads `VERIFY_BASE_URL` for its base URL | Retargeting the job's port silently breaks: the wait step polls the new port and passes, then the script crashes on an unhandled fetch rejection against 3999 |
| `server/routes/system.ts` | `/api/health` returns `commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null` | `post-deploy.yml` cannot tell the new build from the old one and fails with an explicit `::error::` pointing here |

---

## `ci.yml` — the correctness gate

Two jobs. `e2e` runs only if `static` passed, so a type error does not burn three minutes
of Postgres time.

### Job `static` — typecheck, build, static verifiers

No services, no secrets, so it works on fork PRs.

| Step | Gate? | Note |
| --- | --- | --- |
| `npm ci` | Hard | `package-lock.json` is in sync; `better-sqlite3` compiles and `sharp` uses a prebuilt binary on `ubuntu-latest`. |
| `npm run check` | Hard | `tsc` with `noEmit: true`. Exits 2 on a type error. |
| `npm run build` | Hard | `vite build && node build.config.js`, ~3 s. Needs zero env. |
| `npm run verify:guards` | Hard | Fails when a route is accidentally added to the unauthenticated surface. |
| `npm run verify:uploads` | Hard | Magic-byte / forged-mimetype checks, AVIF transcoding. |
| `npm run routes` | **No — informational** | `scripts/list-routes.mjs` ends in an unconditional `process.exit(0)` and asserts nothing. It is dumped into the job summary as a report. `verify:guards` is the real assertion. |

The job sets a placeholder `DATABASE_URL`. `server/lib/env.ts` validates at *import* time
and throws `DATABASE_URL is required`, and both verify scripts import server code — but
neither opens a connection, because `pg.Pool` is lazy. A syntactically valid string is
enough; nothing listens on that address.

### Job `e2e` — end-to-end security regression

Stands up a throwaway `postgres:16` service container, applies `migrations/*.sql`, builds,
boots `dist/index.js` on port 3999 **in development mode**, waits for `/api/health`, then
runs `verify:security` and `verify:routes`.

Still no secrets: `verify:security` seeds its own admin account, and its second-asset
check deliberately asserts only that the upload was **not** AUTH-rejected, so a missing
ImgBB key cannot fail it. Fork PRs get service containers, so this runs there too.

Two deliberate choices worth knowing:

- **Migrations are applied with `psql -v ON_ERROR_STOP=1`, not `npm run db:push`.**
  `db:push` is dead in this repo — `drizzle-kit` is pinned at 0.18.1, whose CLI has no
  `push` command at all (`error: unknown command 'push'`), and `drizzle.config.ts` is not
  in the 0.18 config shape either. The old workflow's `db:push` step never did anything.
- **The database is a throwaway container.** `verify:security` seeds an admin named
  `verifier` with a fixed known password and writes a fake Airtable key. Never point
  `DATABASE_URL` at a shared or personal database when running it.

The server log is printed inline inside a `::group::`. It is never uploaded as an
artifact — artifacts are downloadable by anyone with repo read access and survive the run.

#### Why the e2e server is **not** started with `npm start`

`npm start` is `NODE_ENV=production node dist/index.js`, and production mode breaks this
job in two independent ways. Both were reproduced against a real Postgres before the
workflow was written, so please do not "restore parity" here without reading this:

1. **TLS.** `server/db.ts` sets `ssl: { rejectUnauthorized: true }` whenever
   `env.isProduction`, with no escape hatch (`DATABASE_CA_CERT` only supplies a CA). The
   `postgres:16` image ships `ssl = off`, so every query throws
   `The server does not support SSL connections`. Adding `?sslmode=disable` does **not**
   help — `pg.Pool`'s explicit `ssl` option overrides the connection string. The failure is
   nastily quiet: `/api/health` returns 200 because it never touches the pool, so the wait
   step passes and the first symptom is a 500 on `POST /api/login`.
2. **Session cookies.** `server/auth.ts` sets `cookie.secure = env.isProduction`, and
   `express-session` silently skips `Set-Cookie` when a secure cookie would travel over a
   plain-HTTP connection (`index.js:235`, `issecure()` falls through to `req.secure`). Both
   verify scripts drive a hand-rolled cookie jar, so they would hold no session and every
   authenticated assertion would 401.

Fixing only the first leaves the second. Real parity would need a TLS-enabled Postgres
image plus `DATABASE_CA_CERT` **and** a terminating proxy in front of the server — far more
machinery than the signal is worth. The `static` job already proves the production bundle
builds; `e2e` is about behaviour, and `scripts/verify-security.mjs` was written against
`npm run dev`. The job still runs the built `dist/index.js`, so the artifact under test is
the real one.

One consequence worth knowing: development mode sets `enableDiagnosticRoutes` to true, so
the Airtable diagnostic routes are mounted in `e2e` but not in production. `verify:guards`
in the `static` job is what pins the production route surface.

---

## `post-deploy.yml` — verify the live deploy, then notify the website

**Trigger: `deployment_status`.** Railway's GitHub integration already publishes
Deployments and statuses into this repo, authored by `railway-app[bot]`. That is a real
"Railway finished" signal — no timed guess, no Railway API token. It is also stronger than
it looks: `railway.toml` sets `healthcheckPath = "/api/health"`, so Railway does not mark a
deploy successful until the new container answered that endpoint.

The job filters to `state == 'success'` and an environment name containing `production`.
Railway's environment strings are inconsistent across deployments (`Production`,
`production`, `PISCOC1 (PinkyToe Ground Zero / production)`); all production variants
contain that substring and `Preview` does not.

It then polls the public `/api/health` for ~7 minutes (20 attempts, 10 s apart; the job's
`timeout-minutes: 15` deliberately exceeds that so the loop always reaches its own error
message rather than being cancelled mid-flight) and asserts:

- `status == "ok"`
- `environment == "production"`
- `commit == <the deployed sha>`

It deliberately does **not** assert on `database` or `sessionSecret`. Both are
`Boolean(<env var is set>)`, and both of those env vars are hard boot requirements, so any
process alive enough to answer returns `true` — including one whose database is completely
unreachable. Railway's own healthcheck has the same blind spot.

The `commit` assertion is the entire point: it is the only field that distinguishes the new
build from the one it replaced, so without it a green run means only "something answered" —
and if Railway's edge is still routing to the old container when the workflow starts, that
"something" is the *previous* deploy. `server/routes/system.ts` therefore returns
`commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null`, and a missing or mismatched commit
makes the loop **keep polling** rather than pass; if the window expires the step fails.

**If `RAILWAY_GIT_COMMIT_SHA` turns out not to be injected for this service,** set the repo
variable `POST_DEPLOY_REQUIRE_COMMIT` to `false`. The run then degrades to an
availability-only check, emits a `::warning::`, and reports
`health: "unverified-no-commit-field"` in the dispatch payload — it will not claim
verification it did not perform. Treat that as temporary: in that mode the check can pass
against the old build.

Finally it sends a `repository_dispatch` (`event_type: piscoc1-deployed`) to
`pinkytoedev/PinkyToeWebsite` so the public site can invalidate its article cache.

**The dispatch is a no-op today.** `repository_dispatch` only triggers workflows that exist
on the *target repo's default branch*, and `pinkytoedev/PinkyToeWebsite` currently has no
`.github/workflows` directory on `main` at all. GitHub accepts the POST and returns 204;
nothing runs. The receiving half is written and waiting in
`../workflows-for-website-repo/cms-deployed.yml` — until someone merges it there, this is
plumbing that is verified but not yet connected.

If the dispatch itself fails (expired PAT, revoked scope), the step logs a `::warning::` and
the job still succeeds. A credential rotation should not turn `main` red when both the
deploy and the smoke test passed.

No secret goes in the `client_payload`. It is readable by every workflow run in the target
repo and by anyone with read access to its logs. `WEBHOOK_SECRET` in particular is an
*inbound* bearer credential for this service — whoever holds the string can trigger an
unauthenticated, unrate-limited full Airtable sync. `siteRefresh.ts` already refuses to
send it to any external target for exactly that reason, and this workflow honors the same
rule.

**Known limitation:** `deployment_status` workflows only run from the file as it exists on
the default branch. This workflow does nothing until it is merged to `main`, and it cannot
be tested from a feature branch. `workflow_dispatch` is wired up so it can be run by hand.
Confirm on the first post-merge push that a run actually appears; if Railway posts the
`success` status late or not at all, the run is silently skipped (a false negative, never a
false green), and the fallback is to switch the trigger to `push: branches: [main]` and
keep the same polling body, which already tolerates a cold start.

---

## `audit.yml` — dependency hygiene, on a schedule

Deliberately **not** a PR gate. `npm audit --audit-level=high` exits 1 today with 13 high
advisories, one of which (`extract-zip`, imported for real by
`server/utils/zipProcessor.ts`) is marked **"No fix available"**. That gate can never be
made green by upgrading, and a permanently-red check on every unrelated PR trains everyone
to ignore the X.

So: the `high` report is `continue-on-error` and lands in the job summary, and the one hard
gate is `npm audit --omit=dev --audit-level=critical`, which is green today (0 critical)
and fires only on genuinely severe news. Because the workflow is schedule-only, a failure
blocks nothing.

---

## Secrets and variables you must create

Set both at **Settings → Secrets and variables → Actions** on `pinkytoedev/PISCOC1`.

### `WEBSITE_DISPATCH_TOKEN` — a *secret*

Used by the final step of `post-deploy.yml` to send the `repository_dispatch`.

The built-in `GITHUB_TOKEN` **cannot** be used: it is scoped to this repository only and
has no permissions on `pinkytoedev/PinkyToeWebsite`.

Create it at **github.com → Settings → Developer settings → Personal access tokens →
Fine-grained tokens**:

- Resource owner: `pinkytoedev`
- Repository access: **Only select repositories** → `PinkyToeWebsite`
- Repository permissions: **Contents: Read and write** — this is the permission
  `repository_dispatch` maps to. Nothing else is needed.
- Set an expiry and put a calendar reminder on it; a silently expired token turns the
  dispatch into a skipped step.

A classic PAT with the `repo` scope also works, but grants far more than this needs.

**If it is missing:** the workflow checks for it, skips the dispatch step, logs a
`::warning::` and a job-summary line, and the job **still succeeds**. A missing optional
integration secret should not make `main` look broken, and the smoke test — the actually
meaningful signal — has already passed by that point. The site simply falls back to its own
timed cache refresh, which is 30–60 minutes for recent articles.

### `PISCOC1_PUBLIC_URL` — a *variable*, not a secret

The base URL the post-deploy smoke test hits. Use the "Variables" tab, not "Secrets" — a
public hostname is not a credential, and putting it in a secret would make it unreadable in
logs for no benefit.

Value: `https://www.piscoc.pinkytoepaper.com` (the repo's `homepage` field, confirmed to
serve `/api/health`). Get it from the Railway service's public domain if it ever changes.

**If it is missing:** the workflow falls back to that exact literal, so it works either
way. Create it so a domain change is a one-field edit instead of a code change.

### `POST_DEPLOY_REQUIRE_COMMIT` — a *variable*, optional

Defaults to `true` when unset, which is the intended state: the smoke test insists on
matching `/api/health`'s `commit` against the deployed sha. Set it to `false` only if
Railway turns out not to inject `RAILWAY_GIT_COMMIT_SHA` into this service — that downgrades
the run to an availability check that can pass against the previous build, so it is a
stopgap, not a setting to leave on.

### Nothing else

`ci.yml` and `audit.yml` require **zero** secrets. That is what makes `ci.yml` safe and
useful on fork PRs. No Airtable, ImgBB, webhook, or Railway credential appears in any
workflow here.

**Blocker to be aware of:** this repo currently has 0 Actions secrets and 0 Actions
variables, and creating either requires **admin** on the repository. The `jawednur`
account has push but not admin, so an org owner has to create
`WEBSITE_DISPATCH_TOKEN`. Every workflow here is designed to be merged and useful before
that happens.

---

## Suggested follow-ups (not configurable from a workflow file)

- **Branch protection.** If `ci.yml` is made a required status check on `main`, the
  required contexts are `CI / static` and `CI / e2e` — the job **ids**. Neither job
  declares a `name:`, deliberately: a `name:` replaces the job id in the check context, so
  adding one (or rewording an existing one) silently invalidates the strings configured in
  branch protection. GitHub accepts an unmatched context without complaint and every PR
  then sits forever at "Expected — Waiting for status to be reported", unmergeable, with no
  failing check to point at. Keep the jobs nameless.
- **Dependabot.** A `.github/dependabot.yml` (npm + github-actions, weekly) would be
  strictly better than `npm outdated` in a job summary, at the cost of PR traffic. Not
  added pending a decision.
