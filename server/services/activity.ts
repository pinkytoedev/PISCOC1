/**
 * Activity logging.
 *
 * Every mutating endpoint records what happened. That was written out by hand
 * at 69 call sites, with three recurring problems: the whole mutated record was
 * often stored in `details` (so article bodies and, in one case, a user row
 * landed in the log table), a logging failure could reject the request that had
 * already succeeded, and the action/resource strings drifted between callers.
 *
 * This module fixes the vocabulary, keeps `details` small, and never throws.
 */

import { storage } from '../storage';
import { createLogger } from '../lib/logger';

const log = createLogger('activity');

/** The verbs the system records. */
export type ActivityAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'publish'
  | 'unpublish'
  | 'upload'
  | 'sync'
  | 'push'
  | 'login'
  | 'logout'
  | 'create_user'
  | 'update_user'
  | 'delete_user';

/** The things those verbs act on. */
export type ActivityResource =
  | 'article'
  | 'team_member'
  | 'carousel_quote'
  | 'admin_request'
  | 'image'
  | 'instagram-image'
  | 'html-zip'
  | 'html_content'
  | 'upload_link'
  | 'integration_setting'
  | 'user';

export interface RecordActivityInput {
  action: ActivityAction;
  resource: ActivityResource;
  resourceId: string | number;
  /** Omitted for contributor actions, which have no account behind them. */
  userId?: number;
  /**
   * Small, structured context — counts, status transitions, filenames.
   * Never whole records: the point of the log is what changed, not a copy of it.
   */
  details?: Record<string, unknown>;
}

/**
 * Records an activity.
 *
 * Deliberately swallows its own failures. The caller's write has already
 * committed by the time this runs, so a logging error must not turn a
 * successful request into a 500 — it is reported to the application log
 * instead.
 */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  try {
    await storage.createActivityLog({
      userId: input.userId,
      action: input.action,
      resourceType: input.resource,
      resourceId: String(input.resourceId),
      details: input.details ?? {},
    });
  } catch (error) {
    log.error('Failed to record activity', {
      action: input.action,
      resource: input.resource,
      resourceId: String(input.resourceId),
      error,
    });
  }
}

/**
 * Summarises a change as the set of fields touched.
 *
 * Lets a caller record "these fields changed" without copying their values,
 * which is what made the old `details: { article }` entries so heavy.
 */
export function changedFields(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
): string[] {
  if (!before) return Object.keys(after);
  return Object.keys(after).filter((key) => before[key] !== after[key]);
}
