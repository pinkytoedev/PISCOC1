# API Documentation

Generated against the running server's router stack. To regenerate the route
inventory:

```bash
npm run routes          # every route with its auth guard
npm run verify:guards   # asserts the public surface matches the allowlist
```

## Conventions

### Authentication

Session cookie, established by `POST /api/login`. Four levels of access appear
in this document:

| Guard | Meaning |
|---|---|
| **public** | No credentials. The complete list is in `scripts/verify-route-guards.mjs`, each with a reason. |
| **auth** | Any signed-in user. |
| **admin** | Signed-in user with `isAdmin`. Everything that reads or writes integration credentials. |
| **token** | A contributor upload link. The secret in the URL is the whole credential; no session involved. |
| **webhook** | Shared secret in `x-webhook-secret`, set via `WEBHOOK_SECRET`. |

### CSRF

Session cookies are issued with `SameSite=None` in production so the CMS can be
embedded cross-origin, which means the browser attaches them to cross-site
requests. **Every state-changing request therefore needs a CSRF token.**

The server sets a readable `csrf_token` cookie; echo it back in the
`x-csrf-token` header on any `POST`, `PUT`, `PATCH` or `DELETE`:

```js
fetch('/api/articles/1', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
  credentials: 'include',
  body: JSON.stringify({ title: 'New title' }),
});
```

The client helpers `apiRequest()` and `apiUpload()` in
`client/src/lib/queryClient.ts` do this for you. A request without the header
gets `403 Missing CSRF token`.

Exempt: contributor upload routes (authorized by their token) and inbound
webhooks (authorized by signature or shared secret).

### Errors

Every error is JSON:

```json
{ "message": "Article not found" }
```

Validation failures add the offending fields:

```json
{
  "message": "Validation error",
  "errors": [{ "path": "title", "message": "Required" }]
}
```

| Status | Meaning |
|---|---|
| 400 | Malformed input, failed validation, unusable upload |
| 401 | Not signed in, or an invalid/expired upload link |
| 403 | Signed in but not permitted; missing or bad CSRF token |
| 404 | No such record, or no such endpoint |
| 409 | Conflicts with current state (duplicate username, session already open) |
| 413 | File exceeds the configured limit |
| 429 | Rate limited |
| 500 | Server fault. Details are logged, never returned. |

An unknown path under `/api` returns `404 {"message":"Unknown API endpoint"}`
rather than the SPA's HTML.

---

## Contributor uploads

The way someone outside the CMS submits content. No account, no password.

An editor generates a link; the contributor opens it and uploads. The link is a
random 256-bit secret, stored only as a SHA-256 hash, scoped to one article and
an explicit set of asset types, and usable for the whole submission until it
expires (14 days by default, `UPLOAD_TOKEN_TTL_DAYS`).

```
POST /api/upload-links                          (auth)   -> { token, url, expiresAt, uploadTypes }
GET  /api/upload-links/:articleId               (auth)   -> link metadata, never the secret
DELETE /api/upload-links/:id                    (auth)   revoke

GET  /api/public-upload/:token                  (token)  what this link allows
POST /api/public-upload/:token/image            (token)  multipart, field "file"
POST /api/public-upload/:token/instagram-image  (token)  multipart, field "file"
POST /api/public-upload/:token/html-zip         (token)  multipart, field "file"
POST /api/public-upload/:token/complete         (token)  finish a re-upload session
```

The secret is returned exactly once, at creation. `GET /api/upload-links/:articleId`
lists metadata only.

### Uploaded files

Images: JPEG, PNG, GIF, WebP, HEIC/HEIF, AVIF. 10 MB default. HEIC and AVIF are
transcoded to JPEG, since neither the image host nor every browser handles them.

Archives: ZIP containing HTML plus its images. 50 MB default, expanding to at
most 200 MB across at most 500 entries and 60 images. Images are re-hosted and
the HTML rewritten to point at them.

**All HTML is sanitized before storage.** Scripts, iframes, event handlers and
`javascript:` URLs are removed. The response reports `sanitized: true` when
anything was stripped.

Every upload's real format is verified from its leading bytes, not its declared
content type or extension.

---

## Re-upload sessions

Replacing the content of an article that is already live, without serving a
half-updated version.

```
POST /api/articles/:id/reupload           (auth)  open a session, returns an upload link
POST /api/articles/:id/reupload/complete  (auth)  republish
POST /api/articles/:id/reupload/cancel    (auth)  restore the previous state
POST /api/public-upload/:token/complete   (token) contributor finishes their own session
```

Opening a session returns the article to draft, sets `isReuploading`, tells the
live site to drop it, and issues one link covering every asset type. The
auto-publisher skips articles in this state.

