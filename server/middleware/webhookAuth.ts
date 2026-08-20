/**
 * Shared-secret authentication for inbound webhooks.
 *
 * Webhook endpoints cannot use the session or CSRF token — the caller is
 * another service, not a browser. They still need to prove who they are:
 * `/api/webhooks/article-published` kicks off a full Airtable sync, so leaving
 * it open lets anyone exhaust the Airtable rate limit on demand.
 */

import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../lib/env';
import { HttpError } from '../lib/httpError';
import { log } from '../vite';

const HEADER = 'x-webhook-secret';

export function verifyWebhookSecret(req: Request, _res: Response, next: NextFunction) {
  if (!env.webhookSecret) {
    // Refusing to start would break local development, and silently accepting
    // in production would hide the gap — so warn loudly on every call.
    if (env.isProduction) {
      log('WEBHOOK_SECRET is not set; webhook endpoint is unauthenticated', 'webhook');
    }
    return next();
  }

  const supplied = req.get(HEADER);
  if (!supplied) return next(HttpError.unauthorized('Missing webhook secret'));

  const expectedBuf = Buffer.from(env.webhookSecret);
  const suppliedBuf = Buffer.from(supplied);

  if (
    expectedBuf.length !== suppliedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, suppliedBuf)
  ) {
    return next(HttpError.unauthorized('Invalid webhook secret'));
  }

  next();
}
