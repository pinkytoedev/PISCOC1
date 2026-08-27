/**
 * ImgBB integration endpoints.
 *
 * One thing happens here: the "host the image on ImgBB, then point Airtable at
 * it" flow that the dashboard uses for an article's cover and Instagram images.
 * The API key is not managed here — it comes from `IMGBB_API_KEY`.
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
import { isAuthenticated } from '../middleware/auth';
import { imageUpload, assertFileKind, cleanupUploadedFile as cleanupTempUpload } from '../middleware/upload';
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
 * A missing key is an operator problem, not a server fault, so it stays a 400 —
 * the same status these routes returned before. The message names the variable
 * because it is no longer something the caller can fix from inside the CMS.
 */
function requireImgBB(): void {
  if (!isImgBBConfigured()) {
    throw HttpError.badRequest('ImgBB is not configured: IMGBB_API_KEY is not set on the server');
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
  // There are no settings routes here. The API key comes from `IMGBB_API_KEY`
  // and nowhere else, so there is nothing for the CMS to read or write — the
  // pair of endpoints that used to store it in `integration_settings` are gone
  // along with the page that called them.

  /**
   * Whether uploads should be routed through ImgBB.
   *
   * Deliberately separate from `/api/integration-status`: that runs live probes
   * against Airtable and ImgBB with a five-second timeout each, and the article
   * dialog asks this question every time it opens. A slow third party there
   * would leave the dialog believing ImgBB is off and silently push the image
   * into Airtable as an attachment instead. This reads one environment variable.
   */
  app.get(
    '/api/imgbb/status',
    isAuthenticated,
    (_req: Request, res: Response) => {
      res.json({ configured: isImgBBConfigured() });
    },
  );

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

      requireImgBB();

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

      requireImgBB();

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
