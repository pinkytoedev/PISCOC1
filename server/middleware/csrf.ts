/**
 * CSRF protection via the double-submit cookie pattern.
 *
 * Session cookies are issued with `SameSite=None` in production so the CMS can
 * be embedded cross-origin. That setting means the browser attaches the session
 * to cross-site requests, so every state-changing endpoint was forgeable from
 * any page the user visited. A token the attacker's page cannot read closes it.
 *
 * The token lives in a readable cookie; the client echoes it in a header. An
 * attacker can cause the cookie to be sent but cannot read it to build the
 * matching header, because the same-origin policy blocks that read.
 */

import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../lib/env';
import { HttpError } from '../lib/httpError';

const COOKIE_NAME = 'csrf_token';
const HEADER_NAME = 'x-csrf-token';

/** Methods that cannot change state and therefore need no token. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Endpoints legitimately called by parties that have no session and no cookie:
 * contributor upload links (authorized by the token in the URL) and inbound
 * third-party webhooks (authorized by their own signature/secret).
 */
const EXEMPT_PREFIXES = [
  '/api/public-upload/',
  '/api/public/',
  '/api/instagram/webhooks/',
  '/api/webhooks/',
];

function isExempt(path: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** Issues the CSRF cookie when one is missing. */
export function issueCsrfToken(req: Request, res: Response, next: NextFunction) {
  if (!req.cookies?.[COOKIE_NAME]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(COOKIE_NAME, token, {
      // Deliberately readable by JavaScript — the client must echo it back.
      httpOnly: false,
      secure: env.isProduction,
      sameSite: env.isProduction ? 'none' : 'lax',
      path: '/',
    });
    // Make it available to a handler running later in this same request.
    req.cookies = { ...(req.cookies ?? {}), [COOKIE_NAME]: token };
  }
  next();
}

/** Rejects state-changing requests whose header does not match the cookie. */
export function verifyCsrfToken(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method) || isExempt(req.path)) {
    return next();
  }

  const cookieToken = req.cookies?.[COOKIE_NAME];
  const headerToken = req.get(HEADER_NAME);

  if (!cookieToken || !headerToken) {
    return next(HttpError.forbidden('Missing CSRF token'));
  }

  const cookieBuf = Buffer.from(String(cookieToken));
  const headerBuf = Buffer.from(String(headerToken));

  // `timingSafeEqual` requires equal lengths, so check that first rather than
  // letting it throw.
  if (
    cookieBuf.length !== headerBuf.length ||
    !crypto.timingSafeEqual(cookieBuf, headerBuf)
  ) {
    return next(HttpError.forbidden('Invalid CSRF token'));
  }

  next();
}

export const csrfCookieName = COOKIE_NAME;
export const csrfHeaderName = HEADER_NAME;
