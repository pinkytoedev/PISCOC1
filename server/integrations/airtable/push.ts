/**
 * Local database → Airtable.
 *
 * Article pushes are single-record and go through the shared client. Team
 * members and quotes are pushed wholesale, so they are batched: Airtable caps a
 * write at ten records and a partial failure must not abort the rest of the run.
 */

import type { Article } from '@shared/schema';
import { storage } from '../../storage';
import { HttpError } from '../../lib/httpError';
import { createLogger } from '../../lib/logger';
import { recordActivity } from '../../services/activity';
import {
  batched,
  createRecord,
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
    throw new Error('Article not found');
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
      fields: { ...convertTeamMemberToAirtableFormat(member) },
    })),
    results,
    'team members',
  );

  const created = await runBatches<AirtableTeamMemberFields>(
    config,
    'POST',
    toCreate.map((member) => ({ fields: { ...convertTeamMemberToAirtableFormat(member) } })),
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

/** Pushes every carousel quote, creating the ones Airtable has never seen. */
export async function pushCarouselQuotesToAirtable(
  config: AirtableConfig,
  userId?: number,
): Promise<SyncResults> {
  const quotes = await storage.getCarouselQuotes();
  const results = emptyResults();

  const toUpdate = quotes.filter((quote) => quote.externalId);
  const toCreate = quotes.filter((quote) => !quote.externalId);

  await runBatches(
    config,
    'PATCH',
    toUpdate.map((quote) => ({
      id: quote.externalId as string,
      fields: { ...convertCarouselQuoteToAirtableFormat(quote) },
    })),
    results,
    'quotes',
  );

  const created = await runBatches<AirtableCarouselQuoteFields>(
    config,
    'POST',
    toCreate.map((quote) => ({ fields: { ...convertCarouselQuoteToAirtableFormat(quote) } })),
    results,
    'quotes',
  );

  for (let i = 0; i < toCreate.length; i++) {
    const externalId = created[i];
    if (externalId) await storage.updateCarouselQuote(toCreate[i].id, { externalId });
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
      errors: results.errors,
    },
  });

  return results;
}

/** Updates a single quote and mirrors the change locally. */
export async function updateCarouselQuoteInAirtable(
  quoteId: number,
  externalId: string,
  input: CarouselQuoteInput,
): Promise<void> {
  const config = await requireConfig('quotes');
  const fields = convertCarouselQuoteToAirtableFormat(input);

  await writeRecords<AirtableCarouselQuoteFields>(config, 'PATCH', [{ id: externalId, fields }]);

  const quote = await storage.getCarouselQuote(quoteId);
  if (quote) {
    await storage.updateCarouselQuote(quote.id, {
      main: input.main ?? null,
      philo: input.philo ?? null,
    });
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
