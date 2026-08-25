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
function webhookTarget(): { url: string; isSelf: boolean } | null {
  if (env.productionWebhookUrl) return { url: env.productionWebhookUrl, isSelf: false };
  if (env.publicDomain) {
    return { url: `https://${env.publicDomain}/api/webhooks/article-published`, isSelf: true };
  }
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
  const target = webhookTarget();

  if (!target) {
    log(
      `No webhook target configured (set PRODUCTION_WEBHOOK_URL); skipping refresh for article ${article.id}`,
      'webhook',
    );
    return;
  }

  // The fallback target is this server's own `/api/webhooks/article-published`,
  // which `verifyWebhookSecret` rejects without the header — so setting
  // WEBHOOK_SECRET used to silently 401 every refresh it was meant to protect.
  // The secret is only ever sent to ourselves; an external PRODUCTION_WEBHOOK_URL
  // is a third-party host and must not receive our inbound secret.
  const headers =
    target.isSelf && env.webhookSecret ? { 'x-webhook-secret': env.webhookSecret } : undefined;

  try {
    const response = await axios.post(
      target.url,
      {
        articleId: article.id,
        status: article.status,
        reason,
        source: 'cms',
      },
      { timeout: 10_000, headers },
    );
    log(`Site refresh for article ${article.id} (${reason}): ${response.status}`, 'webhook');
  } catch (error) {
    const detail = axios.isAxiosError(error)
      ? `${error.response?.status ?? 'no response'} ${error.message}`
      : String(error);
    log(`Site refresh failed for article ${article.id} (${reason}): ${detail}`, 'webhook');
  }
}
