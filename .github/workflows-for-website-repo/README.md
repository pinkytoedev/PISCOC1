# Workflows for the sibling repo — NOT active here

This directory is **not** `.github/workflows/`, so GitHub Actions ignores everything in
it. Nothing here runs in PISCOC1.

It holds one file that belongs in a **different repository**:

| File | Destination |
| --- | --- |
| `cms-deployed.yml` | `pinkytoedev/PinkyToeWebsite` → `.github/workflows/cms-deployed.yml` |

## What it is for

`.github/workflows/post-deploy.yml` in this repo sends a `repository_dispatch` with
`event_type: piscoc1-deployed` to `pinkytoedev/PinkyToeWebsite` after Railway finishes
deploying `main` and the live `/api/health` smoke test passes.

`cms-deployed.yml` is the receiving half. It waits for the public site to answer, checks
that the Express layer and webhook router are mounted, and forces a full cache refresh.

**Until someone installs it in the sibling repo, the dispatch is inert.** That is
harmless, not an error — GitHub returns `204` whether or not any workflow is listening,
so PISCOC1's post-deploy run still passes.

## How to install it

You need push access to `pinkytoedev/PinkyToeWebsite`. **Do not** let any automation push
to that repo on your behalf.

1. Clone or open `pinkytoedev/PinkyToeWebsite`.
2. Copy `cms-deployed.yml` to `.github/workflows/cms-deployed.yml` there.
3. Open a PR against that repo's **default branch** and merge it.

Step 3 is not a style preference: `repository_dispatch` only ever triggers workflows from
the file as it exists on the default branch. A copy sitting on a feature branch will never
fire.

Note that as of this writing the sibling repo has **no `.github` directory on `main` at
all**. A `ci.yml` and a `dependabot.yml` exist only on the open PR branch
`chore/code-review-refactor` (PR #16). If that PR merges first, add this file alongside
them rather than on top of them.

## Secrets it wants in the sibling repo

| Name | Required? | Effect if missing |
| --- | --- | --- |
| `ADMIN_TOKEN` | Optional **today**, required after PR #16 | The refresh call is sent without an `Authorization` header and a `::warning::` is logged. That works only while `POST /api/cache/refresh` is unauthenticated, which it is on `main` today. PR #16 adds `server/middleware/auth.ts`, which applies `requireAdmin` to that route: unset in production returns **503**, wrong value returns **401**. |
| `SITE_PUBLIC_URL` (a *variable*, not a secret) | Optional | Falls back to the literal `https://www.pinkytoepaper.com`. Create it so a domain change is a one-field edit. |

That repo currently has **0 Actions secrets and 0 Actions variables**, and creating either
requires **admin** on the repo. An org owner has to do it.

## Things to know before relying on this

- **`client_payload` is untrusted input; the workflow treats it that way.** A
  `repository_dispatch` body can be sent by anyone holding a `contents: write` token on the
  sibling repo — including PISCOC1's `WEBSITE_DISPATCH_TOKEN` if it ever leaks. GitHub
  expands `${{ }}` into a `run:` script *before* bash parses it, so interpolating
  `${{ github.event.client_payload.sha }}` directly into a `run:` block is remote code
  execution on that runner, next to its `GITHUB_TOKEN` and `ADMIN_TOKEN`. The `Context`
  step therefore passes all three payload fields through a step-level `env:` block (values
  arriving via the environment are never re-parsed as shell source) and pattern-checks each
  one before printing it. Keep it that way if you edit the file. Note that `actionlint`'s
  untrusted-input check does **not** cover `client_payload`, so a clean lint proves nothing
  here.
- **Do not put it on a schedule.** An empty-body `POST /api/cache/refresh` runs
  `invalidateAllCaches()` then `refreshAll()` — a full fan-out of Airtable table scans
  against a 5 req/s limit. Once per CMS deploy is fine.
- **Do not route per-article invalidation through it.** PISCOC1's runtime
  `server/services/siteRefresh.ts` already POSTs the site directly on every
  publish / unpublish / re-upload. A `repository_dispatch` is justified only for the
  deploy-shaped event, where the whole CMS shipped a new version.
- **Multi-replica caveat.** The site caches to the container's local filesystem
  (`cache/*.json` plus `cache/locks/*.lock`). A single POST invalidates only whichever
  replica answers it. If the service ever scales past one instance, this refresh is
  partial.
- **The runtime refresh contract between the two repos is broken or unauthenticated,
  with no third option, and this workflow does not fix it.** PISCOC1 sends the secret as
  an `x-webhook-secret` **header**, and only to itself (`siteRefresh.ts` sets
  `target.isSelf` to false whenever `PRODUCTION_WEBHOOK_URL` is set). The site reads it
  from the request **body** (`req.body.webhookSecret`), and PISCOC1's outbound body is
  `{articleId, status, reason, source}` with no such field. So it works today only
  because the site's `WEBHOOK_SECRET` is presumably unset and the endpoint fails open. If
  anyone sets it, every refresh silently 401s — and `notifyArticleChanged` swallows the
  error, so the editor sees success. After PR #16 it becomes 503 (unset, in production)
  or 401 (set). This is a runtime bug worth fixing separately.
