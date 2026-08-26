/**
 * Local database → Airtable.
 *
 * Article pushes are single-record and go through the shared client. Team
 * members and quotes are pushed wholesale, so they are batched: Airtable caps a
 * write at ten records and a partial failure must not abort the rest of the run.
 */

import type { Article, CarouselQuote } from '@shared/schema';
import { storage } from '../../storage';
import { HttpError } from '../../lib/httpError';
import { createLogger } from '../../lib/logger';
import { recordActivity } from '../../services/activity';
import {
  batched,
  createRecord,
  deleteRecords,
  listRecords,
  optionalConfig,
  requireConfig,
  updateRecord,
  writeRecords,
  type AirtableConfig,
} from './client';
import {
  convertCarouselQuoteToAirtableFormat,
  convertTeamMemberToAirtableFormat,
  convertToAirtableFormat,
  type CarouselQuoteInput,
} from './mappers';
import {
  emptyResults,
  type AirtableCarouselQuoteFields,
  type AirtableTeamMemberFields,
  type AirtableWriteRecord,
  type SyncResults,
} from './types';

const log = createLogger('airtable:push');

export interface PushArticleResult {
  message: string;
  response: { records: Array<{ id: string }> };
}

/**
 * Creates or updates one article's Airtable record.
 *
 * Also used by the article update endpoint in `routes.ts`, which pushes on
 * every save, so a failure here has to surface as a thrown error rather than a
 * silent no-op.
 */
export async function pushArticleToAirtable(
  articleId: number,
  userId?: number,
): Promise<PushArticleResult> {
  const article = await storage.getArticle(articleId);
  if (!article) {
    throw HttpError.notFound('Article not found');
  }

  const config = await requireConfig('articles');
  const fields = await convertToAirtableFormat(article);

  let airtableId: string;
  let action: 'create' | 'update';

  if (article.externalId) {
    action = 'update';
    airtableId = article.externalId;
    await updateRecord(config, airtableId, fields);
  } else {
    action = 'create';
    airtableId = await createRecord(config, fields);
  }

  // An article created here is now Airtable-backed; the next sync has to be able
  // to find it by external id.
  if (!article.externalId || article.source !== 'airtable') {
    await storage.updateArticle(articleId, { externalId: airtableId, source: 'airtable' });
  }

  await recordActivity({
    userId,
    action: action === 'create' ? 'create' : 'update',
    resource: 'article',
    resourceId: article.id,
    details: { service: 'airtable', airtableId, status: article.status },
  });

  log.info('Pushed article to Airtable', { articleId, action, status: article.status });

  return {
    message: action === 'update'
      ? 'Article updated in Airtable successfully'
      : 'Article pushed to Airtable successfully',
    response: { records: [{ id: airtableId }] },
  };
}

/** Pushes an existing Airtable-backed article without touching its external id. */
export async function updateArticleInAirtable(article: Article): Promise<void> {
  if (article.source !== 'airtable' || !article.externalId) {
    throw HttpError.badRequest('This article is not from Airtable');
  }

  const config = await requireConfig('articles');
  const fields = await convertToAirtableFormat(article);
  await updateRecord(config, article.externalId, fields);
}

/** Pushes every team member, creating the ones Airtable has never seen. */
export async function pushTeamMembersToAirtable(
  config: AirtableConfig,
  userId?: number,
): Promise<SyncResults> {
  const members = await storage.getTeamMembers();
  const results = emptyResults();

  const toUpdate = members.filter((member) => member.externalId);
  const toCreate = members.filter((member) => !member.externalId);

  await runBatches(
    config,
    'PATCH',
    toUpdate.map((member) => ({
      id: member.externalId as string,
      fields: convertTeamMemberToAirtableFormat(member),
    })),
    results,
    'team members',
  );

  const created = await runBatches<AirtableTeamMemberFields>(
    config,
    'POST',
    toCreate.map((member) => ({ fields: convertTeamMemberToAirtableFormat(member) })),
    results,
    'team members',
  );

  // Airtable returns created records in request order, so the nth id belongs to
  // the nth member that was sent.
  for (let i = 0; i < toCreate.length; i++) {
    const externalId = created[i];
    if (externalId) await storage.updateTeamMember(toCreate[i].id, { externalId });
  }

  await recordActivity({
    userId,
    action: 'push',
    resource: 'team_member',
    resourceId: 'all',
    details: {
      destination: 'airtable',
      created: results.created,
      updated: results.updated,
      errors: results.errors,
    },
  });

  return results;
}

/**
 * Makes the Airtable quotes table match the CMS exactly.
 *
 * This is a mirror, not a merge. Every local quote is written over its Airtable
 * record, quotes Airtable has never seen are created, and records with no local
 * quote behind them are deleted. Anything less left the live site showing
 * quotes an editor had already removed here, because the site reads Airtable
 * and nothing ever took the row out of it.
 *
 * The table is read first so a stale `externalId` — a record deleted in
 * Airtable directly — becomes a create rather than a PATCH that 404s and takes
 * its whole batch of nine innocent records down with it.
 */
