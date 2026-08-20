/**
 * Diagnostic endpoints for the Airtable link-field migration.
 *
 * These exist to answer "can this deployment write a URL into Airtable at all?"
 * before the real image fields are switched over. They mutate a scratch column
 * or an article's link fields and report what happened; none of them are part
 * of the editorial flow.
 */

import type { Express } from 'express';
import type { Article } from '@shared/schema';
import { storage } from '../storage';
import { asyncHandler, HttpError, parseId } from '../lib/httpError';
import { createLogger } from '../lib/logger';
import { isAdmin, isAuthenticated } from '../middleware/auth';
import { recordActivity } from '../services/activity';
import { migrateArticleImagesToLinks, uploadLinkToAirtableTestField } from '../utils/airtableTestField';
import { uploadImageUrlAsLinkField } from '../utils/imageUploader';

const log = createLogger('airtable:test');

/** Loads an article that is actually backed by an Airtable record. */
async function requireAirtableArticle(articleId: number): Promise<Article> {
  const article = await storage.getArticle(articleId);
  if (!article) throw HttpError.notFound('Article not found');
  if (article.source !== 'airtable' || !article.externalId) {
    throw HttpError.badRequest('This article is not from Airtable');
  }
  return article;
}

function describe(article: Article) {
  return { id: article.id, title: article.title, externalId: article.externalId };
}

export function registerAirtableTestRoutes(app: Express): void {
  // Picks its own subject, so it needs no request body — admin-only because it
  // writes to whichever article it happens to find first.
  app.get(
    '/api/airtable/direct-test',
    isAdmin,
    asyncHandler(async (_req, res) => {
      const articles = await storage.getArticles();
      const subject = articles.find(
        (article) => article.source === 'airtable' && article.externalId && article.imageUrl,
      );

      if (!subject) {
        throw HttpError.notFound('No suitable Airtable article found for testing');
      }

      const success = await uploadLinkToAirtableTestField(
        subject.imageUrl,
        subject.externalId as string,
        `test-image-${subject.id}.jpg`,
      );

      if (!success) {
        throw HttpError.internal('Failed to update Airtable Test field');
      }

      res.json({
        message: 'Successfully updated Airtable Test field with image URL',
        article: { ...describe(subject), imageUrl: subject.imageUrl },
      });
    }),
  );

  app.post(
    '/api/airtable/test-link/:articleId',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const articleId = parseId(req.params.articleId, 'article ID');
      const { imageUrl } = req.body ?? {};
      if (typeof imageUrl !== 'string' || !imageUrl) {
        throw HttpError.badRequest('Image URL is required');
      }

      const article = await requireAirtableArticle(articleId);
      const success = await uploadLinkToAirtableTestField(
        imageUrl,
        article.externalId as string,
        `test-image-${article.id}.jpg`,
      );

      if (!success) throw HttpError.internal('Failed to update Airtable Test field');

      await recordActivity({
        userId: req.user?.id,
        action: 'update',
        resource: 'article',
        resourceId: articleId,
        details: { operation: 'airtable-test-link', field: 'Test' },
      });

      res.json({
        message: 'Image URL successfully uploaded to Airtable Test field',
        article: describe(article),
      });
    }),
  );

  app.post(
    '/api/airtable/test-migration/:articleId',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const articleId = parseId(req.params.articleId, 'article ID');
      const article = await requireAirtableArticle(articleId);

      const result = await migrateArticleImagesToLinks(articleId, true);

      await recordActivity({
        userId: req.user?.id,
        action: 'update',
        resource: 'article',
        resourceId: articleId,
        details: { operation: 'airtable-test-migration', ...result },
      });

      res.json({
        message: result.success
          ? 'Successfully migrated article image to Test field'
          : 'Failed to migrate article image to Test field',
        result,
        article: describe(article),
      });
    }),
  );

  // Writes the real link fields for one article, which is the migration itself
  // rather than a rehearsal.
  app.post(
    '/api/airtable/migrate-to-link-fields/:articleId',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const articleId = parseId(req.params.articleId, 'article ID');
      const article = await requireAirtableArticle(articleId);
      const recordId = article.externalId as string;

      const results = {
        mainImage: article.imageUrl
          ? await uploadImageUrlAsLinkField(article.imageUrl, recordId, 'MainImageLink')
          : false,
        instaPhoto: article.instagramImageUrl
          ? await uploadImageUrlAsLinkField(article.instagramImageUrl, recordId, 'InstaPhotoLink')
          : false,
      };

      log.info('Migrated article images to link fields', { articleId, ...results });

      await recordActivity({
        userId: req.user?.id,
        action: 'update',
        resource: 'article',
        resourceId: articleId,
        details: { operation: 'airtable-link-migration', ...results },
      });

      res.json({
        message: 'Article migration to link fields complete',
        success: results.mainImage || results.instaPhoto,
        results,
        article: {
          ...describe(article),
          hasMainImage: Boolean(article.imageUrl),
          hasInstaImage: Boolean(article.instagramImageUrl),
        },
      });
    }),
  );

  app.post(
    '/api/airtable/test-batch-migration',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const limit = parseLimit(req.body?.limit);

      const articles = await storage.getArticles();
      const subjects = articles
        .filter(
          (article) =>
            article.source === 'airtable'
            && article.externalId
            && (article.imageUrl || article.instagramImageUrl),
        )
        .slice(0, limit);

      if (subjects.length === 0) {
        throw HttpError.notFound('No Airtable articles with images found');
      }

      const results = [];
      for (const article of subjects) {
        const result = await migrateArticleImagesToLinks(article.id, true);
        results.push({ articleId: article.id, title: article.title, result });

        await recordActivity({
          userId: req.user?.id,
          action: 'update',
          resource: 'article',
          resourceId: article.id,
          details: { operation: 'airtable-test-migration', ...result },
        });
      }

      res.json({ message: `Tested migration for ${results.length} articles`, results });
    }),
  );
}

/**
 * Bounds the batch size. The body used to be trusted verbatim, so a `limit` of
 * a few thousand would hold the request open for one Airtable write per record.
 */
function parseLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(Math.trunc(parsed), 25);
}
