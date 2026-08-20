/**
 * Instagram integration.
 *
 *   client.ts    one Graph API client — version, auth, timeouts, rate limiting,
 *                error mapping, response caching
 *   media.ts     account discovery, media reads, the container/publish flow,
 *                and `postArticleToInstagram`
 *   images.ts    getting an image somewhere Meta will fetch it from
 *   webhooks.ts  hub verification, inbound events, subscription management
 *   routes.ts    thin HTTP handlers
 *
 * `server/integrations/instagram.ts` and `instagramRoutes.ts` remain as
 * re-export shims so existing import paths keep resolving.
 */

export {
  GRAPH_API_VERSION,
  GraphApiError,
  clearInstagramCaches,
  getAppAccessToken,
  getUserAccessToken,
  graphRequest,
  toHttpError,
} from './client';

export {
  getInstagramAccountId,
  getInstagramBusinessAccount,
  getInstagramMedia,
  getInstagramMediaById,
  getUserPages,
  normalizeMediaLimit,
  postArticleToInstagram,
  publishImage,
  type ArticlePostResult,
  type InstagramMedia,
  type PostableArticle,
  type PublishResult,
} from './media';

export { cleanupHostedImages, hostImageLocally, imageCandidates } from './images';

export {
  WEBHOOK_FIELD_GROUPS,
  getWebhookLogs,
  getWebhookSubscriptions,
  processWebhookPayload,
  subscribeToWebhook,
  testWebhookConnection,
  unsubscribeFromWebhook,
  verifyHubChallenge,
  verifyWebhookSignature,
  type WebhookConnectionTest,
  type WebhookPayload,
  type WebhookSubscription,
} from './webhooks';

export { setupInstagramRoutes } from './routes';
