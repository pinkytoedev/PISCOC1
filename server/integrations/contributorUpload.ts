/**
 * Contributor upload API.
 *
 * Replaces the two overlapping modules this codebase used to carry:
 *
 *   - `publicUpload.ts`, a token flow with one endpoint per asset type plus a
 *     unified one, all duplicating the same validate/upload/sync sequence
 *   - `tokenFreePublicUpload.ts`, which had no authentication whatsoever, so
 *     anyone on the internet could enumerate articles and overwrite their
 *     content and images
 *
 * Access is a single capability: a random secret in the URL, scoped to one
 * article and a set of asset types, that the editor generates and sends to the
 * contributor. No account, no password, one link for the whole submission —
 * and no ambient authority for anyone who does not have that link.
 */

import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { log } from '../vite';
import { HttpError, asyncHandler, parseId } from '../lib/httpError';
import { getAirtableConfig, tryUpdateRecord } from '../lib/airtableClient';
import { isAuthenticated } from '../middleware/auth';
import { uploadInfoRateLimit, uploadRateLimit } from '../middleware/rateLimit';
import {
  assertFileKind,
  cleanupUploadedFile,
  imageUpload,
  zipUpload,
} from '../middleware/upload';
import { uploadImageToImgBB } from '../utils/imgbbUploader';
import { processZipFile } from '../utils/zipProcessor';
import {
  createUploadToken,
  rejectionMessage,
  revokeArticleTokens,
  validateToken,
  type UploadAssetType,
} from '../services/uploadTokens';
import { completeReuploadSession } from '../services/reupload';
import type { Article, UploadToken } from '@shared/schema';

/** Airtable link field that mirrors each image asset type. */
const AIRTABLE_IMAGE_FIELD: Record<'image' | 'instagram-image', string> = {
  image: 'MainImageLink',
  'instagram-image': 'InstaPhotoLink',
};

interface TokenContext {
  token: UploadToken;
  article: Article;
  uploadTypes: UploadAssetType[];
}

/**
 * Resolves and validates the link, then loads its article.
 *
 * Runs *before* multer in every route below, so a bad link is rejected before
 * any bytes are written to disk.
 */
async function requireToken(req: Request, assetType?: UploadAssetType): Promise<TokenContext> {
  const plaintext = req.params.token;
  if (!plaintext) throw HttpError.unauthorized('Missing upload link');

  const result = await validateToken(plaintext, assetType);
  if (!result.ok) {
    // 'type-not-allowed' is an authorization failure; the rest mean the link
    // itself is no longer usable.
    throw result.reason === 'type-not-allowed'
      ? HttpError.forbidden(rejectionMessage(result.reason))
      : HttpError.unauthorized(rejectionMessage(result.reason));
  }

  const article = await storage.getArticle(result.token.articleId);
  if (!article) throw HttpError.notFound('The article for this link no longer exists');

  return { token: result.token, article, uploadTypes: result.uploadTypes };
}

/** Middleware form, so the check happens before the file is accepted. */
function withToken(assetType: UploadAssetType) {
  return asyncHandler(async (req, _res, next) => {
    (req as Request & { tokenContext?: TokenContext }).tokenContext = await requireToken(
      req,
      assetType,
    );
    next();
  });
}

function tokenContext(req: Request): TokenContext {
  const context = (req as Request & { tokenContext?: TokenContext }).tokenContext;
  if (!context) throw HttpError.internal('Upload context missing');
  return context;
}

/** Records the upload and consumes one use of the link. */
async function recordUpload(
  context: TokenContext,
  assetType: UploadAssetType,
  filename: string,
): Promise<void> {
  await storage.incrementUploadTokenUses(context.token.id);
  await storage.createActivityLog({
    // Deliberately unattributed: the uploader is a contributor, not a user.
    action: 'upload',
    resourceType: assetType,
    resourceId: context.article.id.toString(),
    details: {
      uploadType: assetType,
      filename,
      source: 'contributor-link',
      tokenId: context.token.id,
    },
  });
}

