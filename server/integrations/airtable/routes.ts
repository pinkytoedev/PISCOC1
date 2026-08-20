/**
 * HTTP surface for the Airtable integration.
 *
 * Handlers stay thin: validate, delegate, respond. Everything that talks to
 * Airtable lives in `sync`, `push`, `images` and `client`, so a route change
 * cannot quietly alter sync semantics.
 */

import type { Express, Request } from 'express';
import { storage } from '../../storage';
import { asyncHandler, HttpError, parseId } from '../../lib/httpError';
import { createLogger } from '../../lib/logger';
import { redactIntegrationSetting } from '../../lib/redact';
import { isAdmin, isAuthenticated } from '../../middleware/auth';
import { verifyWebhookSecret } from '../../middleware/webhookAuth';
import { getSettingValues, putSetting } from '../../services/settings';
import { recordActivity } from '../../services/activity';
import { upload } from '../../utils/fileUpload';
import { configFor, listRecords, requireConfig } from './client';
import {
  parseImageField,
  requireAirtableArticle,
  uploadArticleImageFile,
  uploadArticleImageUrl,
} from './images';
import {
  pushArticleToAirtable,
  pushCarouselQuotesToAirtable,
  pushTeamMembersToAirtable,
  updateArticleInAirtable,
  updateCarouselQuoteInAirtable,
} from './push';
import {
  syncArticlesFromAirtable,
  syncCarouselQuotesFromAirtable,
  syncTeamMembersFromAirtable,
} from './sync';

const log = createLogger('airtable:routes');

function actorId(req: Request): number | undefined {
  return req.user?.id;
}

/**
 * Maps an Airtable transport failure onto the status the operator needs to see.
 *
 * The API reports permission problems, missing records and schema mismatches
 * all as thrown errors carrying the HTTP status in their message; without this
 * they would surface uniformly as 500 and look like our bug.
 */
function translateAirtableError(error: unknown): never {
  if (!(error instanceof Error) || error instanceof HttpError) {
    throw error;
  }

  const message = error.message;
  if (message.includes('INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND')) {
    throw HttpError.forbidden(
      'Invalid permissions or model not found in Airtable. Please check your API key permissions and that the table name is correct.',
    );
  }
  if (message.includes('403')) {
    throw HttpError.forbidden(
      'Authentication failed with Airtable. Please check your API key and permissions.',
    );
  }
  if (message.includes('404')) {
    throw HttpError.notFound(
      'Record not found in Airtable. The record may have been deleted or the table structure changed.',
    );
  }
  if (message.includes('422')) {
    throw new HttpError(422, 'Invalid data format for Airtable. Please check the field mappings.');
  }
  throw error;
}

