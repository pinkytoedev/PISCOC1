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

      const startOfLastMonth = new Date(startOfToday);
      startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);

      const publishedToday = allArticles.filter(
        (article) => article.publishedAt && new Date(article.publishedAt) >= startOfToday,
      ).length;

      const createdLastMonth = allArticles.filter((article) => {
        if (!article.createdAt) return false;
        const created = new Date(article.createdAt);
        return created >= startOfLastMonth && created < startOfToday;
      }).length;

      res.json({
        totalArticles: allArticles.length,
        draftArticles: draftArticles.length,
        publishedToday,
        // Today's output measured against the trailing month. A rough
        // indicator for the dashboard tile, not an analytics figure.
        articleGrowth: `${createdLastMonth > 0 ? Math.round((publishedToday / createdLastMonth) * 100) : 0}%`,
        migration: getMigrationProgress(),
      });
    }),
  );

  router.get('/migration-progress', isAuthenticated, (_req, res) => {
    noStore(res);
    res.json(getMigrationProgress());
  });

  // Reports which integrations are reachable and configured — useful to an
  // operator, and a free reconnaissance map to anyone else.
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
          configured: status.status === 'online' || status.status === 'unknown',
          lastChecked: status.lastChecked.toISOString(),
          error: status.message,
        })),
      );
    }),
  );

  return router;
}
