/**
 * Translation between the local schema and Airtable field names.
 *
 * Kept apart from the transport so the field mapping — the part that breaks
 * when someone renames a column in the base — is readable in one screen.
 */

import type { Article, CarouselQuote, TeamMember } from '@shared/schema';
import { storage } from '../../storage';
import { createLogger } from '../../lib/logger';
import type {
  AirtableArticleFieldsWrite,
  AirtableCarouselQuoteFields,
  AirtableTeamMemberFieldsWrite,
} from './types';

const log = createLogger('airtable:mappers');

/**
 * Builds the Airtable payload for an article.
 *
 * `Finished` is derived strictly from `status`: the checkbox is what the
 * auto-publisher reads back, so any other source of truth would let the two
 * systems disagree about whether an article is live.
 */
export async function convertToAirtableFormat(article: Article): Promise<AirtableArticleFieldsWrite> {
  const fields: AirtableArticleFieldsWrite = {
    Name: article.title,
    Body: article.content ?? '',
    Description: article.description ?? '',
    Featured: article.featured === 'yes',
    Finished: article.status === 'published',
    Hashtags: article.hashtags ?? '',
    message_sent: article.status === 'published',
    _updatedTime: new Date().toISOString(),
    Date: article.date || new Date().toISOString(),
    Scheduled: resolveScheduled(article),
    // A 'Republished' key used to be sent here and 422'd every push: the field
    // does not exist in the base.
  };

  const wantsAuthor = Boolean(article.author) && article.author !== 'Anonymous';
  const wantsPhoto = Boolean(article.photo) && article.photo !== 'none';

  // Author and photo credit are both links into the Teams table, so one read
  // serves both; the old code fetched the whole table twice per push.
  if (wantsAuthor || wantsPhoto) {
    const teamMembers = await storage.getTeamMembers();

    const author = wantsAuthor
      ? teamMembers.find((member) => member.name === article.author)
      : undefined;
    if (author?.externalId) fields.Author = [author.externalId];

    const photo = wantsPhoto
      ? teamMembers.find((member) => member.name === article.photo)
      : undefined;
    if (photo?.externalId) fields.Photo = [photo.externalId];
  }

  if (!wantsPhoto) {
    // An empty array clears the link; omitting the key would leave a stale one.
    fields.Photo = [];
  }

  if (article.imageUrl) {
    fields.MainImageLink = article.imageUrl;
  }

  // Attachment fields reject third-party URLs, so images travel as plain link
  // fields. Instagram-sourced articles fall back to the main image.
  const instagramImage = article.instagramImageUrl
    || (article.source === 'instagram' ? article.imageUrl : null);
  if (instagramImage) {
    fields.InstaPhotoLink = instagramImage;
  }

  log.debug('Converted article for Airtable', {
    articleId: article.id,
    status: article.status,
    finished: fields.Finished,
    hasMainImage: Boolean(fields.MainImageLink),
    hasInstaImage: Boolean(fields.InstaPhotoLink),
  });

  return fields;
}

/**
 * Picks the value for the `Scheduled` cell.
 *
 * `publishedAt` is only honoured for articles that are actually published — a
 * draft carrying a past `publishedAt` would otherwise be picked up by the
 * auto-publisher and go live on the next pass.
 */
function resolveScheduled(article: Article): string | null {
  if (article.Scheduled) return article.Scheduled;
  if (article.publishedAt && article.status === 'published') {
    return new Date(article.publishedAt).toISOString();
  }
  return null;
}

/**
 * A quote as it may arrive: either a stored row or a request body carrying only
 * the Airtable-named columns.
 */
export type CarouselQuoteInput = Partial<
  Pick<CarouselQuote, 'main' | 'philo' | 'carousel' | 'quote'>
>;

/**
 * Local quotes keep the Airtable column names (`main`/`philo`) alongside their
 * own (`carousel`/`quote`); rows created before that split only have the latter.
 *
 * Both columns are always emitted, empty string included. A PATCH ignores keys
 * it is not given, so returning `undefined` for a value the editor cleared left
 * the old text sitting in Airtable and the two stores disagreeing.
 */
export function convertCarouselQuoteToAirtableFormat(
  quote: CarouselQuoteInput,
): AirtableCarouselQuoteFields {
  return {
    main: quote.main || quote.carousel || '',
    philo: quote.philo || quote.quote || '',
  };
}

/**
 * Seam for normalising a role to an option the base's multi-select accepts.
 *
 * The lookup table this replaced mapped all fourteen of its keys to themselves,
 * so it never changed a value — it is an identity function and is kept as the
 * one place to add a real mapping when the base's options next diverge.
 */
export function mapRoleToAirtable(role: string): string {
  return role;
}

/**
 * Builds the Airtable payload for a team member.
 *
 * The photo is not sent: the Teams table stores it as `PhotoSub`, a link into
 * another table, and resolving it needs a record id we do not hold locally.
 */
export function convertTeamMemberToAirtableFormat(
  member: Pick<TeamMember, 'name' | 'role' | 'bio'>,
): AirtableTeamMemberFieldsWrite {
  return {
    Name: member.name,
    Role: member.role ? [mapRoleToAirtable(member.role)] : [],
    Bio: member.bio,
  };
}
