/**
 * Route registration.
 *
 * This file is wiring only — mount order and nothing else. Handlers, their
 * validation and their side effects live in the individual routers and in
 * `services/`.
 *
 * Mount order matters in two ways:
 *  - authentication is installed before anything that depends on a session
 *  - literal paths precede parameterised ones, both across routers (see the
 *    note on `/api/articles/uploadable` below) and within them
 */

import type { Express } from 'express';
import { createServer, type Server } from 'http';

import { env } from '../lib/env';
import { createLogger } from '../lib/logger';

import { setupAuth } from '../auth';
import { setupAirtableRoutes } from '../integrations/airtable';
import { setupImgBBRoutes } from '../integrations/imgbb';
import { setupDirectUploadRoutes } from '../integrations/directUpload';
import { setupContributorUploadRoutes } from '../integrations/contributorUpload';
import { setupPublicArticleUploadRoutes } from '../integrations/publicArticleUpload';
import { setupTeamPublicUploadRoutes } from '../integrations/teamPublicUpload';
import { registerAirtableTestRoutes } from '../integrations/airtableTest';

import { articlesRouter } from './articles';
import { teamMembersRouter } from './teamMembers';
import { carouselQuotesRouter } from './carouselQuotes';
import { adminRequestsRouter } from './adminRequests';
import { imageAssetsRouter } from './imageAssets';
import { integrationSettingsRouter } from './integrationSettings';
import { publicSystemRouter, systemRouter } from './system';

const log = createLogger('routes');

export async function registerRoutes(app: Express): Promise<Server> {
  // `/api/health` answers before authentication is wired, so a container probe
  // still succeeds if the session store is degraded. This router holds only
  // that one route; the `/api/public/*` surfaces are mounted after setupAuth.
  app.use(publicSystemRouter());

  setupAuth(app);

  // Upload surfaces. Contributor links authenticate themselves via the token in
  // the URL; the others carry their own guards.
  //
  // setupPublicArticleUploadRoutes must come before the articles router below:
  // it registers the literal `/api/articles/uploadable`, and the router's
  // `/:id` handler would otherwise match "uploadable" and reject it as a
  // malformed id.
  setupDirectUploadRoutes(app);
  setupContributorUploadRoutes(app);
  setupPublicArticleUploadRoutes(app);
  setupTeamPublicUploadRoutes(app);

  // Resource APIs.
  app.use('/api/articles', articlesRouter());
  app.use('/api/team-members', teamMembersRouter());
  app.use('/api/carousel-quotes', carouselQuotesRouter());
  app.use('/api/admin-requests', adminRequestsRouter());
  app.use('/api/image-assets', imageAssetsRouter());
  app.use('/api/integration-settings', integrationSettingsRouter());
  app.use('/api', systemRouter());

  // Third-party integrations register their own route trees.
  setupAirtableRoutes(app);
  setupImgBBRoutes(app);

  // Diagnostics write to real Airtable records, so they are not mounted in
  // production unless explicitly enabled.
  if (env.enableDiagnosticRoutes) {
    registerAirtableTestRoutes(app);
  } else {
    log.info('Diagnostic routes disabled (set ENABLE_DIAGNOSTIC_ROUTES=true to mount them)');
  }

  return createServer(app);
}