/** Shared handler for the two image asset types. */
async function handleImageUpload(
  req: Request,
  res: Response,
  assetType: 'image' | 'instagram-image',
): Promise<void> {
  const context = tokenContext(req);
  if (!req.file) throw HttpError.badRequest('No image was uploaded');

  await assertFileKind(req.file.path, 'image');

  const uploaded = await uploadImageToImgBB({
    path: req.file.path,
    filename: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });

  if (!uploaded) throw HttpError.internal('Image hosting is unavailable; try again shortly');

  const patch =
    assetType === 'image'
      ? { imageUrl: uploaded.url, imageType: 'url' }
      : { instagramImageUrl: uploaded.url };

  const updated = await storage.updateArticle(context.article.id, patch);
  if (!updated) throw HttpError.internal('Failed to attach the image to the article');

  if (context.article.source === 'airtable' && context.article.externalId) {
    await tryUpdateRecord(
      context.article.externalId,
      { [AIRTABLE_IMAGE_FIELD[assetType]]: uploaded.url },
      `sync ${assetType} for article ${context.article.id}`,
    );
  }

  await recordUpload(context, assetType, req.file.originalname);

  res.json({
    success: true,
    message: assetType === 'image' ? 'Cover image updated' : 'Instagram image updated',
    imageUrl: uploaded.url,
  });
}

