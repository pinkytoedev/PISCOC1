/**
 * Article endpoints.
 *
 * Handlers stay thin: parse, delegate, respond. The publication side effects
 * (Airtable push, Instagram, site refresh) live in services/articles.ts, and
 * re-upload sessions in services/reupload.ts.
 */

import { Router } from 'express';
import { insertArticleSchema } from '@shared/schema';
import { storage } from '../storage';
import { asyncHandler, HttpError, parseId } from '../lib/httpError';
import { isAuthenticated } from '../middleware/auth';
import { recordActivity, changedFields } from '../services/activity';
import {
  applyPublicationEffects,
  applyRepublishedFlag,
  deleteArticleEverywhere,
  publicationEffects,
} from '../services/articles';
import {
  cancelReuploadSession,
  completeReuploadSession,
  startReuploadSession,
} from '../services/reupload';

export function articlesRouter(): Router {
  const router = Router();

  router.use(isAuthenticated);

  // Literal paths are registered before "/:id".
  //
  // Express matches in registration order, so a literal segment declared after
  // the parameter route is unreachable. "/api/articles/featured" sat below
  // "/api/articles/:id" and had been answering "Invalid id" rather than
  // returning featured articles.
  router.get(
    '/featured',
    asyncHandler(async (_req, res) => {
      res.json(await storage.getFeaturedArticles());
    }),
  );

  router.get(
    '/status/:status',
    asyncHandler(async (req, res) => {
      res.json(await storage.getArticlesByStatus(req.params.status));
    }),
  );

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json(await storage.getArticles());
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const article = await storage.getArticle(parseId(req.params.id));
      if (!article) throw HttpError.notFound('Article not found');
      res.json(article);
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const data = insertArticleSchema.parse(req.body);
      const article = await storage.createArticle(data);

      await recordActivity({
        action: 'create',
        resource: 'article',
        resourceId: article.id,
        userId: req.user?.id,
        details: { title: article.title, status: article.status },
      });

      res.status(201).json(article);
    }),
  );

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);

      const previous = await storage.getArticle(id);
      if (!previous) throw HttpError.notFound('Article not found');

      const patch = applyRepublishedFlag(
        req.body as Record<string, unknown>,
        insertArticleSchema.partial().parse(req.body),
      );

      const updated = await storage.updateArticle(id, patch);
      if (!updated) throw HttpError.notFound('Article not found');

      await recordActivity({
        action: 'update',
        resource: 'article',
        resourceId: id,
        userId: req.user?.id,
        details: {
          fields: changedFields(previous as Record<string, unknown>, patch as Record<string, unknown>),
          status: updated.status,
        },
      });

      const force = req.body.forceWebhook === true || req.body.forceWebhook === 'true';
      const instagram = await applyPublicationEffects(
        updated,
        publicationEffects(previous, updated, force),
        req.user?.id,
      );

      // The client renders the Instagram outcome when there is one, so it is
      // attached to the article rather than returned separately.
      res.json(instagram ? { ...updated, _instagram: instagram } : updated);
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      await deleteArticleEverywhere(parseId(req.params.id), req.user?.id);
      res.status(204).send();
    }),
  );

  // --- Re-upload sessions --------------------------------------------------

  router.post(
    '/:id/reupload',
    asyncHandler(async (req, res) => {
      const session = await startReuploadSession(parseId(req.params.id), req.user?.id);
      res.status(201).json({
        article: session.article,
        // Shown once so the editor can hand it straight to a contributor.
        uploadUrl: session.upload?.url,
        expiresAt: session.upload?.expiresAt,
      });
    }),
  );

  router.post(
    '/:id/reupload/complete',
    asyncHandler(async (req, res) => {
      res.json(
        await completeReuploadSession(parseId(req.params.id), {
          userId: req.user?.id,
          via: 'dashboard',
        }),
      );
    }),
  );

  router.post(
    '/:id/reupload/cancel',
    asyncHandler(async (req, res) => {
      res.json(await cancelReuploadSession(parseId(req.params.id), req.user?.id));
    }),
  );

  return router;
}