export function setupAirtableRoutes(app: Express) {
  // Reports the shape of an arbitrary table, which is how field-name mismatches
  // behind 422s get diagnosed.
  app.get(
    '/api/airtable/debug-schema/:tableId',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const { api_key: apiKey, base_id: baseId } = await getSettingValues('airtable', [
        'api_key',
        'base_id',
      ]);
      if (!apiKey || !baseId) {
        throw HttpError.badRequest('Airtable API key or base ID not configured');
      }

      const { tableId } = req.params;
      const response = await listRecords<Record<string, unknown>>(
        configFor(apiKey, baseId, tableId),
        { maxRecords: 3 },
      );

      const first = response.records[0]?.fields ?? {};
      const fieldAnalysis = Object.fromEntries(
        Object.entries(first).map(([name, value]) => [
          name,
          {
            type: Array.isArray(value) ? 'array' : typeof value,
            sampleValue: Array.isArray(value) ? value.slice(0, 2) : value,
            isAttachment:
              Array.isArray(value) &&
              value.length > 0 &&
              typeof value[0] === 'object' &&
              value[0] !== null &&
              'url' in value[0],
          },
        ]),
      );

      res.json({
        tableId,
        recordCount: response.records.length,
        sampleRecords: response.records,
        fieldAnalysis,
      });
    }),
  );

  // Reads one record rather than the base metadata endpoint, which needs a
  // broader scope than most tokens are issued with.
  app.get(
    '/api/airtable/test-connection',
    isAuthenticated,
    asyncHandler(async (_req, res) => {
      const config = await requireConfig('quotes');

      try {
        const response = await listRecords(config, { maxRecords: 1 });
        res.json({
          success: true,
          message: 'Successfully connected to Airtable',
          details: {
            recordCount: response.records.length,
            baseId: config.baseId,
            tableName: config.articlesTable,
          },
        });
      } catch (error) {
        log.error('Airtable connection test failed', { error });
        throw HttpError.internal('Failed to connect to Airtable API');
      }
    }),
  );

  app.get(
    '/api/airtable/settings',
    isAuthenticated,
    asyncHandler(async (_req, res) => {
      const settings = await storage.getIntegrationSettings('airtable');
      res.json(settings.map(redactIntegrationSetting));
    }),
  );

  app.post(
    '/api/airtable/settings',
    isAdmin,
    asyncHandler(async (req, res) => {
      const { key, value, enabled } = req.body ?? {};
      if (typeof key !== 'string' || !key || typeof value !== 'string' || !value) {
        throw HttpError.badRequest('Key and value are required');
      }

      const existing = await storage.getIntegrationSettingByKey('airtable', key);
      // putSetting invalidates the settings cache; writing through storage
      // directly left every reader on the previous credentials for up to a TTL.
      const saved = await putSetting(
        'airtable',
        key,
        value,
        typeof enabled === 'boolean' ? enabled : (existing?.enabled ?? true),
      );

      await recordActivity({
        userId: actorId(req),
        action: existing ? 'update' : 'create',
        resource: 'integration_setting',
        resourceId: saved.id,
        details: { service: 'airtable', key },
      });

      res.status(existing ? 200 : 201).json(redactIntegrationSetting(saved));
    }),
  );

  // Lets an operator adopt a key that was injected as an environment variable
  // without pasting it into the browser.
  app.post(
    '/api/airtable/update-api-key',
    isAdmin,
    asyncHandler(async (req, res) => {
      const apiKey = process.env.AIRTABLE_API_KEY;
      if (!apiKey) {
        throw HttpError.badRequest('AIRTABLE_API_KEY environment variable not set');
      }

      const saved = await putSetting('airtable', 'api_key', apiKey, true);
      await recordActivity({
        userId: actorId(req),
        action: 'update',
        resource: 'integration_setting',
        resourceId: saved.id,
        details: { service: 'airtable', key: 'api_key', source: 'environment' },
      });

      res.json({ message: 'Airtable API key updated successfully', success: true });
    }),
  );

  app.post(
    '/api/airtable/sync/articles',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const config = await requireConfig('articles');
      const result = await syncArticlesFromAirtable(
        config.apiKey,
        config.baseId,
        config.articlesTable,
        actorId(req),
      );
      res.json(result);
    }),
  );

  // Fired by the CMS when an article goes live upstream.
  app.post(
    '/api/webhooks/article-published',
    verifyWebhookSecret,
    asyncHandler(async (_req, res) => {
      let config;
      try {
        config = await requireConfig('articles');
      } catch (error) {
        // The caller retries on 5xx. A misconfigured integration is our problem,
        // not a malformed request, so it must not be reported as 4xx.
        log.warn('Webhook sync skipped: Airtable unavailable', { error });
        throw HttpError.internal(
          error instanceof Error ? error.message : 'Airtable is not configured',
        );
      }

      const result = await syncArticlesFromAirtable(
        config.apiKey,
        config.baseId,
        config.articlesTable,
      );
      res.json({ success: true, ...result });
    }),
  );

  app.post(
    '/api/airtable/sync/team-members',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const config = await requireConfig('teamMembers');
      res.json(await syncTeamMembersFromAirtable(config, actorId(req)));
    }),
  );

  app.post(
    '/api/airtable/push/team-members',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const config = await requireConfig('teamMembers');
      const results = await pushTeamMembersToAirtable(config, actorId(req));
      res.json({ success: true, message: 'Team members pushed to Airtable', results });
    }),
  );

  app.post(
    '/api/airtable/update/article/:id',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const articleId = parseId(req.params.id, 'article ID');
      const article = await requireAirtableArticle(articleId);

      try {
        await updateArticleInAirtable(article);
      } catch (error) {
        log.error('Airtable article update failed', {
          articleId,
          externalId: article.externalId,
          error,
        });
        translateAirtableError(error);
      }

      await recordActivity({
        userId: actorId(req),
        action: 'update',
        resource: 'article',
        resourceId: articleId,
        details: { destination: 'airtable', externalId: article.externalId },
      });

      res.json({
        message: 'Article updated in Airtable',
        article: { id: article.externalId },
      });
    }),
  );

  app.post(
    '/api/airtable/update-quote/:id',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const quoteId = parseId(req.params.id);
      const { externalId, main, philo } = req.body ?? {};
      if (typeof externalId !== 'string' || !externalId) {
        throw HttpError.badRequest('External ID (Airtable record ID) is required');
      }

      const response = await updateCarouselQuoteInAirtable(quoteId, externalId, { main, philo });

      await recordActivity({
        userId: actorId(req),
        action: 'update',
        resource: 'carousel_quote',
        resourceId: quoteId,
        details: { destination: 'airtable', externalId },
      });

      res.json({ success: true, message: 'Quote updated in Airtable', data: response });
    }),
  );

  app.post(
    '/api/airtable/sync/carousel-quotes',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const config = await requireConfig('quotes');
      res.json(await syncCarouselQuotesFromAirtable(config, actorId(req)));
    }),
  );

  app.post(
    '/api/airtable/push/carousel-quotes',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const config = await requireConfig('quotes');
      const results = await pushCarouselQuotesToAirtable(config, actorId(req));
      res.json({
        message: 'Carousel quotes pushed to Airtable',
        updated: results.updated,
        created: results.created,
        errors: results.errors,
        details: results.details,
      });
    }),
  );

  app.post(
    '/api/airtable/push/article/:id',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const articleId = parseId(req.params.id);
      res.json(await pushArticleToAirtable(articleId, actorId(req)));
    }),
  );

  // The auth guard runs before multer so an unauthenticated request cannot make
  // the server write a temp file.
  app.post(
    '/api/airtable/upload-image/:articleId/:fieldName',
    isAuthenticated,
    upload.single('image'),
    asyncHandler(async (req, res) => {
      const articleId = parseId(req.params.articleId, 'article ID');
      const field = parseImageField(req.params.fieldName);
      const article = await requireAirtableArticle(articleId);

      if (!req.file) throw HttpError.badRequest('No image file uploaded');

      res.json(
        await uploadArticleImageFile(
          article,
          field,
          {
            path: req.file.path,
            filename: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
          },
          actorId(req),
        ),
      );
    }),
  );

  app.post(
    '/api/airtable/upload-image-url/:articleId/:fieldName',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const articleId = parseId(req.params.articleId, 'article ID');
      const field = parseImageField(req.params.fieldName);

      const { imageUrl, filename } = req.body ?? {};
      if (typeof imageUrl !== 'string' || !imageUrl) {
        throw HttpError.badRequest('Image URL is required');
      }
      if (typeof filename !== 'string' || !filename) {
        throw HttpError.badRequest('Filename is required');
      }

      const article = await requireAirtableArticle(articleId);
      res.json(await uploadArticleImageUrl(article, field, imageUrl, filename, actorId(req)));
    }),
  );
}
