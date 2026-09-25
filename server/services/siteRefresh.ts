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
 * Never throws: a refresh failure should not fail the write that triggered it.
 * The outcome is logged instead.
 *
 * It does, however, block. Every caller awaits it, and the POST carries a 10s
 * timeout, so an unresponsive webhook target adds up to 10 seconds to the
 * request that triggered it.
 */
export async function notifyArticleChanged(
  article: Article,
  reason: ChangeReason,
): Promise<void> {
  const target = webhookTarget();

  if (!target) {
    log(
      `No webhook target configured (set PRODUCTION_WEBHOOK_URL, or RAILWAY_PUBLIC_DOMAIN to fall back to this server); skipping refresh for article ${article.id}`,
      'webhook',
    );
    return;
  }

  // Each target gets the secret it expects. The fallback target is this
  // server's own `/api/webhooks/article-published`, which `verifyWebhookSecret`
  // checks against WEBHOOK_SECRET. An external PRODUCTION_WEBHOOK_URL (the live
  // site) gets its own SITE_WEBHOOK_SECRET instead, so our inbound secret never
  // leaves this server. The site rejects unauthenticated refreshes in
  // production, so without it every refresh used to fail with a 401/503.
  const secret = target.isSelf ? env.webhookSecret : env.siteWebhookSecret;
  if (!target.isSelf && !secret) {
    log(
      `SITE_WEBHOOK_SECRET is not set; the live site will likely reject the refresh for article ${article.id}`,
      'webhook',
    );
  }
  const headers = secret ? { 'x-webhook-secret': secret } : undefined;

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