export function setupContributorUploadRoutes(app: Express) {
  // ---------------------------------------------------------------------
  // Editor-facing: issue and manage links
  // ---------------------------------------------------------------------

  const createLinkSchema = z.object({
    articleId: z.number().int().positive(),
    uploadTypes: z
      .array(z.enum(['image', 'instagram-image', 'html-zip']))
      .min(1, 'Choose at least one upload type')
      .default(['image', 'instagram-image', 'html-zip']),
    ttlDays: z.number().int().min(1).max(90).optional(),
    notes: z.string().max(1000).optional(),
  });

  app.post(
    '/api/upload-links',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const input = createLinkSchema.parse(req.body);

      const article = await storage.getArticle(input.articleId);
      if (!article) throw HttpError.notFound('Article not found');

      const issued = await createUploadToken({
        articleId: input.articleId,
        uploadTypes: input.uploadTypes,
        createdById: req.user?.id,
        name: article.title,
        notes: input.notes,
        ttlDays: input.ttlDays,
      });

      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'create',
        resourceType: 'upload_link',
        resourceId: input.articleId.toString(),
        details: { uploadTypes: input.uploadTypes, expiresAt: issued.expiresAt },
      });

      // The plaintext secret is returned exactly once, here.
      res.status(201).json(issued);
    }),
  );

  app.get(
    '/api/upload-links/:articleId',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const articleId = parseId(req.params.articleId, 'articleId');
      const tokens = await storage.getUploadTokensByArticle(articleId);

      // The secret cannot be shown again — only its metadata.
      res.json(
        tokens.map((token) => ({
          id: token.id,
          articleId: token.articleId,
          uploadTypes: token.uploadTypes,
          createdAt: token.createdAt,
          expiresAt: token.expiresAt,
          uses: token.uses,
          maxUses: token.maxUses,
          active: token.active,
          name: token.name,
        })),
      );
    }),
  );

  app.delete(
    '/api/upload-links/:id',
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const token = await storage.getUploadToken(id);
      if (!token) throw HttpError.notFound('Upload link not found');

      await storage.updateUploadToken(id, { active: false });

      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'delete',
        resourceType: 'upload_link',
        resourceId: token.articleId.toString(),
        details: { tokenId: id },
      });

      res.json({ message: 'Upload link revoked' });
    }),
  );

  // ---------------------------------------------------------------------
  // Editor-facing: upload directly to an article from the dashboard
  //
  // Same pipeline as the contributor routes, authorized by the session instead
  // of a link, so an editor never has to mint a link to upload their own file.
  // ---------------------------------------------------------------------

  app.post(
    '/api/articles/:id/assets/:assetType',
    isAuthenticated,
    cleanupUploadedFile,
    (req, res, next) => {
      const assetType = req.params.assetType;
      if (assetType === 'image' || assetType === 'instagram-image') {
        return imageUpload.single('file')(req, res, next);
      }
      if (assetType === 'html-zip') {
        return zipUpload.single('file')(req, res, next);
      }
      next(HttpError.badRequest(`Unknown asset type "${assetType}"`));
    },
    asyncHandler(async (req, res) => {
      const articleId = parseId(req.params.id);
      const assetType = req.params.assetType as UploadAssetType;

      const article = await storage.getArticle(articleId);
      if (!article) throw HttpError.notFound('Article not found');
      if (!req.file) throw HttpError.badRequest('No file was uploaded');

      if (assetType === 'html-zip') {
        await assertFileKind(req.file.path, 'zip');
        const result = await processZipFile(req.file.path, articleId, req.user?.id);
        if (!result.success) throw HttpError.badRequest(result.message);

        return res.json({
          success: true,
          message: result.message,
          sanitized: result.sanitized,
          imagesProcessed: result.imagesProcessed,
          html: result.html,
        });
      }

      await assertFileKind(req.file.path, 'image');

      const uploaded = await uploadImageToImgBB({
        path: req.file.path,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });
      if (!uploaded) throw HttpError.internal('Image hosting is unavailable; try again shortly');

      const patch =
        assetType === 'image'
          ? { imageUrl: uploaded.url, imageType: 'url' }
          : { instagramImageUrl: uploaded.url };

      const updated = await storage.updateArticle(articleId, patch);
      if (!updated) throw HttpError.internal('Failed to attach the image to the article');

      if (article.source === 'airtable' && article.externalId) {
        await tryUpdateRecord(
          article.externalId,
          { [AIRTABLE_IMAGE_FIELD[assetType]]: uploaded.url },
          `sync ${assetType} for article ${articleId}`,
        );
      }

      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'upload',
        resourceType: assetType,
        resourceId: articleId.toString(),
        details: { uploadType: assetType, filename: req.file.originalname, source: 'dashboard' },
      });

      res.json({ success: true, message: 'Upload complete', imageUrl: uploaded.url });
    }),
  );

  // ---------------------------------------------------------------------
  // Contributor-facing: everything below is authorized by the link alone
  // ---------------------------------------------------------------------

  /**
   * Describes what a link allows, so the upload page can render itself without
   * the contributor needing to know anything in advance.
   */
  app.get(
    '/api/public-upload/:token',
    uploadInfoRateLimit,
    asyncHandler(async (req, res) => {
      const context = await requireToken(req);

      res.json({
        article: {
          id: context.article.id,
          title: context.article.title,
          // Enough context to confirm they have the right article, no more.
          hasContent: Boolean(context.article.content?.trim()),
          hasCoverImage: Boolean(context.article.imageUrl),
          hasInstagramImage: Boolean(context.article.instagramImageUrl),
        },
        uploadTypes: context.uploadTypes,
        expiresAt: context.token.expiresAt,
        // Drives the "you're done" button on the contributor page.
        isReuploadSession: Boolean(context.article.isReuploading),
      });
    }),
  );

  app.post(
    '/api/public-upload/:token/image',
    uploadRateLimit,
    withToken('image'),
    cleanupUploadedFile,
    imageUpload.single('file'),
    asyncHandler(async (req, res) => {
      await handleImageUpload(req, res, 'image');
    }),
  );

  app.post(
    '/api/public-upload/:token/instagram-image',
    uploadRateLimit,
    withToken('instagram-image'),
    cleanupUploadedFile,
    imageUpload.single('file'),
    asyncHandler(async (req, res) => {
      await handleImageUpload(req, res, 'instagram-image');
    }),
  );

  app.post(
    '/api/public-upload/:token/html-zip',
    uploadRateLimit,
    withToken('html-zip'),
    cleanupUploadedFile,
    zipUpload.single('file'),
    asyncHandler(async (req, res) => {
      const context = tokenContext(req);
      if (!req.file) throw HttpError.badRequest('No archive was uploaded');

      await assertFileKind(req.file.path, 'zip');

      const result = await processZipFile(req.file.path, context.article.id);

      if (!result.success) {
        // The message describes what is wrong with the archive, which is
        // exactly what the contributor needs in order to fix it.
        throw HttpError.badRequest(result.message);
      }

      await recordUpload(context, 'html-zip', req.file.originalname);

      res.json({
        success: true,
        message: result.message,
        sanitized: result.sanitized,
        imagesProcessed: result.imagesProcessed,
        html: result.html,
      });
    }),
  );

  /**
   * Lets the contributor close their own re-upload session.
   *
   * This is the explicit "I'm finished" step that replaces the old behaviour of
   * republishing after whichever asset happened to arrive first.
   */
  app.post(
    '/api/public-upload/:token/complete',
    uploadRateLimit,
    asyncHandler(async (req, res) => {
      const context = await requireToken(req);

      if (!context.article.isReuploading) {
        throw HttpError.conflict('This submission has already been completed');
      }

      const article = await completeReuploadSession(context.article.id, {
        userId: context.token.createdById ?? undefined,
        via: 'upload-link',
      });

      log(`Contributor completed re-upload for article ${article.id}`, 'reupload');

      res.json({ success: true, message: 'Thanks — your changes are now live.' });
    }),
  );
}

/** Exposed for the article deletion path, which must invalidate stale links. */
export { revokeArticleTokens };

/** Kept for callers that need the Airtable config alongside an upload. */
export { getAirtableConfig };