export async function pushCarouselQuotesToAirtable(
  config: AirtableConfig,
  userId?: number,
): Promise<SyncResults> {
  const quotes = await storage.getCarouselQuotes();
  const results = emptyResults();

  const remote = await listRecords<AirtableCarouselQuoteFields>(config);
  const remoteIds = new Set(remote.records.map((record) => record.id));

  const toUpdate = quotes.filter((quote) => quote.externalId && remoteIds.has(quote.externalId));
  const toCreate = quotes.filter((quote) => !quote.externalId || !remoteIds.has(quote.externalId));

  await runBatches(
    config,
    'PATCH',
    toUpdate.map((quote) => ({
      id: quote.externalId as string,
      fields: convertCarouselQuoteToAirtableFormat(quote),
    })),
    results,
    'quotes',
  );

  const created = await runBatches<AirtableCarouselQuoteFields>(
    config,
    'POST',
    toCreate.map((quote) => ({ fields: convertCarouselQuoteToAirtableFormat(quote) })),
    results,
    'quotes',
  );

  for (let i = 0; i < toCreate.length; i++) {
    const externalId = created[i];
    if (externalId) await storage.updateCarouselQuote(toCreate[i].id, { externalId });
  }

  // Whatever is still in Airtable that no local quote claims — including rows
  // orphaned by an earlier delete — goes. `toUpdate` is the only set that
  // reuses an existing record; the created ones have brand new ids.
  //
  // An empty local table is never treated as "delete everything". That reads as
  // an intentional wipe but is far more often a fresh or wrong database, and
  // Airtable has no undo for a batch delete.
  if (quotes.length === 0) {
    if (remote.records.length > 0) {
      results.details.push(
        `Skipped removing ${remote.records.length} Airtable quotes: there are no quotes in the CMS to mirror. Delete them in Airtable directly if that is intended.`,
      );
      log.warn('Refused to empty the Airtable quotes table', {
        remote: remote.records.length,
      });
    }
  } else {
    const claimed = new Set(toUpdate.map((quote) => quote.externalId as string));
    const orphaned = remote.records
      .map((record) => record.id)
      .filter((id) => !claimed.has(id));

    await deleteBatches(config, orphaned, results, 'quotes');
  }

  await recordActivity({
    userId,
    action: 'push',
    resource: 'carousel_quote',
    resourceId: 'all',
    details: {
      destination: 'airtable',
      created: results.created,
      updated: results.updated,
      deleted: results.deleted,
      errors: results.errors,
    },
  });

  return results;
}

export interface QuoteSyncResult {
  /** The stored quote, carrying a freshly assigned `externalId` if one was created. */
  quote: CarouselQuote;
  /** Whether Airtable — and so the live site — now reflects this quote. */
  syncedToAirtable: boolean;
}

/**
 * Mirrors one quote into Airtable, creating its record if it has none.
 *
 * Called on every save, because the public site reads Airtable: without this a
 * saved edit sat in the CMS looking applied while the live page kept the old
 * text until somebody remembered to press Push.
 *
 * Best-effort, like the delete path. The row is already written locally and
 * failing the request would tell the editor their edit was lost when it was
 * not; the flag is how they learn the live site has not caught up.
 */
export async function syncCarouselQuoteToAirtable(quote: CarouselQuote): Promise<QuoteSyncResult> {
  const config = await optionalConfig('quotes');
  if (!config) {
    log.warn('Skipped Airtable quote sync: integration not configured', { quoteId: quote.id });
    return { quote, syncedToAirtable: false };
  }

  const fields = convertCarouselQuoteToAirtableFormat(quote);

  try {
    if (quote.externalId) {
      try {
        await writeRecords<AirtableCarouselQuoteFields>(config, 'PATCH', [
          { id: quote.externalId, fields },
        ]);
        return { quote, syncedToAirtable: true };
      } catch (error) {
        if (!(await recordIsAlreadyGone(config, error))) throw error;
        // Deleted in Airtable directly. Recreate rather than give up, or the
        // quote would stay invisible to the site no matter how often it is saved.
        log.info('Airtable quote record is gone; recreating it', { quoteId: quote.id });
      }
    }

    const externalId = await createRecord(config, fields);

    // Airtable already has the record, so this is reported as synced whatever
    // happens next — but the local write is what stops the *next* save creating
    // a second copy, so a failure here is logged with the id it could not
    // store, which is the only way back from the orphan.
    try {
      const stored = await storage.updateCarouselQuote(quote.id, { externalId });
      return { quote: stored ?? { ...quote, externalId }, syncedToAirtable: true };
    } catch (error) {
      log.error('Created an Airtable quote but could not store its id locally', {
        quoteId: quote.id,
        externalId,
        error,
      });
      return { quote: { ...quote, externalId }, syncedToAirtable: true };
    }
  } catch (error) {
    log.error('Failed to sync quote to Airtable', { quoteId: quote.id, error });
    return { quote, syncedToAirtable: false };
  }
}

/**
 * Removes one quote's Airtable record.
 *
 * Best-effort by contract: the caller is deleting the quote locally either way,
 * and reports what happened rather than failing the request. Returns whether
 * Airtable was actually cleared, so the caller can say so.
 */
