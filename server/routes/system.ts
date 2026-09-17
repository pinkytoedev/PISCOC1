/**
 * System endpoints: health, metrics, integration status and the activity log.
 */

import { Router } from 'express';
import { storage } from '../storage';
import { asyncHandler } from '../lib/httpError';
import { isAuthenticated } from '../middleware/auth';
import { getMigrationProgress } from '../utils/migrationProgress';
import { getAllApiStatuses } from '../api-status';
import { env } from '../lib/env';
import { pgPool } from '../db';

/** Prevents a proxy or browser from serving a stale snapshot of live status. */
function noStore(res: Parameters<Parameters<Router['get']>[1]>[1]) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

/** How long the health probe waits for the database before calling it unreachable. */
const DB_PROBE_TIMEOUT_MS = 3_000;

/**
 * Runs the cheapest possible query to prove the pool can actually serve one.
 *
 * Bounded by its own timer as well as the pool's connectionTimeoutMillis: that
 * setting covers acquiring a connection, but a server that accepts the socket
 * and then stops responding would leave the query outstanding and hang the
 * probe — which Railway would eventually score as a failed healthcheck anyway,
 * just far more slowly and with nothing in the log explaining why.
 */
async function probeDatabase(): Promise<boolean> {
  try {
    await Promise.race([
      pgPool.query('select 1'),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${DB_PROBE_TIMEOUT_MS}ms`)),
          DB_PROBE_TIMEOUT_MS).unref(),
      ),
    ]);
    return true;
  } catch (error) {
    // Logged rather than returned: this route is public and unauthenticated, so
    // the response says only whether the database answered. The 503 is the
    // signal; this line is where an operator finds out why.
    console.error(
      `[health] database probe failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/** The platform health probe is the only route that must answer without a session. */
export function publicSystemRouter(): Router {
  const router = Router();

  /**
   * Reports 503 when the database is unreachable, which makes railway.toml's
   * healthcheckPath refuse to mark such a container healthy.
   *
   * It used to report `database: Boolean(env.databaseUrl)` — true whenever the
   * variable was merely *set*. That is how the deploy of e592859 went green
   * while `rejectUnauthorized: true` was rejecting Railway's self-signed
   * certificate on every single query: the container answered 200, Railway
   * marked the rollout healthy, the post-deploy smoke test passed, and login
   * had been down the entire time. A probe that cannot fail is not a probe.
   */
  router.get('/api/health', async (_req, res) => {
    const database = await probeDatabase();

    res.status(database ? 200 : 503).json({
      status: database ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: env.isProduction ? 'production' : 'development',
      /**
       * The commit this container was built from.
       *
       * This is the only field that distinguishes a new deployment from the one
       * it replaced — the others stay identical against the previous build — so
       * the post-deploy smoke test in .github/workflows/post-deploy.yml asserts
       * on it to prove the rollout actually landed. Railway injects
       * RAILWAY_GIT_COMMIT_SHA automatically for GitHub-connected services;
       * null elsewhere (local, tests).
       */
      commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
      // Booleans only — never echo the values themselves.
      database,
      sessionSecret: Boolean(process.env.SESSION_SECRET),
    });
  });

  return router;
}

/**
 * `n` months before `from`, clamped to the target month's length.
 *
 * `d.setMonth(d.getMonth() - 1)` alone is wrong on long days: 31 March minus a
 * month is 31 February, which Date rolls forward to 3 March. Setting the day to
 * 1 before shifting the month, then clamping, keeps the result inside the month
 * that was actually asked for.
 */
function monthsBefore(from: Date, months: number): Date {
  const target = new Date(from);
  target.setDate(1);
  target.setMonth(target.getMonth() - months);

  const lastDayOfTargetMonth = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();

  target.setDate(Math.min(from.getDate(), lastDayOfTargetMonth));
  return target;
}

/**
 * Growth of a count over a period, as a whole-percent string.
 *
 * With no prior baseline there is no meaningful percentage — everything is new,
 * and dividing by zero would render as `Infinity%` — so that case reports 100%
 * when anything exists at all and 0% for an empty library.
 */
function formatGrowth(added: number, baseline: number): string {
  if (baseline <= 0) return added > 0 ? '100%' : '0%';
  return `${Math.round((added / baseline) * 100)}%`;
}

/**
 * Operational endpoints for signed-in users.
 *
 * The guard is attached per route rather than with `router.use`. This router is
 * mounted at `/api`, so a router-level middleware would run for every request
 * that merely passes through that prefix on its way to a later handler — which
 * is how the public upload endpoints under `/api/public/` would end up behind a
 * session they are not meant to require.
 */
export function systemRouter(): Router {
  const router = Router();

  router.get(
    '/activity-logs',
    isAuthenticated,
    asyncHandler(async (_req, res) => {
      res.json(await storage.getActivityLogs());
    }),
  );

  router.get(
    '/metrics',
    isAuthenticated,
    asyncHandler(async (_req, res) => {
      const [allArticles, draftArticles] = await Promise.all([
        storage.getArticles(),
        storage.getArticlesByStatus('draft'),
      ]);

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const startOfLastMonth = monthsBefore(startOfToday, 1);

      const publishedToday = allArticles.filter(
        (article) => article.publishedAt && new Date(article.publishedAt) >= startOfToday,
      ).length;

      // Articles first recorded here within the trailing month, today included —
      // the window has to reach `now`, not `startOfToday`, or an article created
      // this morning is in neither this bucket nor the prior total.
      const createdLastMonth = allArticles.filter((article) => {
        if (!article.createdAt) return false;
        return new Date(article.createdAt) >= startOfLastMonth;
      }).length;

      const totalBeforeLastMonth = allArticles.length - createdLastMonth;

      res.json({
        totalArticles: allArticles.length,
        draftArticles: draftArticles.length,
        publishedToday,
        /**
         * How much the library grew over the trailing month, as a percentage of
         * what it held a month ago. The dashboard renders this beside the Total
         * Articles count.
         *
         * Caveat worth knowing before trusting it: `createdAt` is set by
         * `storage.createArticle`, so for anything pulled from Airtable it is
         * the time this CMS first saw the record, not the time it was authored.
         * A bulk re-sync therefore reads as a spike in growth.
         *
         * Non-negative by construction: the count only ever gains rows, so the
         * dashboard's arrow is always "up". It is a growth figure, not a
         * change-versus-last-month figure.
         */
        articleGrowth: formatGrowth(createdLastMonth, totalBeforeLastMonth),
        migration: getMigrationProgress(),
      });
    }),
  );

  router.get('/migration-progress', isAuthenticated, (_req, res) => {
    noStore(res);
    res.json(getMigrationProgress());
  });

  // Reports which integrations are reachable and configured. Authenticated:
  // the probe results name third-party services and their configuration state,
  // which is a reconnaissance map rather than something to publish.
  router.get(
    '/status',
    isAuthenticated,
    asyncHandler(async (_req, res) => {
      noStore(res);
      res.json(await getAllApiStatuses());
    }),
  );

  router.get(
    '/integration-status',
    isAuthenticated,
    asyncHandler(async (_req, res) => {
      const { statuses } = await getAllApiStatuses();

      res.json(
        statuses.map((status) => ({
          name: status.name.toLowerCase(),
          // `unknown` is the probe's way of saying "no credentials at all", so
          // it is the one status that means *not* configured. It used to be
          // counted as configured, which showed a green tick on the Keys page
          // for an integration that had never been set up. `offline` still
          // counts as configured: the credentials exist, the service just did
          // not answer — which is why `reachable` is reported separately. A
          // revoked token is configured but not reachable, and collapsing those
          // two into one flag makes it indistinguishable from a healthy one.
          configured: status.status !== 'unknown',
          reachable: status.status === 'online',
          lastChecked: status.lastChecked.toISOString(),
          error: status.message,
        })),
      );
    }),
  );

  return router;
}
