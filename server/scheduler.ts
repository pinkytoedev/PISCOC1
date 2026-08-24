/**
 * Scheduled publication.
 *
 * A draft that carries a `Scheduled` date goes live on its own once that date
 * passes. One pass per minute, drafts only, processed one at a time.
 *
 * The interesting part is what publishing *means*. This loop used to write
 * `status = published` locally, PATCH a hand-built payload into Airtable and
 * push to Airtable — and nothing else. It never told the live site to drop its
 * cached copy, so a scheduled article kept serving as a draft until something
 * else happened to refresh it. Publication side effects now come from
 * `services/articles`, the same code the editor's Publish button runs, so the
 * two paths cannot drift apart again.
 */

import type { Article } from '@shared/schema';
import { storage } from './storage';
import { createLogger } from './lib/logger';
import { markRecentlyPublished } from './publishState';
import { pushArticleToAirtable } from './integrations/airtable';
import { applyPublicationEffects, publicationEffects } from './services/articles';
import { recordActivity } from './services/activity';

const log = createLogger('scheduler');

/**
 * How far back a pass will reach.
 *
 * Wide enough to catch up on anything missed during a deploy or an outage,
 * narrow enough that a long-forgotten draft with a stale date is left alone.
 */
const CATCH_UP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Lets boot finish before the first pass competes with it for the database. */
const INITIAL_DELAY_MS = 5_000;

/**
 * Reentrancy guard. A pass can outlive its interval — each article costs at
 * least one Airtable round trip — and two overlapping passes would publish the
 * same article twice.
 */
let isRunning = false;

let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Reads the scheduled publication time.
 *
 * There is deliberately no fallback to `publishedAt`: a draft that was once
 * published still carries that timestamp, and treating it as a schedule would
 * silently re-publish drafts on the next pass.
 */
function parseScheduledDate(article: Article): Date | null {
  if (!article.Scheduled) return null;
  // Airtable hands this over as free text, so an unparseable cell is expected
  // rather than exceptional.
  const when = new Date(article.Scheduled);
  return Number.isNaN(when.getTime()) ? null : when;
}

/** Whether a draft is due to be published on this pass. */
function isDue(article: Article, now: Date, cutoff: Date): boolean {
  // The Republished flag marks an article that is deliberately held as a draft.
  if (article.republished) return false;

  // A set `publishedAt` means the article has been live before. This guards
  // locally-edited articles: if a published article is reverted to draft
  // through the UI, `publishedAt` survives and the scheduler leaves it alone.
  // The guard does NOT cover Airtable-synced drafts — `syncArticlesFromAirtable`
  // clears `publishedAt` for every unfinished record, so a previously published
  // article that re-enters through a sync arrives here with `publishedAt` null.
  // The `republished` flag above is what protects those.
  if (article.publishedAt) return false;

  // A re-upload session has intentionally taken the article offline while its
  // content is replaced; publishing now would serve the half-updated version.
  if (article.isReuploading) return false;

  const when = parseScheduledDate(article);
  return when !== null && when <= now && when >= cutoff;
}

/**
 * Mirrors a freshly published article into Airtable and reports the record id.
 *
 * This is run here rather than left to `applyPublicationEffects` because the
 * scheduler needs to know whether the write landed: only a confirmed
 * `Finished = true` may mark the record as recently published, and that mark is
 * what stops the next sync reading a stale `Finished = false` and reverting the
 * article to draft. Failing to push and marking anyway would paper over the
 * disagreement for five minutes and then revert regardless.
 */
async function pushToAirtable(article: Article): Promise<string | null> {
  try {
    // Creates the record when the article has no external id yet, so a
    // locally-authored article still ends up in the base. The field mapping is
    // `airtable/mappers`, shared with the editor push — the scheduler used to
    // keep its own copy of it, which is how the two ended up sending different
    // sets of fields.
    const result = await pushArticleToAirtable(article.id);
    return result.response.records[0]?.id ?? null;
  } catch (error) {
    // Best-effort: the article is already published locally, and a later manual
    // push or sync can still reconcile the base.
    log.error('Airtable push failed for scheduled article', {
      articleId: article.id,
      error,
    });
    return null;
  }
}

/** Publishes one due article and runs the effects that implies. */
async function publishArticle(article: Article): Promise<void> {
  const published = await storage.updateArticle(article.id, {
    status: 'published',
    finished: true,
    // `isDue` has already established that `publishedAt` is unset; the
    // coalesce keeps an existing timestamp authoritative if that ever changes.
    publishedAt: article.publishedAt ?? new Date(),
  });

  if (!published) {
    log.error('Failed to mark article published', { articleId: article.id });
    return;
  }

  const externalId = await pushToAirtable(published);
  if (externalId) markRecentlyPublished(externalId);

  // The remaining effects — refreshing the live site —
  // are decided by the same function the editor path uses. Airtable is excluded
  // because it has just been handled above.
  const effects = publicationEffects(article, published);
  await applyPublicationEffects(published, { ...effects, pushToAirtable: false });

  await recordActivity({
    action: 'publish',
    resource: 'article',
    resourceId: published.id,
    details: { via: 'scheduler', scheduledFor: article.Scheduled ?? undefined },
  });

  log.info('Published scheduled article', { articleId: published.id, externalId });
}

async function checkAndPublishDueArticles(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  const startedAt = Date.now();

  try {
    // Only drafts can become due, so the scan stays small on a large base.
    const drafts = await storage.getArticlesByStatus('draft');
    if (drafts.length === 0) return;

    const now = new Date();
    const cutoff = new Date(now.getTime() - CATCH_UP_WINDOW_MS);
    const due = drafts.filter((article) => isDue(article, now, cutoff));

    if (due.length === 0) return;

    log.info('Publishing due articles', { count: due.length });

    // Sequential on purpose. Each article costs several Airtable calls and the
    // base's rate limit (5 requests/second) is shared with the sync routines.
    for (const article of due) {
      try {
        await publishArticle(article);
      } catch (error) {
        // One bad article must not strand the rest of the batch.
        log.error('Auto-publish failed', { articleId: article.id, error });
      }
    }
  } catch (error) {
    log.error('Scheduler pass failed', { error });
  } finally {
    isRunning = false;
    log.debug('Scheduler pass complete', { durationMs: Date.now() - startedAt });
  }
}

export function startPublishScheduler(intervalMs: number = 60000) {
  if (intervalHandle) return; // already started

  log.info('Starting publish scheduler', { intervalMs });

  setTimeout(() => void checkAndPublishDueArticles(), INITIAL_DELAY_MS);
  intervalHandle = setInterval(() => void checkAndPublishDueArticles(), intervalMs);
}

export function stopPublishScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
