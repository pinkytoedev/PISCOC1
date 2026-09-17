/**
 * Validated environment configuration.
 *
 * Most of what the server needs from `process.env` is read and checked here, at
 * import time, so that a missing or malformed variable fails the boot rather
 * than surfacing as a confusing runtime error later. Importing this module has
 * side effects: it loads `.env`, and it throws if validation fails.
 *
 * It is not the only reader. Three call sites still go to `process.env`
 * directly, and their variables are absent from the config object below:
 * `RAILWAY_GIT_COMMIT_SHA` and `SESSION_SECRET` in `routes/system.ts`, and
 * `AIRTABLE_API_KEY` in `integrations/airtable/routes.ts`.
 */

import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';

/** Collects every problem so a misconfigured deploy reports all of them at once. */
const problems: string[] = [];

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    problems.push(`${name} is required`);
    return '';
  }
  return value;
}

/**
 * Secrets that are safe to default in development but must be explicit in
 * production — a predictable session secret lets anyone forge an admin cookie.
 */
function requiredInProduction(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) {
    problems.push(`${name} is required in production`);
    return '';
  }
  return devFallback;
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    problems.push(`${name} must be an integer (got "${raw}")`);
    return fallback;
  }
  return parsed;
}

export const env = {
  isProduction,
  isDevelopment: !isProduction,

  databaseUrl: required('DATABASE_URL'),
  sessionSecret: requiredInProduction('SESSION_SECRET', 'dev-only-insecure-session-secret'),

  port: process.env.PORT ? integer('PORT', 3000) : undefined,
  baseUrl: process.env.BASE_URL,
  publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN,
  productionWebhookUrl: process.env.PRODUCTION_WEBHOOK_URL,

  /**
   * Trusted TLS certificate authority for the database connection. Managed
   * Postgres providers that use a private CA expose it here.
   *
   * Without it, the production pool still connects over TLS but sets
   * `rejectUnauthorized: false` — it accepts any certificate. See `db.ts`.
   */
  databaseCa: process.env.DATABASE_CA_CERT,

  scheduler: {
    intervalMs: integer('SCHEDULER_INTERVAL_MS', 60_000),
  },

  uploads: {
    /** Per-file ceiling for images, in bytes. */
    maxImageBytes: integer('UPLOAD_MAX_IMAGE_BYTES', 10 * 1024 * 1024),
    /** Per-file ceiling for ZIP archives, in bytes. */
    maxZipBytes: integer('UPLOAD_MAX_ZIP_BYTES', 50 * 1024 * 1024),
    /** Total bytes a ZIP may expand to — the zip-bomb guard. */
    maxZipExpandedBytes: integer('UPLOAD_MAX_ZIP_EXPANDED_BYTES', 200 * 1024 * 1024),
    /** Maximum entries in a ZIP archive. */
    maxZipEntries: integer('UPLOAD_MAX_ZIP_ENTRIES', 500),
    /** Maximum images uploaded to ImgBB from a single archive. */
    maxZipImages: integer('UPLOAD_MAX_ZIP_IMAGES', 60),
  },

  /** Lifetime of a contributor upload link, in days. */
  uploadTokenTtlDays: integer('UPLOAD_TOKEN_TTL_DAYS', 14),

  /**
   * Shared secret for inbound webhooks. When set, callers must present it in
   * `x-webhook-secret`. Unset leaves the endpoint open, which is only tolerable
   * in development — `/api/webhooks/article-published` triggers a full Airtable
   * sync, so an open endpoint is a free way to burn the API quota.
   */
  webhookSecret: process.env.WEBHOOK_SECRET,

  /**
   * ImgBB API key, used to host images before linking them into Airtable.
   *
   * Optional, so it is read rather than required — the server boots without it
   * and the image upload routes fail instead. This is the only source: the key
   * is not readable from `integration_settings`, and `routes/integrationSettings`
   * refuses to store it. Read once at boot, so rotating it needs a restart.
   */
  imgbbApiKey: process.env.IMGBB_API_KEY,

  /**
   * Registers the Airtable diagnostic routes.
   *
   * They write to real Airtable records to prove the integration can write at
   * all, which is genuinely useful when a deployment is misconfigured — and
   * exactly why they are not mounted by default in production.
   *
   * Read the condition carefully: outside production these routes are ALWAYS
   * on and `ENABLE_DIAGNOSTIC_ROUTES=false` does not turn them off. In
   * production they are off unless the value is the literal string 'true'.
   * So pointing a development server at a production Airtable base will write
   * to it.
   */
  enableDiagnosticRoutes:
    process.env.ENABLE_DIAGNOSTIC_ROUTES === 'true' || process.env.NODE_ENV !== 'production',
} as const;

if (problems.length > 0) {
  throw new Error(
    `Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
  );
}

if (!isProduction && !process.env.SESSION_SECRET) {
  console.warn('[env] SESSION_SECRET is unset; using an insecure development default.');
}
