/**
 * ImgBB integration endpoints.
 *
 * Two things happen here: managing the API key, and the "host the image on
 * ImgBB, then point Airtable at it" flow that the dashboard uses for an
 * article's cover and Instagram images.
 *
 * The Airtable side deliberately writes a *link* field (`MainImageLink` /
 * `InstaPhotoLink`) rather than an attachment field. Attachment fields make
 * Airtable store its own copy behind an expiring URL; the link field keeps the
 * durable ImgBB URL, which is also what the public site and the Instagram
 * publisher read.
 *
 * The two upload handlers were near-identical 150-line copies of each other,
 * differing only in where the image came from. They now share `hostAndLink`,
 * which also means the ImgBB call, the Airtable write and the local write can
 * no longer drift apart.
 */

import type { Express, Request, Response } from 'express';
import type { InsertArticle } from '@shared/schema';
import { storage } from '../storage';
import { createLogger } from '../lib/logger';
import { HttpError, asyncHandler, parseId } from '../lib/httpError';
import { redactIntegrationSetting } from '../lib/redact';
import { isAdmin, isAuthenticated } from '../middleware/auth';
import { imageUpload, assertFileKind, cleanupUploadedFile as cleanupTempUpload } from '../middleware/upload';
import { putSetting } from '../services/settings';
import { recordActivity } from '../services/activity';
import {
  AirtableWriteError,
  isImgBBConfigured,
  uploadFileToImgBB,
  uploadUrlToImgBB,
  writeRecordFields,
  type ImgBBImage,
} from '../services/images';

const log = createLogger('imgbb');

/** The only two image slots an article has. */
const IMAGE_FIELDS = ['MainImage', 'instaPhoto'] as const;
type ImageField = (typeof IMAGE_FIELDS)[number];

/** Airtable column that holds the hosted URL for each slot. */
const LINK_FIELD_BY_IMAGE_FIELD: Record<ImageField, string> = {
  MainImage: 'MainImageLink',
  instaPhoto: 'InstaPhotoLink',
};

function parseImageField(value: string): ImageField {
  if ((IMAGE_FIELDS as readonly string[]).includes(value)) return value as ImageField;
  throw HttpError.badRequest("Invalid field name. Must be 'MainImage' or 'instaPhoto'");
}

/**
 * Fails fast when ImgBB is unusable.
 *
 * A missing or disabled key is an operator problem, not a server fault, so it
 * stays a 400 — the same status these routes returned before.
 */
async function requireImgBB(): Promise<void> {
  if (!(await isImgBBConfigured())) {
    throw HttpError.badRequest('ImgBB integration is not enabled or not configured properly');
  }
}

/**
 * Points Airtable and the local record at a freshly hosted image.
 *
 * The local write is best-effort on purpose: Airtable is the source of truth
 * for these fields, and the next sync will reconcile. Failing the request after
 * Airtable has already been updated would be worse than a brief mismatch.
 */
async function linkHostedImage(
  articleId: number,
  externalId: string,
  field: ImageField,
  hosted: ImgBBImage,
): Promise<unknown> {
  const linkField = LINK_FIELD_BY_IMAGE_FIELD[field];

  let airtableResult: unknown;
  try {
    airtableResult = await writeRecordFields(externalId, { [linkField]: hosted.url });
  } catch (error) {
    if (error instanceof AirtableWriteError && error.type === 'UNKNOWN_FIELD_NAME') {
      throw HttpError.badRequest(
        `The field "${linkField}" does not exist in your Airtable table. ` +
          'You need to create a URL or Text field with this name in your Airtable table.',
      );
    }
    throw error;
  }

  const updates: Partial<InsertArticle> =
    field === 'MainImage'
      ? { imageUrl: hosted.url, imageType: 'url' }
      : { instagramImageUrl: hosted.url };

  try {
    await storage.updateArticle(articleId, updates);
  } catch (error) {
    log.error('Airtable was updated but the local article was not', { articleId, field, error });
  }

  await recordActivity({
    action: 'upload',
    resource: 'image',
    resourceId: articleId,
    details: { field, linkField, imgbbId: hosted.id },
  });

  return airtableResult;
}

