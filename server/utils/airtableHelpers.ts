/**
 * Image extraction from Airtable article records.
 *
 * Airtable stopped accepting third-party URLs in attachment fields, so the base
 * gained plain link fields (`MainImageLink`, `InstaPhotoLink`) alongside the
 * original attachments. Records written before that change still only have the
 * attachment, so both have to be read — link field first, since it is the one
 * the application now writes.
 */

import type { AirtableAttachment } from '../integrations/airtable/types';

/** Fields of an Airtable record, as far as image lookup is concerned. */
type ImageFields = Record<string, unknown>;

function attachmentUrl(attachment: AirtableAttachment): string | null {
  if (attachment.url) return attachment.url;

  // Thumbnails are the fallback for attachments whose original has expired.
  const thumbnails = attachment.thumbnails;
  return thumbnails?.full?.url ?? thumbnails?.large?.url ?? thumbnails?.small?.url ?? null;
}

/**
 * Best available URL for one logical image, or null when the record has none.
 */
export function getBestImageUrl(
  fields: ImageFields,
  attachmentFieldName: string,
  linkFieldName: string,
): string | null {
  const link = fields[linkFieldName];
  if (typeof link === 'string' && link) return link;

  const attachments = fields[attachmentFieldName];
  if (!Array.isArray(attachments) || attachments.length === 0) return null;

  return attachmentUrl(attachments[0] as AirtableAttachment);
}

export interface ArticleImages {
  main: string | null;
  instagram: string | null;
}

/**
 * Both of an article record's images.
 *
 * The Instagram image doubles as the main image when the record has no main
 * one, which is how Instagram-sourced articles end up with a cover.
 */
export function getArticleImages(fields: ImageFields): ArticleImages {
  const instagram = getBestImageUrl(fields, 'instaPhoto', 'InstaPhotoLink');
  const main = getBestImageUrl(fields, 'MainImage', 'MainImageLink') ?? instagram;
  return { main, instagram };
}
