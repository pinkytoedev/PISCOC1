/**
 * Public article uploads — the token-free submission page.
 *
 * A contributor opens one link, picks their article from a list of the ones
 * still open for submission, and uploads a cover image, an Instagram image and
 * an HTML archive. No account, no per-article link to hand out.
 *
 * This restores the flow that `tokenFreePublicUpload.ts` provided before the
 * upload subsystem was rebuilt, with the one change that made the rebuild
 * remove it: **the whole surface is behind an admin switch.**
 *
 * The original had no gate of any kind. `GET /api/articles/uploadable`
 * returned every unpublished article's title to anyone who asked, and the
 * upload endpoints took an `articleId` straight from the request body with no
 * credential — so anyone who found the URL could enumerate the newsroom's
 * unpublished work and overwrite any of it. That is why it was deleted.
 *
 * The switch is the same mechanism `teamPublicUpload.ts` uses for team
 * profiles (`article_upload.public_link_active`): off by default, flipped on
 * for a submission window, and checked *before* multer so a request that will
 * be refused never reaches the filesystem.
 *
 * The contributor-link flow in `contributorUpload.ts` is unchanged and still
 * the right tool when one specific person should reach one specific article —
 * notably during a re-upload session. The two coexist: these routes live at
 * `/api/public-upload/<assetType>` (one path segment) and the link routes at
 * `/api/public-upload/<token>/<assetType>` (two), so they cannot collide.
 */

import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import type { Article } from '@shared/schema';
import { storage } from '../storage';
import { HttpError, asyncHandler, parseId } from '../lib/httpError';
import { createLogger } from '../lib/logger';
import { isAdmin } from '../middleware/auth';
import { publicApiRateLimit, uploadRateLimit } from '../middleware/rateLimit';
import {
  assertFileKind,
  cleanupUploadedFile,
  imageUpload,
  normalizeImage,
  zipUpload,
} from '../middleware/upload';
import { recordActivity } from '../services/activity';
import { getSettingValue, putSetting } from '../services/settings';
import { tryUpdateRecord } from '../lib/airtableClient';
import { uploadImageToImgBB } from '../utils/imgbbUploader';
import { processZipFile } from '../utils/zipProcessor';

const log = createLogger('upload:public-article');

const SERVICE_NAME = 'article_upload';
const SETTING_KEY = 'public_link_active';

/** Airtable link field that mirrors each image asset type. */
const AIRTABLE_IMAGE_FIELD: Record<'image' | 'instagram-image', string> = {
  image: 'MainImageLink',
  'instagram-image': 'InstaPhotoLink',
};

async function isPublicUploadEnabled(): Promise<boolean> {
  return (await getSettingValue(SERVICE_NAME, SETTING_KEY)) === 'true';
}

/**
 * Refuses every public route while the link is switched off.
 *
 * Mounted ahead of multer on the upload routes, so a request that is going to
 * be rejected never causes a byte to be written to disk.
 */
const requirePublicUploadEnabled = asyncHandler(async (_req, _res, next) => {
  if (!(await isPublicUploadEnabled())) {
    throw HttpError.forbidden('Public article upload is currently disabled');
  }
  next();
});

/**
 * Whether an article may be written to through this page.
 *
 * Exactly the predicate the article list uses, so a caller can never reach an
 * article the page does not offer. The original accepted any id that existed,
 * which meant a published article could be overwritten by anyone willing to
 * guess its number rather than pick from the dropdown.
 */
function isUploadable(article: Article): boolean {
  return article.status !== 'published' || Boolean(article.isReuploading);
}

/** Loads the target article named in the body, refusing anything not on offer. */
async function requireUploadableArticle(req: Request): Promise<Article> {
  const articleId = parseId(req.body?.articleId, 'article ID');

  const article = await storage.getArticle(articleId);
  if (!article) throw HttpError.notFound('Article not found');

  if (!isUploadable(article)) {
    throw HttpError.forbidden('That article is published and not open for submissions');
  }

  return article;
}

/** Records the upload without attributing it to an account — there isn't one. */
async function recordUpload(
  article: Article,
  assetType: 'image' | 'instagram-image' | 'html-zip',
  filename: string,
): Promise<void> {
  await recordActivity({
    // No userId: a public-link submission has no user behind it.
    action: 'upload',
    resource: assetType,
    resourceId: article.id,
    details: { uploadType: assetType, filename, source: 'public-article-link' },
  });
}