Assets can then be replaced in any order and any number of times. **Nothing is
published until the session is completed explicitly** — completion republishes,
syncs Airtable and refreshes the site cache.

---

## Endpoints

### System

| | Endpoint | Access |
|---|---|---|
| GET | `/api/health` | public |
| GET | `/api/metrics` | auth |
| GET | `/api/status` | auth |
| GET | `/api/integration-status` | auth |
| GET | `/api/migration-progress` | auth |
| GET | `/api/activity-logs` | auth |

### Authentication and users

| | Endpoint | Access |
|---|---|---|
| POST | `/api/login` | public |
| POST | `/api/logout` | public |
| GET | `/api/user` | auth |
| GET | `/api/users` | admin |
| POST | `/api/register` | admin |
| PUT | `/api/users/:id` | admin |
| DELETE | `/api/users/:id` | admin |

User objects never include the password hash. `POST /api/login` is rate limited
to 10 failed attempts per 15 minutes per IP.

### Articles

| | Endpoint | Access |
|---|---|---|
| GET | `/api/articles` | auth |
| GET | `/api/articles/featured` | auth |
| GET | `/api/articles/status/:status` | auth |
| GET | `/api/articles/:id` | auth |
| POST | `/api/articles` | auth |
| PUT | `/api/articles/:id` | auth |
| DELETE | `/api/articles/:id` | auth |
| POST | `/api/articles/:id/assets/:assetType` | auth |

`:assetType` is `image`, `instagram-image` or `html-zip` — the authenticated
equivalent of the contributor upload routes, for editors working in the
dashboard.

Publishing an article (via `PUT`, the scheduler, or completing a re-upload)
pushes to Airtable and refreshes the live site.

### Team members, quotes, requests, assets

| | Endpoint | Access |
|---|---|---|
| GET/POST | `/api/team-members` | auth |
| GET/PUT/DELETE | `/api/team-members/:id` | auth |
| POST | `/api/team-members/upload-image` | auth |
| GET/POST | `/api/carousel-quotes` | auth |
| GET/PUT/DELETE | `/api/carousel-quotes/:id` | auth |
| GET | `/api/carousel-quotes/by-carousel/:carousel` | auth |
| GET/POST | `/api/admin-requests` | auth |
| GET/PATCH/DELETE | `/api/admin-requests/:id` | auth |
| GET/POST | `/api/image-assets` | auth |
| GET/DELETE | `/api/image-assets/:id` | auth |

`GET /api/admin-requests` accepts one of `?status=`, `?category=` or `?urgency=`.

### Integration settings

| | Endpoint | Access |
|---|---|---|
| GET | `/api/integration-settings/:service` | admin |
| GET | `/api/integration-settings/:service/:key` | admin |
| POST | `/api/integration-settings` | admin |
| PUT | `/api/integration-settings/:id` | admin |
| DELETE | `/api/integration-settings/:id` | admin |

**Secret values are always redacted**, returned as `••••1234` alongside
`configured: true` and `redacted: true`. Never write a masked value back.

### Public team profile updates

Gated at runtime by the `team_upload_enabled` setting; all four return 403 when
it is off.

| | Endpoint | Access |
|---|---|---|
| GET | `/api/public/team-upload-status` | public |
| GET | `/api/public/team-roles` | public |
| GET | `/api/public/team-members-list` | public |
| POST | `/api/public/team-member-update` | public |
| POST | `/api/public/team-upload-status` | admin (toggles the gate) |

### Airtable, ImgBB, GitHub

Integration endpoints under `/api/airtable/*`, `/api/imgbb/*` and
`/api/github/*`. All require authentication; anything touching credentials
requires admin. Run `npm run routes` for the current list.

One is not session-authenticated:

- `POST /api/webhooks/article-published` — triggers a full Airtable sync.
  Requires `x-webhook-secret` when `WEBHOOK_SECRET` is set. **Set it in
  production**, or anyone can force repeated syncs and exhaust the Airtable
  quota.

### Diagnostics

`/api/airtable/direct-test`, `/api/airtable/test-link/:articleId` and friends
write to real Airtable records to verify the integration can write at all. They
are admin-only, and **not mounted in production** unless
`ENABLE_DIAGNOSTIC_ROUTES=true`.

---

## Rate limits

| Scope | Limit |
|---|---|
| `POST /api/login` | 10 failed attempts / 15 min |
| Contributor uploads | 40 / 15 min, keyed by token where present |
| Upload link metadata | 120 / 15 min |
| Public reads | 300 / 15 min |

Counters are per-instance. Running more than one replica needs a shared store
(`rate-limit-redis`); the limiter definitions in
`server/middleware/rateLimit.ts` are the only place that would change.
