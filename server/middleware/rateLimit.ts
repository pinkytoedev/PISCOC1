/**
 * Shared rate limiters.
 *
 * The previous limiter was a bare `Map` that was never pruned, so every IP that
 * ever hit an upload endpoint stayed in memory for the life of the process.
 * `express-rate-limit` handles eviction and the standard response headers.
 *
 * These are still per-instance counters. That is adequate for a single Railway
 * replica; if the service is ever scaled horizontally, swap in a shared store
 * (`rate-limit-redis`) — the limiter definitions below are the only place that
 * needs to change.
 */

import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { HttpError } from '../lib/httpError';

function build(options: Partial<Options> & { limit: number; windowMs: number }) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Route the rejection through the normal error pipeline so the response
    // shape matches every other error the API returns.
    handler: (_req, _res, next) => {
      next(HttpError.tooManyRequests());
    },
    ...options,
  });
}

/**
 * Credential endpoints. Counts only failures so a person legitimately signing
 * in repeatedly is unaffected, while a password-guessing loop is not.
 */
export const loginRateLimit = build({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
});

/** Contributor uploads: generous enough for a real submission, bounded overall. */
export const uploadRateLimit = build({
  windowMs: 15 * 60 * 1000,
  limit: 40,
});

/**
 * Reading an upload link's metadata. Higher than the upload limit because the
 * contributor page polls it, but low enough that token guessing is impractical.
 */
export const uploadInfoRateLimit = build({
  windowMs: 15 * 60 * 1000,
  limit: 120,
});

/** Broad ceiling for unauthenticated public reads. */
export const publicApiRateLimit = build({
  windowMs: 15 * 60 * 1000,
  limit: 300,
});

/**
 * Keys uploads by token rather than IP where a token is present, so several
 * contributors behind one office NAT do not consume each other's budget.
 */
export function tokenKeyGenerator(req: Request): string {
  const token = req.params?.token;
  return token ? `token:${token}` : `ip:${req.ip ?? 'unknown'}`;
}
