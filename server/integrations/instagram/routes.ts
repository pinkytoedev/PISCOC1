/**
 * HTTP surface for the Instagram integration.
 *
 * Handlers are deliberately thin: validate input, call one function, shape the
 * reply. Everything else lives in `client`, `media` and `webhooks`.
 *
 * Two conventions are load-bearing and should not be "cleaned up":
 *
 *   - The callback routes are unauthenticated by design. Meta calls them with
 *     no session; the GET is the hub challenge and the POST is signature-checked.
 *   - A few replies carry a top-level `code`. The settings page branches on it
 *     (`NO_ACCESS_TOKEN` puts the page into its "connect Facebook" state rather
 *     than showing an error), and the central error handler nests everything
 *     under `details`, so those replies are written out directly instead of
 *     being thrown as `HttpError`.
 */

import type { Express, Request, Response } from 'express';
import { createLogger } from '../../lib/logger';
import { HttpError, asyncHandler } from '../../lib/httpError';
import { isAdmin, isAuthenticated } from '../../middleware/auth';
import { putSetting } from '../../services/settings';
import { recordActivity } from '../../services/activity';
import { clearInstagramCaches, getUserAccessToken, toHttpError } from './client';
import {
  getInstagramAccountId,
  getInstagramMedia,
  getInstagramMediaById,
  normalizeMediaLimit,
  publishImage,
} from './media';
import {
  WEBHOOK_FIELD_GROUPS,
  getWebhookLogs,
  getWebhookSubscriptions,
  processWebhookPayload,
  recordInvalidSignature,
  recordProcessingError,
  subscribeToWebhook,
  testWebhookConnection,
  unsubscribeFromWebhook,
  verifyHubChallenge,
  verifyWebhookSignature,
} from './webhooks';

const log = createLogger('instagram:routes');

/** Reply the settings page recognises as "Facebook is not connected yet". */
const NO_ACCESS_TOKEN = {
  error: 'Authorization required',
  message:
    'Facebook access token is required. Please log in with Facebook and try again.',
  code: 'NO_ACCESS_TOKEN',
} as const;

/** Instagram media IDs are 17-18 digit strings — too large for `parseId`. */
const MEDIA_ID_PATTERN = /^\d{1,25}$/;

