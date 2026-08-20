/**
 * Authentication and authorization guards.
 *
 * These replace the per-route `if (!req.isAuthenticated())` blocks that were
 * scattered across the integration files. Declaring the guard in the route
 * signature makes an unprotected route visible at a glance, which is how the
 * previously unguarded endpoints went unnoticed.
 */

import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/httpError';

/** Requires a logged-in session. */
export function isAuthenticated(req: Request, _res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.()) {
    return next(HttpError.unauthorized());
  }
  next();
}

/** Requires a logged-in session belonging to an admin. */
export function isAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.()) {
    return next(HttpError.unauthorized());
  }
  if (!req.user?.isAdmin) {
    return next(HttpError.forbidden('Admin privileges required'));
  }
  next();
}
