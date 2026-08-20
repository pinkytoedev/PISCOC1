/**
 * Live-site cache invalidation.
 *
 * The public site caches published articles, so any change to what is live has
 * to tell it to refresh. That notification used to be written inline in
 * `PUT /api/articles/:id` only, which meant every other path that changed
 * publication state — the scheduler, and the whole re-upload flow — left the
 * site serving stale content.
 */

import axios from 'axios';
import type { Article } from '@shared/schema';
import { env } from '../lib/env';
import { log } from '../vite';

export type ChangeReason =
  | 'article-updated'
  | 'article-published'
  | 'article-unpublished'
  | 'scheduled-publish'
  | 'reupload-started'
  | 'reupload-completed'
  | 'reupload-cancelled';

/**
 * Resolves the webhook target from configuration only.
 *
 * The previous implementation fell back to `req.get('host')`, so a request with
 * a forged Host header could make the server POST to an arbitrary address.
 * Configuration is the only trustworthy source for an outbound URL.
 */
function webhookUrl(): string | null {
  if (env.productionWebhookUrl) return env.productionWebhookUrl;
  if (env.publicDomain) return `https://${env.publicDomain}/api/webhooks/article-published`;
  return null;
}

/**
 * Notifies the live site that an article changed.
 *
 * Never throws and never blocks the caller's response: a refresh failure should
 * not fail the write that triggered it. The outcome is logged instead.
 */
export async function notifyArticleChanged(
  article: Article,
  reason: ChangeReason,
): Promise<void> {
  const url = webhookUrl();

  if (!url) {
    log(
      `No webhook target configured (set PRODUCTION_WEBHOOK_URL); skipping refresh for article ${article.id}`,
      'webhook',
    );
    return;
  }

  try {
    const response = await axios.post(
      url,
      {
        articleId: article.id,
        status: article.status,
        reason,
        source: 'cms',
      },
      { timeout: 10_000 },
    );
    log(`Site refresh for article ${article.id} (${reason}): ${response.status}`, 'webhook');
  } catch (error) {
    const detail = axios.isAxiosError(error)
      ? `${error.response?.status ?? 'no response'} ${error.message}`
      : String(error);
    log(`Site refresh failed for article ${article.id} (${reason}): ${detail}`, 'webhook');
  }
}
