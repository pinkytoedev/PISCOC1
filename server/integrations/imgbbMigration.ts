/**
 * ImgBB migration endpoints.
 *
 * A one-off backfill that walks Airtable's `MainImage` attachments, re-hosts
 * each on ImgBB and fills in `MainImageLink`. The work itself runs in a
 * detached script; these routes only start it and report the progress file it
 * writes.
 *
 * Two notes for anyone picking this up:
 *
 *   - `registerImgBBMigrationRoutes` is not currently wired into `routes.ts`,
 *     so none of these paths are live. They are kept intact rather than deleted
 *     because the backfill is still occasionally needed.
 *   - The old module resolved its paths from `__dirname`, which does not exist
 *     in this ESM build — every handler here would have thrown a ReferenceError
 *     the moment it was registered. Paths are resolved from the process working
 *     directory instead, which is the repository root in every deployment.
 */

import type { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import fsp from 'fs/promises';
import path from 'path';
import { storage } from '../storage';
import { createLogger } from '../lib/logger';
import { HttpError, asyncHandler } from '../lib/httpError';
import { isAuthenticated } from '../middleware/auth';

const log = createLogger('imgbb:migration');

const DATA_DIR = path.join(process.cwd(), 'data');
const PROGRESS_FILE = path.join(DATA_DIR, 'imgbb-migration-progress.json');
const SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'migrate-images-to-imgbb.js');

interface MigrationError {
  recordId: string;
  title: string;
  error: string;
}

interface MigrationProgress {
  totalRecords: number;
  processedRecords: number;
  percentage: number;
  errors: MigrationError[];
}

/** What the background script writes; every field is treated as optional. */
interface ProgressFileContents {
  totalRecords?: number;
  processedRecords?: string[];
  errors?: MigrationError[];
}

const EMPTY_PROGRESS: MigrationProgress = {
  totalRecords: 0,
  processedRecords: 0,
  percentage: 0,
  errors: [],
};

/**
 * Reads the progress file.
 *
 * A missing file is the normal "never run" state, not an error, so it reports
 * zeroes. A corrupt file is logged and also reports zeroes — the endpoint is
 * for monitoring and must not fail because the script died mid-write.
 */
async function readMigrationProgress(): Promise<MigrationProgress> {
  let raw: string;
  try {
    raw = await fsp.readFile(PROGRESS_FILE, 'utf8');
  } catch {
    return EMPTY_PROGRESS;
  }

  try {
    const parsed = JSON.parse(raw) as ProgressFileContents;
    const total = parsed.totalRecords ?? 0;
    const processed = parsed.processedRecords?.length ?? 0;

    return {
      totalRecords: total,
      processedRecords: processed,
      percentage: total ? Math.round((processed / total) * 100) : 0,
      errors: parsed.errors ?? [],
    };
  } catch (error) {
    log.error('Migration progress file is not valid JSON', { file: PROGRESS_FILE, error });
    return EMPTY_PROGRESS;
  }
}

/**
 * Records a migration lifecycle event.
 *
 * Written through `storage` rather than `services/activity` because the shared
 * activity vocabulary covers content and settings, not migrations; adding
 * "migration" to it for three call sites in an unregistered module is not worth
 * widening the type for.
 */
async function logMigrationEvent(
  action: string,
  userId: number | undefined,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await storage.createActivityLog({
      userId,
      action,
      resourceType: 'migration',
      resourceId: 'airtable-to-imgbb',
      details,
    });
  } catch (error) {
    log.error('Failed to record migration activity', { action, error });
  }
}

export function registerImgBBMigrationRoutes(app: Router): void {
  app.post(
    '/api/migration/airtable-to-imgbb',
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        await fsp.access(SCRIPT_PATH);
      } catch {
        throw HttpError.notFound('Migration script not found');
      }

      await fsp.mkdir(DATA_DIR, { recursive: true });

      const userId = req.user?.id;
      await logMigrationEvent('start', userId, { startedAt: new Date().toISOString() });

      // `execFile` rather than `exec`: no shell is involved, so the path cannot
      // be reinterpreted as a command even if it ever stops being a constant.
      execFile(process.execPath, [SCRIPT_PATH], (error, stdout, stderr) => {
        if (error) {
          log.error('Migration script failed', { error, stderr: stderr?.slice(0, 1000) });
          void logMigrationEvent('error', userId, { error: error.message });
          return;
        }

        log.info('Migration script completed', { output: stdout?.slice(0, 1000) });
        void logMigrationEvent('complete', userId, { completedAt: new Date().toISOString() });
      });

      // Deliberately not awaited — the backfill runs for minutes and the client
      // polls the progress endpoint below.
      res.json({ message: 'Migration started in background', status: 'running' });
    }),
  );

  app.get(
    '/api/migration/airtable-to-imgbb/progress',
    isAuthenticated,
    asyncHandler(async (_req: Request, res: Response) => {
      const progress = await readMigrationProgress();

      // There is no process handle to consult once the script is detached, so
      // "done" is inferred from the counts in the progress file.
      const complete = progress.totalRecords > 0 && progress.processedRecords >= progress.totalRecords;

      res.json({ ...progress, status: complete ? 'completed' : 'idle' });
    }),
  );

  app.post(
    '/api/migration/airtable-to-imgbb/reset',
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      // `force` makes an already-absent file a no-op, replacing the
      // existsSync/unlinkSync pair that raced with the running script.
      await fsp.rm(PROGRESS_FILE, { force: true });

      await logMigrationEvent('reset', req.user?.id, { resetAt: new Date().toISOString() });

      res.json({ message: 'Migration progress reset', status: 'idle' });
    }),
  );
}
