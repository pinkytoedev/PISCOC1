/**
 * Article image uploads into Airtable.
 *
 * Two routes share this: one takes a multipart file, the other a URL. Both end
 * up writing a *link* field rather than an attachment, because Airtable stopped
 * accepting third-party URLs in attachment fields — `MainImage` and
 * `instaPhoto` are still accepted as inputs and mapped to their link twins.
 *
 * When ImgBB is configured the image is rehosted there first, so the URL
 * Airtable stores outlives whatever produced it.
 */

import type { Article, InsertArticle } from '@shared/schema';
import { storage } from '../../storage';
import { HttpError } from '../../lib/httpError';
import { createLogger } from '../../lib/logger';
import { recordActivity } from '../../services/activity';
import { isSettingEnabled } from '../../services/settings';
import {
  cleanupUploadedFile,
  uploadImageToAirtable,
  uploadImageUrlAsLinkField,
  uploadImageUrlToAirtable,
} from '../../utils/imageUploader';
import { uploadImageToImgBB, uploadImageUrlToImgBB } from '../../utils/imgbbUploader';

const log = createLogger('airtable:images');

/** The field names the endpoints accept. */
const IMAGE_FIELDS = ['MainImage', 'MainImageLink', 'instaPhoto', 'InstaPhotoLink'] as const;
export type ImageField = (typeof IMAGE_FIELDS)[number];

/** Attachment field → the link field that actually gets written. */
const LINK_FIELD: Record<ImageField, 'MainImageLink' | 'InstaPhotoLink'> = {
  MainImage: 'MainImageLink',
  MainImageLink: 'MainImageLink',
  instaPhoto: 'InstaPhotoLink',
  InstaPhotoLink: 'InstaPhotoLink',
};

export function parseImageField(value: string | undefined): ImageField {
  if (!value || !IMAGE_FIELDS.includes(value as ImageField)) {
    throw HttpError.badRequest(
      "Invalid field name. Must be 'MainImage', 'MainImageLink', 'instaPhoto', or 'InstaPhotoLink'",
    );
  }
  return value as ImageField;
}

/** Loads an article that is actually backed by an Airtable record. */
export async function requireAirtableArticle(articleId: number): Promise<Article> {
  const article = await storage.getArticle(articleId);
  if (!article) throw HttpError.notFound('Article not found');
  if (article.source !== 'airtable' || !article.externalId) {
    throw HttpError.badRequest('This article is not from Airtable');
  }
  return article;
}

/**
 * Mirrors the uploaded URL onto the local article.
 *
 * Both spellings of each field update the same column: the upload-image
 * endpoint used to accept `MainImageLink` and then write nothing locally, so
 * Airtable and the dashboard disagreed about the image until the next sync.
 */
async function applyToArticle(articleId: number, field: ImageField, url: string): Promise<void> {
  const update: Partial<InsertArticle> = LINK_FIELD[field] === 'MainImageLink'
    ? { imageUrl: url, imageType: 'url' }
    : { instagramImageUrl: url };
  await storage.updateArticle(articleId, update);
}

interface UploadedFile {
  path: string;
  filename: string;
  mimetype: string;
  size: number;
}

export interface FileUploadResult {
  message: string;
  imgbb?: { id: string; url: string; display_url: string };
  airtable?: unknown;
  attachment?: unknown;
}

/**
 * Uploads a file the client sent as multipart form data.
 *
 * The temporary file is removed in a `finally`: every earlier exit path from
 * this handler left it on disk when an upload threw.
 */
export async function uploadArticleImageFile(
  article: Article,
  field: ImageField,
  file: UploadedFile,
  userId?: number,
): Promise<FileUploadResult> {
  const recordId = article.externalId as string;

  try {
    if (await isSettingEnabled('imgbb', 'api_key')) {
      const imgbb = await uploadImageToImgBB(file);
      if (!imgbb) throw HttpError.internal('Failed to upload image to ImgBB');

      const airtable = await uploadImageUrlToAirtable(imgbb.url, recordId, field, file.filename);
      if (!airtable) {
        throw new HttpError(500, 'Image uploaded to ImgBB but failed to update Airtable');
      }

      await applyToArticle(article.id, field, imgbb.url);
      await recordActivity({
        userId,
        action: 'upload',
        resource: 'image',
        resourceId: article.id,
        details: { field, via: 'imgbb', imgbbId: imgbb.id, filename: file.filename },
      });

      return {
        message: `Image uploaded successfully to ImgBB and then to ${field}`,
        imgbb: { id: imgbb.id, url: imgbb.url, display_url: imgbb.display_url },
        airtable,
      };
    }

    const attachment = await uploadImageToAirtable(file, recordId, field);
    if (!attachment) throw HttpError.internal('Failed to upload image to Airtable');

    if (attachment.url) await applyToArticle(article.id, field, attachment.url);
    await recordActivity({
      userId,
      action: 'upload',
      resource: 'image',
      resourceId: article.id,
      details: { field, via: 'airtable', filename: file.filename },
    });

    return { message: `Image uploaded successfully to ${field}`, attachment };
  } finally {
    cleanupUploadedFile(file.path);
  }
}

export interface UrlUploadResult {
  message: string;
  success?: boolean;
  fieldName?: string;
  originalField?: string;
  imageUrl?: string;
  imgbb?: { id: string; url: string; display_url: string };
  airtable?: unknown;
}

/** Points an article's Airtable link field at an already-hosted image. */
export async function uploadArticleImageUrl(
  article: Article,
  field: ImageField,
  imageUrl: string,
  filename: string,
  userId?: number,
): Promise<UrlUploadResult> {
  const recordId = article.externalId as string;
  const targetField = LINK_FIELD[field];

  if (await isSettingEnabled('imgbb', 'api_key')) {
    const imgbb = await uploadImageUrlToImgBB(imageUrl, filename);
    if (!imgbb) throw HttpError.internal('Failed to upload image URL to ImgBB');

    const ok = await uploadImageUrlAsLinkField(imgbb.url, recordId, targetField);
    if (!ok) throw new HttpError(500, 'Image uploaded to ImgBB but failed to update Airtable');

    await applyToArticle(article.id, field, imgbb.url);
    await recordActivity({
      userId,
      action: 'upload',
      resource: 'image',
      resourceId: article.id,
      details: { field: targetField, via: 'imgbb', imgbbId: imgbb.id, filename },
    });

    return {
      message: `Image URL uploaded successfully to ImgBB and then to ${field}`,
      imgbb: { id: imgbb.id, url: imgbb.url, display_url: imgbb.display_url },
      airtable: ok,
    };
  }

  const ok = await uploadImageUrlAsLinkField(imageUrl, recordId, targetField);
  if (!ok) throw HttpError.internal('Failed to upload image URL to Airtable');

  await applyToArticle(article.id, field, imageUrl);
  await recordActivity({
    userId,
    action: 'upload',
    resource: 'image',
    resourceId: article.id,
    details: { field: targetField, via: 'airtable', filename },
  });

  log.info('Set Airtable image link', { articleId: article.id, field: targetField });

  return {
    message: `Image URL uploaded successfully to ${targetField}`,
    success: true,
    fieldName: targetField,
    originalField: field,
    imageUrl,
  };
}