/** Loads the article and confirms it is backed by an Airtable record. */
async function requireAirtableBackedArticle(articleId: number): Promise<{ externalId: string }> {
  const article = await storage.getArticle(articleId);
  if (!article) throw HttpError.notFound(`Article with ID ${articleId} not found`);
  if (!article.externalId) {
    throw HttpError.badRequest(`Article with ID ${articleId} does not have an Airtable record`);
  }
  return { externalId: article.externalId };
}

export function setupImgBBRoutes(app: Express) {
  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  app.get(
    '/api/imgbb/settings',
    isAuthenticated,
    asyncHandler(async (_req: Request, res: Response) => {
      const settings = await storage.getIntegrationSettings('imgbb');
      // The API key never leaves the server in full; the UI only needs to know
      // that one is configured.
      res.json(settings.map(redactIntegrationSetting));
    }),
  );

  app.post(
    '/api/imgbb/settings/:key',
    isAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const { key } = req.params;
      const { value, enabled } = req.body as { value?: unknown; enabled?: unknown };

      if (typeof value !== 'string') {
        throw HttpError.badRequest('Value is required');
      }

      const existing = await storage.getIntegrationSettingByKey('imgbb', key);
      // An omitted `enabled` must not silently re-enable a disabled key.
      const nextEnabled = typeof enabled === 'boolean' ? enabled : existing?.enabled ?? true;

      // Goes through the settings service rather than `storage` so the cached
      // copy is invalidated — the old handler wrote straight to the database and
      // left uploads using the previous key for up to the cache TTL.
      const saved = await putSetting('imgbb', key, value, nextEnabled);

      await recordActivity({
        action: existing ? 'update' : 'create',
        resource: 'integration_setting',
        resourceId: saved.id,
        userId: req.user?.id,
        details: { service: 'imgbb', key },
      });

      // Redacted on the way out too: echoing the key back would undo the
      // masking the GET endpoint applies.
      res.json(redactIntegrationSetting(saved));
    }),
  );

  // -------------------------------------------------------------------------
  // Upload flows
  // -------------------------------------------------------------------------

  app.post(
    '/api/imgbb/upload-to-airtable/:articleId/:fieldName',
    // Authentication runs before multer so an anonymous caller cannot make the
    // server write their file to disk at all.
    isAuthenticated,
    cleanupTempUpload,
    imageUpload.single('image'),
    asyncHandler(async (req: Request, res: Response) => {
      const articleId = parseId(req.params.articleId, 'article ID');
      const field = parseImageField(req.params.fieldName);

      if (!req.file) throw HttpError.badRequest('No file uploaded');

      await requireImgBB();

      // The declared MIME type is client-controlled; check the actual bytes.
      await assertFileKind(req.file.path, 'image');

      const { externalId } = await requireAirtableBackedArticle(articleId);

      const hosted = await uploadFileToImgBB({
        path: req.file.path,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });

      const airtable = await linkHostedImage(articleId, externalId, field, hosted);

      res.json({
        success: true,
        message: `Image uploaded successfully to ImgBB and then to ${field}`,
        imgbb: { id: hosted.id, url: hosted.url, display_url: hosted.display_url },
        airtable,
      });
    }),
  );

  app.post(
    '/api/imgbb/upload-url-to-airtable/:articleId/:fieldName',
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      const articleId = parseId(req.params.articleId, 'article ID');
      const field = parseImageField(req.params.fieldName);

      const { imageUrl } = req.body as { imageUrl?: unknown };
      if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
        throw HttpError.badRequest('Image URL is required');
      }

      await requireImgBB();

      const { externalId } = await requireAirtableBackedArticle(articleId);

      // ImgBB fetches the URL itself, so nothing is downloaded by this server.
      const hosted = await uploadUrlToImgBB(imageUrl.trim());

      const airtable = await linkHostedImage(articleId, externalId, field, hosted);

      res.json({
        success: true,
        message: `Image URL uploaded successfully to ImgBB and then to ${field}`,
        imgbb: { id: hosted.id, url: hosted.url, display_url: hosted.display_url },
        airtable,
      });
    }),
  );
}
