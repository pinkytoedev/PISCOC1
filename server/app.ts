/**
 * Serverless entry point.
 *
 * `build.config.js` bundles this to `dist/app.js` for platforms that want an
 * exported Express app rather than a process that listens (Vercel). It is the
 * same application as `server/index.ts` minus the parts that only make sense
 * when we own the process: port binding, the dev Vite middleware, the publish
 * scheduler and the shutdown handlers.
 *
 * Everything else has to match `index.ts`, because the two entry points serve
 * the same routes to the same clients. It previously did not: there was no
 * cookie parsing and no CSRF check, and the request log serialized every JSON
 * response body — which meant session payloads and integration credentials were
 * written to the platform's logs.
 */

import { env } from './lib/env';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import fs from 'fs/promises';
import path from 'path';
import { ZodError } from 'zod';
import { registerRoutes } from './routes';
import { setupStaticServing } from './middleware/staticMiddleware';
import { issueCsrfToken, verifyCsrfToken } from './middleware/csrf';
import { HttpError } from './lib/httpError';
import { createLogger } from './lib/logger';

const log = createLogger('app');

const app = express();

/**
 * Keeps the exact request bytes alongside the parsed body: Meta signs the raw
 * payload of a webhook delivery, and re-serializing the parsed object does not
 * reproduce the string that was signed.
 */
app.use(
  express.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(cookieParser());

// Hand out the CSRF cookie on every request, require the matching header on
// anything that changes state.
app.use(issueCsrfToken);
app.use(verifyCsrfToken);

setupStaticServing(app);

/** Method, path, status and duration only — never the response body. */
app.use((req, res, next) => {
  const start = Date.now();
  const requestPath = req.path;

  res.on('finish', () => {
    if (!requestPath.startsWith('/api')) return;
    log.info(`${req.method} ${requestPath} ${res.statusCode}`, {
      durationMs: Date.now() - start,
    });
  });

  next();
});

await registerRoutes(app);

/**
 * Central error handler.
 *
 * Mirrors the one in `index.ts`; it cannot be shared without exporting it from
 * that file, which this refactor does not own. Note that it *responds* rather
 * than rethrowing — the previous version threw the error again after sending
 * the response, which reaches Node as an uncaught exception and, under the
 * process handlers in `index.ts`, would take the server down.
 */
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Validation error',
      errors: err.errors.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  // Multer signals an oversized upload with a code rather than an HttpError.
  if (typeof err === 'object' && err && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'File is too large' });
  }

  const message = err instanceof Error ? err.message : String(err);

  // body-parser attaches a status to client-side faults such as malformed JSON;
  // honouring it keeps those as 4xx rather than reporting them as our failure.
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;

  if (typeof status === 'number' && status >= 400 && status < 500) {
    return res.status(status).json({ message });
  }

  log.error('Unhandled request error', { error: err });

  // Internal detail stays in the log; the client gets a generic message.
  res.status(500).json({ message: 'Internal server error' });
});

/**
 * Static hosting of the built client.
 *
 * Only mounted when a build is actually present, so a serverless deployment
 * that serves the front end from a CDN does not gain a catch-all route that
 * swallows unmatched API paths.
 */
const distPath = path.resolve(process.cwd(), 'dist/public');

if (await exists(distPath)) {
  app.use(express.static(distPath));

  // Client-side routing: anything not matched above is the SPA shell.
  app.use('*', (_req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
} else if (env.isProduction) {
  log.warn('No client build found; serving API routes only', { distPath });
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export default app;
