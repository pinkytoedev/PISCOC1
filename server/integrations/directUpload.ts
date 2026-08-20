/**
 * Dashboard "direct upload" API.
 *
 * Three endpoints an editor uses to attach a cover image, an Instagram image or
 * an HTML archive to an article they already have open. The routes are kept as
 * they were — the client posts `file` plus an `articleId` field — but the
 * implementation no longer carries its own copy of the upload plumbing.
 *
 * What changed and why:
 *
 *   - Multer wrote into `./uploads` and the file was only unlinked on the paths
 *     the author remembered. A request rejected for a bad article id left its
 *     file behind forever. Uploads now go to the OS temp directory through the
 *     shared middleware, and `cleanupUploadedFile` removes them when the
 *     response finishes — success, validation failure or thrown error alike.
 *
 *   - The session check ran *inside* the handler, i.e. after multer had already
 *     written the bytes. `isAuthenticated` now runs first, so an anonymous
 *     caller cannot spend disk here at all.
 *
 *   - A declared `image/png` was taken at face value; the file is now verified
 *     against its magic bytes.
 *
 *   - The Airtable sync read the setting key `article_table_id`, which nothing
 *     in this system ever writes — the UI and every other integration use
 *     `articles_table`. The sync was therefore silently skipped on every
 *     upload. Going through `tryUpdateRecord` fixes that and drops the
 *     hand-rolled fetch.
 */

import type { Express, Request, Response } from 'express';
import type { Article } from '@shared/schema';
import { storage } from '../storage';
import { HttpError, asyncHandler, parseId } from '../lib/httpError';
import { createLogger } from '../lib/logger';
import { tryUpdateRecord } from '../lib/airtableClient';
import { isAuthenticated } from '../middleware/auth';
import {
  assertFileKind,
  cleanupUploadedFile,
  imageUpload,
  zipUpload,
} from '../middleware/upload';
import { recordActivity } from '../services/activity';
import { uploadImageToImgBB } from '../utils/imgbbUploader';
import { processZipFile } from '../utils/zipProcessor';

const log = createLogger('upload:direct');

/** Airtable link field that mirrors each image asset type. */
const AIRTABLE_IMAGE_FIELD: Record<'image' | 'instagram-image', string> = {
  image: 'MainImageLink',
  'instagram-image': 'InstaPhotoLink',
};

/**
 * Resolves the article named by the multipart `articleId` field.
 *
 * The id travels in the body rather than the path, so it cannot be checked
 * before multer runs; `cleanupUploadedFile` is what keeps a rejection here from
 * costing disk.
 */
async function requireArticle(req: Request): Promise<Article> {
  const articleId = parseId(req.body?.articleId, 'article ID');
  const article = await storage.getArticle(articleId);
  if (!article) throw HttpError.notFound('Article not found');
  return article;
}

/** Shared handler for the two image endpoints, which differ only in target field. */
async function handleImageUpload(
  req: Request,
  res: Response,
  assetType: 'image' | 'instagram-image',
): Promise<void> {
  if (!req.file) throw HttpError.badRequest('No file uploaded');

  const article = await requireArticle(req);
  await assertFileKind(req.file.path, 'image');

  log.info('Processing direct image upload', {
    articleId: article.id,
    assetType,
    filename: req.file.originalname,
  });

  const uploaded = await uploadImageToImgBB({
    path: req.file.path,
    filename: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
  if (!uploaded) throw HttpError.internal('Failed to upload image to ImgBB');

  const patch =
    assetType === 'image'
      ? { imageUrl: uploaded.url, imageType: 'url' }
      : { instagramImageUrl: uploaded.url };

  const updated = await storage.updateArticle(article.id, patch);
  if (!updated) throw HttpError.internal('Failed to update article with image URL');

  if (article.source === 'airtable' && article.externalId) {
    // Best effort: the local write has already committed, so a third party
    // being down must not fail the request.
    await tryUpdateRecord(
      article.externalId,
      { [AIRTABLE_IMAGE_FIELD[assetType]]: uploaded.url },
      `sync ${assetType} for article ${article.id}`,
    );
  }

  await recordActivity({
    userId: req.user?.id,
    action: 'upload',
    resource: assetType,
    resourceId: article.id,
    details: {
      fieldName: AIRTABLE_IMAGE_FIELD[assetType],
      imgbbId: uploaded.id,
      imgbbUrl: uploaded.url,
      filename: req.file.originalname,
    },
  });

  res.json({
    success: true,
    message:
      assetType === 'image'
        ? 'Image uploaded successfully'
        : 'Instagram image uploaded successfully',
    imgbb: {
      id: uploaded.id,
      url: uploaded.url,
      display_url: uploaded.display_url,
    },
  });
}

/**
 * Setup direct upload routes
 * @param app Express application instance
 */
export function setupDirectUploadRoutes(app: Express) {
  // Upload main article image
  app.post(
    '/api/direct-upload/image',
    isAuthenticated,
    cleanupUploadedFile,
    imageUpload.single('file'),
    asyncHandler(async (req, res) => {
      await handleImageUpload(req, res, 'image');
    }),
  );

  // Upload Instagram image
  app.post(
    '/api/direct-upload/instagram-image',
    isAuthenticated,
    cleanupUploadedFile,
    imageUpload.single('file'),
    asyncHandler(async (req, res) => {
      await handleImageUpload(req, res, 'instagram-image');
    }),
  );

  // Upload and process ZIP file with HTML content
  app.post(
    '/api/direct-upload/html-zip',
    isAuthenticated,
    cleanupUploadedFile,
    zipUpload.single('file'),
    asyncHandler(async (req, res) => {
      if (!req.file) throw HttpError.badRequest('No file uploaded');

      const article = await requireArticle(req);
      await assertFileKind(req.file.path, 'zip');

      log.info('Processing direct ZIP upload', {
        articleId: article.id,
        filename: req.file.originalname,
      });

      const result = await processZipFile(req.file.path, article.id, req.user?.id);

      // Recorded either way: a rejected archive is the interesting case when
      // someone asks why an article never picked up its content.
      await recordActivity({
        userId: req.user?.id,
        action: 'upload',
        resource: 'html-zip',
        resourceId: article.id,
        details: {
          filename: req.file.originalname,
          success: result.success,
          message: result.message,
        },
      });

      // The message names what is wrong with the archive, which is what the
      // editor needs in order to fix it.
      if (!result.success) throw HttpError.badRequest(result.message);

      res.json({ success: true, message: result.message });
    }),
  );
}
