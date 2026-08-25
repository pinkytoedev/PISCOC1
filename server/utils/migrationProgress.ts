/**
 * Airtable image-migration progress.
 *
 * The one-off migration scripts each append their state to a JSON file in the
 * working directory. This reads whichever of those files exist and folds them
 * into the single summary the dashboard shows.
 *
 * Reads are synchronous on purpose: `routes/system.ts` calls this from inside a
 * response body (`res.json(getMigrationProgress())`), so the signature cannot
 * become a promise without changing a file this refactor does not own. The
 * files are a few kilobytes and usually absent, which is why it is tolerable.
 */

import fs from 'fs';
import path from 'path';
import { createLogger } from '../lib/logger';

const log = createLogger('migration-progress');

/** Progress files, one per migration script that was run. */
const PROGRESS_FILES = [
  'migration-with-progress-bar.json',
  'migration-with-improved-rate-limits.json',
  // 'migration-main-progress.json' is excluded: its format is incompatible.
  'migration-small-batch.json',
  'migration-single-image.json',
  'migration-continuous.json',
];

export interface MigrationError {
  recordId: string;
  title: string;
  error: string;
}

/** The shape the migration scripts write. */
export interface MigrationProgress {
  processedRecords: string[];
  totalRecords: number;
  uploadTimestamps?: number[];
  errors?: MigrationError[];
}

export interface MigrationProgressSummary {
  totalRecords: number;
  processedRecords: number;
  percentage: number;
  recentUploads: number;
  lastUploadTime: string | null;
  errors: MigrationError[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A progress file as it may actually be on disk.
 *
 * The scripts disagree about how they record what has been done: an array of
 * record ids, an object keyed by record id, or just a count.
 */
interface RawProgressFile {
  processedRecords?: unknown;
  recordsProcessed?: unknown;
  totalRecords?: unknown;
  uploadTimestamps?: unknown;
  errors?: unknown;
}

function readProgressFile(file: string): RawProgressFile | null {
  try {
    // Read straight away rather than checking existence first: the extra stat
    // races with a running migration and tells us nothing the read does not.
    const contents = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
    const parsed: unknown = JSON.parse(contents);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      log.warn('Ignoring progress file that is not a JSON object', { file });
      return null;
    }
    return parsed as RawProgressFile;
  } catch (error) {
    // A missing file is the normal case — no migration of that kind was run.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn('Could not read progress file', { file, error });
    }
    return null;
  }
}

/** Collects the record ids a file reports, whichever way it records them. */
function collectRecordIds(data: RawProgressFile, into: Set<string>): void {
  if (Array.isArray(data.processedRecords)) {
    for (const id of data.processedRecords) {
      if (typeof id === 'string') into.add(id);
    }
    return;
  }

  if (data.recordsProcessed && typeof data.recordsProcessed === 'object') {
    for (const id of Object.keys(data.recordsProcessed)) into.add(id);
    return;
  }

  // A bare count carries no ids, so it cannot be merged without double-counting
  // records another file already reported.
  if (typeof data.processedRecords === 'number') {
    log.debug('Progress file reports a count with no record ids', {
      processed: data.processedRecords,
    });
  }
}

function isMigrationError(value: unknown): value is MigrationError {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MigrationError>;
  return typeof candidate.recordId === 'string' && typeof candidate.error === 'string';
}

export function getMigrationProgress(): MigrationProgressSummary {
  const processed = new Set<string>();
  const timestamps: number[] = [];
  const errors: MigrationError[] = [];
  let totalRecords = 0;

  for (const file of PROGRESS_FILES) {
    const data = readProgressFile(file);
    if (!data) continue;

    collectRecordIds(data, processed);

    // Guarded: `Math.max(n, undefined)` is NaN, and a single file without a
    // total used to poison the count and every percentage derived from it.
    if (typeof data.totalRecords === 'number' && Number.isFinite(data.totalRecords)) {
      totalRecords = Math.max(totalRecords, data.totalRecords);
    }

    if (Array.isArray(data.uploadTimestamps)) {
      for (const ts of data.uploadTimestamps) {
        if (typeof ts === 'number' && Number.isFinite(ts)) timestamps.push(ts);
      }
    }

    if (Array.isArray(data.errors)) {
      for (const entry of data.errors) {
        if (isMigrationError(entry)) errors.push(entry);
      }
    }
  }

  // Most recent first, so the head is the last upload.
  timestamps.sort((a, b) => b - a);

  const oneDayAgo = Date.now() - DAY_MS;

  return {
    totalRecords,
    processedRecords: processed.size,
    percentage: totalRecords > 0 ? Math.round((processed.size / totalRecords) * 100) : 0,
    recentUploads: timestamps.filter((ts) => ts > oneDayAgo).length,
    lastUploadTime: timestamps.length > 0 ? new Date(timestamps[0]).toISOString() : null,
    errors,
  };
}