export function setupInstagramRoutes(app: Express) {
  // -------------------------------------------------------------------------
  // Webhook callback — called by Meta, must stay unauthenticated
  // -------------------------------------------------------------------------

  // Hub verification challenge, issued when a callback URL is registered.
  app.get(
    '/api/instagram/webhooks/callback',
    asyncHandler(async (req: Request, res: Response) => {
      const result = await verifyHubChallenge(req.query);
      if (!result.ok) {
        return res.status(403).json({ error: 'Verification failed' });
      }
      // Meta expects the challenge echoed as plain text, not JSON.
      res.status(200).send(result.challenge);
    }),
  );

  // Inbound events.
  app.post(
    '/api/instagram/webhooks/callback',
    asyncHandler(async (req: Request, res: Response) => {
      if (!verifyWebhookSignature(req)) {
        await recordInvalidSignature();
        return res.status(403).json({ error: 'Invalid signature' });
      }

      try {
        await processWebhookPayload(req.body ?? {});
        res.status(200).json({ status: 'received' });
      } catch (error) {
        // Meta retries anything that is not a 2xx, so a bug on our side must
        // not turn one event into a retry storm.
        await recordProcessingError(error);
        res.status(200).json({ status: 'error', message: 'Error processing webhook' });
      }
    }),
  );

  // -------------------------------------------------------------------------
  // Subscription management
  // -------------------------------------------------------------------------

  app.post(
    '/api/instagram/webhooks/subscribe',
    isAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const { fields, callbackUrl, verifyToken } = req.body ?? {};

      if (!Array.isArray(fields) || fields.length === 0 || typeof callbackUrl !== 'string') {
        throw HttpError.badRequest('Fields must be a non-empty array and callbackUrl is required');
      }
      if (!fields.every((field): field is string => typeof field === 'string')) {
        throw HttpError.badRequest('Fields must be an array of strings');
      }

      if (!(await getUserAccessToken())) {
        return res.status(403).json(NO_ACCESS_TOKEN);
      }

      const result = await subscribeToWebhook(
        fields,
        callbackUrl,
        typeof verifyToken === 'string' ? verifyToken : undefined,
      );
      res.status(200).json(result);
    }),
  );

  app.get(
    '/api/instagram/webhooks/subscriptions',
    isAuthenticated,
    asyncHandler(async (_req: Request, res: Response) => {
      try {
        res.status(200).json(await getWebhookSubscriptions());
      } catch (error) {
        throw toHttpError(error, 'Failed to get subscriptions');
      }
    }),
  );

  app.delete(
    '/api/instagram/webhooks/subscriptions/:id',
    isAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      res.status(200).json(await unsubscribeFromWebhook(req.params.id));
    }),
  );

  app.get('/api/instagram/webhooks/field-groups', isAuthenticated, (_req: Request, res: Response) => {
    res.status(200).json(WEBHOOK_FIELD_GROUPS);
  });

  app.get(
    '/api/instagram/webhooks/test',
    isAuthenticated,
    asyncHandler(async (_req: Request, res: Response) => {
      // Always resolves; failures are reported inside the payload so the
      // diagnostics panel can render them.
      res.status(200).json(await testWebhookConnection());
    }),
  );

  app.get(
    '/api/instagram/webhooks/logs',
    isAuthenticated,
    asyncHandler(async (_req: Request, res: Response) => {
      res.status(200).json(await getWebhookLogs());
    }),
  );

  // -------------------------------------------------------------------------
  // Credentials
  // -------------------------------------------------------------------------

  app.post(
    '/api/instagram/auth/token',
    isAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const { accessToken, userId } = req.body ?? {};

      if (typeof accessToken !== 'string' || accessToken.trim() === '') {
        throw HttpError.badRequest('Access token is required');
      }

      await putSetting('facebook', 'access_token', accessToken.trim());

      // A new token may belong to a different Facebook user, so anything
      // derived from the old one — Pages, account ID, media — is now suspect.
      clearInstagramCaches();

      await recordActivity({
        action: 'update',
        resource: 'integration_setting',
        resourceId: 'facebook_access_token',
        userId: req.user?.id,
        // The Facebook user ID is not one of ours, so it stays in details.
        details: { service: 'facebook', facebookUserId: userId ? String(userId) : null },
      });

      log.info('Stored Facebook access token');
      res.status(200).json({ success: true, message: 'Access token stored successfully' });
    }),
  );

  // -------------------------------------------------------------------------
  // Account and media
  // -------------------------------------------------------------------------

  app.get(
    '/api/instagram/account',
    isAuthenticated,
    asyncHandler(async (_req: Request, res: Response) => {
      if (!(await getUserAccessToken())) {
        return res.status(403).json(NO_ACCESS_TOKEN);
      }

      const accountId = await getInstagramAccountId().catch((error) => {
        throw toHttpError(error, 'Failed to get Instagram account ID');
      });

      if (!accountId) {
        return res.status(404).json({
          error: 'Instagram account not found',
          message:
            'No Instagram Business Account was found connected to your Facebook account. Please ensure you have an Instagram Business Account linked to a Facebook Page you manage.',
          code: 'NO_INSTAGRAM_ACCOUNT',
        });
      }

      res.status(200).json({ id: accountId, success: true });
    }),
  );

  app.get(
    '/api/instagram/media',
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      if (!(await getUserAccessToken())) {
        return res.status(403).json(NO_ACCESS_TOKEN);
      }

      try {
        res.status(200).json(await getInstagramMedia(normalizeMediaLimit(req.query.limit)));
      } catch (error) {
        throw toHttpError(error, 'Failed to get Instagram media');
      }
    }),
  );

  app.get(
    '/api/instagram/media/:id',
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      const mediaId = req.params.id;
      if (!MEDIA_ID_PATTERN.test(mediaId)) {
        throw HttpError.badRequest('Invalid media id');
      }

      if (!(await getUserAccessToken())) {
        return res.status(403).json(NO_ACCESS_TOKEN);
      }

      const media = await getInstagramMediaById(mediaId).catch((error) => {
        throw toHttpError(error, 'Failed to get Instagram media');
      });

      if (!media) {
        return res.status(404).json({
          error: 'Media not found',
          message: `No Instagram media found with ID ${mediaId}`,
          code: 'MEDIA_NOT_FOUND',
        });
      }

      res.status(200).json(media);
    }),
  );

  app.post(
    '/api/instagram/media',
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      const { imageUrl, caption } = req.body ?? {};

      if (typeof imageUrl !== 'string' || imageUrl.trim() === '') {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Image URL is required',
          code: 'MISSING_IMAGE_URL',
        });
      }

      if (!(await getUserAccessToken())) {
        return res.status(403).json(NO_ACCESS_TOKEN);
      }

      let published;
      try {
        published = await publishImage(imageUrl.trim(), typeof caption === 'string' ? caption : '');
      } catch (error) {
        throw toHttpError(error, 'Failed to create Instagram post');
      }

      await recordActivity({
        action: 'publish',
        resource: 'instagram-image',
        resourceId: published.mediaId,
        userId: req.user?.id,
        details: { containerId: published.containerId, strategy: published.strategy },
      });

      res.status(201).json({
        success: true,
        mediaId: published.mediaId,
        message: 'Instagram post created successfully',
      });
    }),
  );
}
