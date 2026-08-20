/**
 * Route registration.
 *
 * This file is wiring only — mount order and nothing else. It replaced a
 * 1,249-line module in which 45 handlers, their validation, their Airtable and
 * Instagram side effects and their activity logging were interleaved.
 *
 * Mount order matters in two ways:
 *  - authentication is installed before anything that depends on a session
 *  - within a resource, literal paths precede parameterised ones (each router
 *    handles that internally)
 */

import type { Express } from 'express';
import { createServer, type Server } from 'http';

import { setupAuth } from '../auth';
import { setupArticleReceiveEndpoint } from '../integrations/articleReceive';
import { setupAirtableRoutes } from '../integrations/airtable';
import { setupInstagramRoutes } from '../integrations/instagramRoutes';
import { setupImgBBRoutes } from '../integrations/imgbb';
import { setupDirectUploadRoutes } from '../integrations/directUpload';
import { setupContributorUploadRoutes } from '../integrations/contributorUpload';
import { setupTeamPublicUploadRoutes } from '../integrations/teamPublicUpload';
import { registerAirtableTestRoutes } from '../integrations/airtableTest';

import { articlesRouter } from './articles';
import { teamMembersRouter } from './teamMembers';
import { carouselQuotesRouter } from './carouselQuotes';
import { adminRequestsRouter } from './adminRequests';
import { imageAssetsRouter } from './imageAssets';
import { integrationSettingsRouter } from './integrationSettings';
import { publicSystemRouter, systemRouter } from './system';

export async function registerRoutes(app: Express): Promise<Server> {
  // Health and the public pages answer before authentication is wired, so a
  // probe still succeeds if the session store is degraded.
  app.use(publicSystemRouter());

  setupAuth(app);

  // Upload surfaces. Contributor links authenticate themselves via the token in
  // the URL; the others carry their own guards.
  setupDirectUploadRoutes(app);
  setupContributorUploadRoutes(app);
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
  setupArticleReceiveEndpoint(app);
  setupAirtableRoutes(app);
  setupInstagramRoutes(app);
  setupImgBBRoutes(app);
  registerAirtableTestRoutes(app);

  return createServer(app);
}