export async function deleteCarouselQuoteFromAirtable(externalId: string): Promise<boolean> {
  const config = await optionalConfig('quotes');
  if (!config) {
    log.warn('Skipped Airtable quote delete: integration not configured', { externalId });
    return false;
  }

  try {
    const response = await deleteRecords(config, [externalId]);
    // Airtable answers 200 with a per-record flag; trust the flag, not the
    // status, before telling an editor the live site is clean.
    if (response.records?.[0]?.deleted === true) {
      log.info('Deleted Airtable quote record', { externalId });
      return true;
    }
    log.warn('Airtable did not confirm the quote delete', { externalId, response });
    return false;
  } catch (error) {
    if (await recordIsAlreadyGone(config, error)) {
      log.info('Airtable quote record was already gone', { externalId });
      return true;
    }
    log.error('Airtable quote delete failed', { externalId, error });
    return false;
  }
}

/**
 * Whether a failed delete means "that record does not exist" rather than "we
 * could not ask".
 *
 * A record deleted in Airtable directly is an ordinary case — the editor is
 * tidying up the same quote in both places — and reporting it as a failure
 * would send them chasing a problem that is already solved. But a renamed
 * table answers 404 too, and that one must not be read as success.
 *
 * Airtable's record-level error codes are not dependable enough to tell the two
 * apart from the message, so the table is probed instead: if it still reads,
 * the 404 was about the record.
 */
async function recordIsAlreadyGone(config: AirtableConfig, error: unknown): Promise<boolean> {
  if (!(error instanceof Error) || !/Airtable API error: 404\b/.test(error.message)) {
    return false;
  }

  try {
    await listRecords(config, { maxRecords: 1 });
    return true;
  } catch (probeError) {
    log.warn('Airtable quotes table is unreachable', { error: probeError });
    return false;
  }
}

/** Updates a single quote and mirrors the change locally. */
export async function updateCarouselQuoteInAirtable(
  quoteId: number,
  externalId: string,
  input: CarouselQuoteInput,
) {
  const config = await requireConfig('quotes');
  const fields = convertCarouselQuoteToAirtableFormat(input);

  const response = await writeRecords<AirtableCarouselQuoteFields>(config, 'PATCH', [
    { id: externalId, fields },
  ]);

  const quote = await storage.getCarouselQuote(quoteId);
  if (quote) {
    await storage.updateCarouselQuote(quote.id, {
      main: input.main ?? null,
      philo: input.philo ?? null,
    });
  }

  return response;
}

/**
 * Deletes records in Airtable-sized batches, counting each batch's outcome.
 *
 * Mirrors `runBatches`' failure handling: a batch that fails is recorded and
 * the run carries on, because a delete that cannot happen must not strand the
 * writes that already did.
 */
async function deleteBatches(
  config: AirtableConfig,
  recordIds: string[],
  results: SyncResults,
  label: string,
): Promise<void> {
  for (const [index, batch] of batched(recordIds).entries()) {
    try {
      const response = await deleteRecords(config, batch);
      // Count what Airtable says it removed, not what we asked it to.
      const removed = (response.records ?? []).filter((record) => record.deleted).length;
      results.deleted += removed;
      results.details.push(`Deleted ${removed} ${label} in batch ${index + 1}`);
    } catch (error) {
      results.errors += batch.length;
      results.details.push(`Error deleting batch ${index + 1}: ${String(error)}`);
      log.error('Airtable batch delete failed', { label, batch: index + 1, error });
    }
  }
}

/**
 * Sends records in Airtable-sized batches, counting each batch's outcome.
 *
 * Returns the ids of created records (empty for updates). A failed batch is
 * recorded and the run continues — one bad record should not strand the rest.
 */
async function runBatches<TFields>(
  config: AirtableConfig,
  method: 'POST' | 'PATCH',
  records: AirtableWriteRecord[],
  results: SyncResults,
  label: string,
): Promise<Array<string | undefined>> {
  // Indexed by position in `records`, with gaps where a batch failed, so a
  // failure part-way through cannot shift the remaining ids onto the wrong rows.
  const createdIds: Array<string | undefined> = new Array(records.length);
  let offset = 0;

  for (const [index, batch] of batched(records).entries()) {
    try {
      const response = await writeRecords<TFields>(config, method, batch);
      if (method === 'POST') {
        (response.records ?? []).forEach((record, position) => {
          createdIds[offset + position] = record.id;
        });
        results.created += batch.length;
        results.details.push(`Created ${batch.length} ${label} in batch ${index + 1}`);
      } else {
        results.updated += batch.length;
        results.details.push(`Updated ${batch.length} ${label} in batch ${index + 1}`);
      }
    } catch (error) {
      results.errors += batch.length;
      const verb = method === 'POST' ? 'creating' : 'updating';
      results.details.push(`Error ${verb} batch ${index + 1}: ${String(error)}`);
      log.error('Airtable batch write failed', { label, method, batch: index + 1, error });
    }
    offset += batch.length;
  }

  return createdIds;
}
