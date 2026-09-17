/**
 * Article domain operations.
 *
 * Updating an article is not just a database write: depending on how its
 * publication state changes, it may also need to be pushed to Airtable and
 * announced to the live site so caches drop the old copy.
 *
 * Deciding those effects here rather than inside `PUT /api/articles/:id` is
 * what keeps them consistent across every path that changes publication state:
 * the editor, the scheduler and the re-upload flow all come through
 * `publicationEffects` / `applyPublicationEffects`.
 */

import type { Article, InsertArticle } from '@shared/schema';
import { storage } from '../storage';
import { createLogger } from '../lib/logger';
import { HttpError } from '../lib/httpError';
import { recordActivity } from './activity';
import { notifyArticleChanged } from './siteRefresh';
import { getAirtableConfig } from '../lib/airtableClient';
import { deleteAirtableRecord, pushArticleToAirtable } from '../integrations/airtable';

const log = createLogger('articles');

/**
 * What a state change implies, decided once and acted on in order.
 *
 * The two flags are modelled separately because callers override them
 * independently — the scheduler passes `pushToAirtable: false` because it has
 * already pushed. `publicationEffects` itself computes both from the same
 * expression, so as *derived* values they never differ.
 */
interface PublicationEffects {
  /** Mirror the article into Airtable so a later sync does not undo the change. */
  pushToAirtable: boolean;
  /** Tell the live site to drop its cached copy. */
  refreshSite: boolean;
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

  const becameUnpublished = wasPublished && !isPublished;

  return {
    // Any change to a live article, in either direction, has to reach Airtable
    // before the next sync runs — otherwise the sync reverts it.
    pushToAirtable: isPublished || becameUnpublished || forceRefresh,
    refreshSite: isPublished || becameUnpublished || forceRefresh,
  };
}

/**
 * Runs the effects of a publication change.
 *
 * Every step is best-effort: the article has already been written, so a failure
 * in Airtable or the site webhook is logged rather than surfaced as a failed
 * request.
 */
export async function applyPublicationEffects(
  article: Article,
  effects: PublicationEffects,
  userId?: number,
): Promise<void> {
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
 * Deletes an article locally, attempting to remove its Airtable record first.
 *
 * Airtable goes first so that the common case — both deletes succeed — cannot
 * leave a record the next sync would re-import. It is not transactional: if
 * the Airtable delete fails the local delete still proceeds (see the catch
 * below), leaving the article gone locally and orphaned in Airtable.
 *
 * Known gap: this does not revoke the article's outstanding contributor upload
 * links. `revokeArticleTokens` in `services/uploadTokens` exists for that and
 * is not called here.
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
