/**
 * Article domain operations.
 *
 * Updating an article is not just a database write: depending on how its
 * publication state changes, it may also need to be pushed to Airtable, posted
 * to Instagram, and announced to the live site so caches drop the old copy.
 *
 * All of that used to sit inline in `PUT /api/articles/:id`, roughly 160 lines
 * of nested conditionals and try/catch inside the route handler. That is why
 * the same side effects were missing from every other path that changes
 * publication state — the scheduler and the re-upload flow both bypassed them.
 * Deciding the effects here means every caller gets the same behaviour.
 */

import type { Article, InsertArticle } from '@shared/schema';
import { storage } from '../storage';
import { createLogger } from '../lib/logger';
import { HttpError } from '../lib/httpError';
import { recordActivity } from './activity';
import { notifyArticleChanged } from './siteRefresh';
import { getAirtableConfig } from '../lib/airtableClient';
import { deleteAirtableRecord, pushArticleToAirtable } from '../integrations/airtable';
import { postArticleToInstagram } from '../integrations/instagram';

const log = createLogger('articles');

/** What a state change implies, decided once and acted on in order. */
interface PublicationEffects {
  /** Mirror the article into Airtable so a later sync does not undo the change. */
  pushToAirtable: boolean;
  /** Tell the live site to drop its cached copy. */
  refreshSite: boolean;
  /** Announce a newly published article on Instagram. */
  postToInstagram: boolean;
}

/**
 * Works out which side effects a transition requires.
 *
 * `forceRefresh` covers the case where an editor saves a draft that the backend
 * does not otherwise see as a transition, but the site still needs to drop it.
 */
export function publicationEffects(
  previous: Article,
  next: Article,
  forceRefresh = false,
): PublicationEffects {
  const wasPublished = previous.status === 'published';
  const isPublished = next.status === 'published';

  const becamePublished = isPublished && !wasPublished;
  const becameUnpublished = wasPublished && !isPublished;

  return {
    // Any change to a live article, in either direction, has to reach Airtable
    // before the next sync runs — otherwise the sync reverts it.
    pushToAirtable: isPublished || becameUnpublished || forceRefresh,
    refreshSite: isPublished || becameUnpublished || forceRefresh,
    // Only on the transition, so re-saving a published article does not post
    // to Instagram again.
    postToInstagram: becamePublished,
  };
}

export interface InstagramOutcome {
  posted: boolean;
  mediaId?: string;
  error?: string;
}

/**
 * Runs the effects of a publication change.
 *
 * Every step is best-effort: the article has already been written, so a failure
 * in Airtable, Instagram or the site webhook is logged rather than surfaced as
 * a failed request. The Instagram outcome is returned because the UI shows it.
 */
export async function applyPublicationEffects(
  article: Article,
  effects: PublicationEffects,
  userId?: number,
): Promise<InstagramOutcome | undefined> {
  if (effects.pushToAirtable) {
    try {
      await pushArticleToAirtable(article.id, userId);
    } catch (error) {
      log.error('Airtable push failed', { articleId: article.id, error });
    }
  }

  if (effects.refreshSite) {
    await notifyArticleChanged(
      article,
      article.status === 'published' ? 'article-published' : 'article-unpublished',
    );
  }

  if (!effects.postToInstagram) return undefined;

  try {
    const result = await postArticleToInstagram(article);
    if (result.success) {
      log.info('Posted article to Instagram', { articleId: article.id });
      return { posted: true, mediaId: result.mediaId };
    }
    log.warn('Instagram post failed', { articleId: article.id, error: result.error });
    return { posted: false, error: result.error };
  } catch (error) {
    log.error('Instagram post threw', { articleId: article.id, error });
    return { posted: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Normalises the `republished` flag from a request body.
 *
 * Airtable's checkbox arrives as a boolean, the form posts the string "true",
 * and setting it means the article is deliberately held back as a draft.
 */
export function applyRepublishedFlag(
  body: Record<string, unknown>,
  patch: Partial<InsertArticle>,
): Partial<InsertArticle> {
  const raw = body.republished;
  if (raw === true || raw === 'true') {
    return { ...patch, status: 'draft', finished: false, republished: true };
  }
  if (raw === false || raw === 'false') {
    return { ...patch, republished: false };
  }
  return patch;
}

/**
 * Deletes an article locally, removing its Airtable record first.
 *
 * Airtable is cleared first so a failure leaves the two stores consistent: the
 * article still exists in both. Doing it the other way round can orphan a
 * record that the next sync would then re-import.
 */
export async function deleteArticleEverywhere(
  articleId: number,
  userId?: number,
): Promise<void> {
  const article = await storage.getArticle(articleId);
  if (!article) throw HttpError.notFound('Article not found');

  if (article.externalId && article.source === 'airtable') {
    try {
      const config = await getAirtableConfig();
      if (config) {
        await deleteAirtableRecord(
          config.apiKey,
          config.baseId,
          config.articlesTable,
          article.externalId,
        );
        log.info('Deleted Airtable record', {
          articleId,
          externalId: article.externalId,
        });
      }
    } catch (error) {
      // Proceed with the local delete regardless; leaving the article in the
      // CMS because Airtable is unreachable would be worse.
      log.error('Airtable delete failed; continuing with local delete', {
        articleId,
        error,
      });
    }
  }

  if (!(await storage.deleteArticle(articleId))) {
    throw HttpError.internal('Failed to delete article');
  }

  await recordActivity({
    action: 'delete',
    resource: 'article',
    resourceId: articleId,
    userId,
    details: { title: article.title, externalId: article.externalId ?? undefined },
  });

  await notifyArticleChanged(article, 'article-unpublished');
}