/** Shared handler for the two image asset types. */
async function handleImageUpload(
  req: Request,
  res: Response,
  assetType: 'image' | 'instagram-image',
): Promise<void> {
  const article = await requireUploadableArticle(req);
  if (!req.file) throw HttpError.badRequest('No image was uploaded');

  await assertFileKind(req.file.path, 'image');

  const uploaded = await uploadImageToImgBB(await normalizeImage(req.file));
  if (!uploaded) throw HttpError.internal('Image hosting is unavailable; try again shortly');

  const patch =
    assetType === 'image'
      ? { imageUrl: uploaded.url, imageType: 'url' }
      : { instagramImageUrl: uploaded.url };

  const updated = await storage.updateArticle(article.id, patch);
  if (!updated) throw HttpError.internal('Failed to attach the image to the article');

  if (article.source === 'airtable' && article.externalId) {
    await tryUpdateRecord(
      article.externalId,
      { [AIRTABLE_IMAGE_FIELD[assetType]]: uploaded.url },
      `sync ${assetType} for article ${article.id}`,
    );
  }

  await recordUpload(article, assetType, req.file.originalname);

  log.info('Article asset uploaded via public link', {
    articleId: article.id,
    assetType,
  });

  res.json({
    success: true,
    message: assetType === 'image' ? 'Cover image updated' : 'Instagram image updated',
    imageUrl: uploaded.url,
  });
}

export function setupPublicArticleUploadRoutes(app: Express) {
  // -------------------------------------------------------------------------
  // The switch
  // -------------------------------------------------------------------------

  // Whether the public page should render at all. Readable while the feature
  // is off — that answer *is* the response.
  app.get(
    '/api/public/article-upload-status',
    publicApiRateLimit,
    asyncHandler(async (_req, res) => {
      res.json({ enabled: await isPublicUploadEnabled() });
    }),
  );

  // Toggle the public link (admin only).
  //
  // Deliberately *not* CSRF-exempt: `/api/public/` is a prefix shared with
  // unauthenticated routes, but this one is admin-guarded and session-backed,
  // so it needs the token like any other state-changing call. See the note in
  // middleware/csrf.ts about why that prefix is never exempted wholesale.
  app.post(
    '/api/public/article-upload-status',
    isAdmin,
    asyncHandler(async (req, res) => {
      const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);

      await putSetting(SERVICE_NAME, SETTING_KEY, String(enabled));

      // Opening or closing anonymous write access to unpublished articles is
      // worth an audit entry.
      await recordActivity({
        userId: req.user?.id,
        action: 'update',
        resource: 'integration_setting',
        resourceId: `${SERVICE_NAME}.${SETTING_KEY}`,
        details: { enabled },
      });

      res.json({ enabled });
    }),
  );

  // -------------------------------------------------------------------------
  // Contributor-facing (public, gated)
  // -------------------------------------------------------------------------

  /**
   * The list the contributor picks their article out of.
   *
   * Must be registered before `app.use('/api/articles', articlesRouter())` in
   * routes/index.ts, or the router's `/:id` handler claims "uploadable" first
   * and answers 400 for a malformed id.
   *
   * Only id, title and status are exposed: enough to choose from, and nothing
   * about an unpublished article's content.
   */
  app.get(
    '/api/articles/uploadable',
    publicApiRateLimit,
    requirePublicUploadEnabled,
    asyncHandler(async (_req, res) => {
      const articles = await storage.getArticles();

      res.json(
        articles.filter(isUploadable).map((article) => ({
          id: article.id,
          title: article.title,
          status: article.status,
        })),
      );
    }),
  );

  app.post(
    '/api/public-upload/image',
    uploadRateLimit,
    requirePublicUploadEnabled,
    cleanupUploadedFile,
    imageUpload.single('file'),
    asyncHandler(async (req, res) => {
      await handleImageUpload(req, res, 'image');
    }),
  );

  app.post(
    '/api/public-upload/instagram-image',
    uploadRateLimit,
    requirePublicUploadEnabled,
    cleanupUploadedFile,
    imageUpload.single('file'),
    asyncHandler(async (req, res) => {
      await handleImageUpload(req, res, 'instagram-image');
    }),
  );

  app.post(
    '/api/public-upload/html-zip',
    uploadRateLimit,
    requirePublicUploadEnabled,
    cleanupUploadedFile,
    zipUpload.single('file'),
    asyncHandler(async (req, res) => {
      const article = await requireUploadableArticle(req);
      if (!req.file) throw HttpError.badRequest('No archive was uploaded');

      await assertFileKind(req.file.path, 'zip');

      // No userId: the activity entry should not name an account that had
      // nothing to do with the submission.
      const result = await processZipFile(req.file.path, article.id);

      if (!result.success) {
        // The message describes what is wrong with the archive, which is
        // exactly what the contributor needs in order to fix it.
        throw HttpError.badRequest(result.message);
      }

      await recordUpload(article, 'html-zip', req.file.originalname);

      log.info('Article content uploaded via public link', {
        articleId: article.id,
        imagesProcessed: result.imagesProcessed,
      });

      res.json({
        success: true,
        message: result.message,
        sanitized: result.sanitized,
        imagesProcessed: result.imagesProcessed,
        html: result.html,
      });
    }),
  );
}
