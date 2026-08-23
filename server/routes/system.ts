/**
 * System endpoints: health, metrics, integration status, activity log, and the
 * two small public routes (the Facebook OAuth callback and the app id).
 */

import { Router } from 'express';
import { storage } from '../storage';
import { asyncHandler } from '../lib/httpError';
import { isAuthenticated } from '../middleware/auth';
import { getMigrationProgress } from '../utils/migrationProgress';
import { getAllApiStatuses } from '../api-status';
import { env } from '../lib/env';

/** Prevents a proxy or browser from serving a stale snapshot of live status. */
function noStore(res: Parameters<Parameters<Router['get']>[1]>[1]) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

/**
 * Routes that must stay reachable without a session: the platform health probe
 * and the OAuth callback.
 */
export function publicSystemRouter(): Router {
  const router = Router();

  router.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: env.isProduction ? 'production' : 'development',
      // Booleans only — never echo the values themselves.
      database: Boolean(env.databaseUrl),
      sessionSecret: Boolean(process.env.SESSION_SECRET),
    });
  });

  // Facebook redirects here after login; the SDK completes the token exchange
  // client-side, so this only needs to bounce the user back into the app.
  router.get('/auth/facebook/callback', (_req, res) => {
    res.redirect('/?auth=success');
  });

  // The app id is public by design — it ships in the client bundle either way.
  router.get('/api/config/facebook', (_req, res) => {
    const appId = process.env.FACEBOOK_APP_ID;

    if (!appId) {
      return res.status(503).json({
        status: 'error',
        message: 'Facebook integration is not configured',
        code: 'FB_APP_ID_MISSING',
      });
    }

    res.json({ status: 'success', appId });
  });

  return router;
}

/**
 * Operational endpoints for signed-in users.
 *
 * The guard is attached per route rather than with `router.use`. This router is
 * mounted at `/api`, and a router-level middleware would run for every request
 * that passes through that prefix on its way to a later handler — including
 * `/api/instagram/webhooks/callback`, which Meta calls with no session and must
 * stay reachable.
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
