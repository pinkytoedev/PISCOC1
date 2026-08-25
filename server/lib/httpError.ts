/**
 * HTTP error type and async route wrapper.
 *
 * Route handlers throw `HttpError` for expected failures and let anything
 * unexpected propagate. `asyncHandler` forwards rejected promises to Express's
 * error middleware, which is the single place that decides what the client
 * sees — so an unhandled `await` can no longer leave a request hanging.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class HttpError extends Error {
  readonly status: number;
  /** Structured detail returned alongside the message, e.g. Zod field errors. */
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new HttpError(400, message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new HttpError(401, message);
  }

  static forbidden(message = 'Insufficient permissions') {
    return new HttpError(403, message);
  }

  static notFound(message = 'Not found') {
    return new HttpError(404, message);
  }

  static conflict(message: string, details?: unknown) {
    return new HttpError(409, message, details);
  }

  static payloadTooLarge(message: string) {
    return new HttpError(413, message);
  }

  static tooManyRequests(message = 'Too many requests') {
    return new HttpError(429, message);
  }

  static internal(message = 'Internal server error') {
    return new HttpError(500, message);
  }
}

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/** Wraps an async handler so rejections reach the error middleware. */
export function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/**
 * Parses a positive integer route/body parameter, throwing a 400 rather than
 * letting `NaN` reach the database. `parseInt` alone accepts "12abc" and
 * returns 12, which is how malformed IDs used to slip through.
 */
export function parseId(value: unknown, field = 'id'): number {
  const raw = typeof value === 'number' ? String(value) : String(value ?? '');
  if (!/^\d+$/.test(raw)) {
    throw HttpError.badRequest(`Invalid ${field}`);
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw HttpError.badRequest(`Invalid ${field}`);
  }
  return parsed;
}
