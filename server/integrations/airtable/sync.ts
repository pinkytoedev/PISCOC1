/**
 * Airtable → local database.
 *
 * Airtable is the editorial source of truth, so a sync overwrites the local row
 * for anything it can see. The exceptions are called out where they happen:
 * a record the scheduler has just published, and a team member's locally
 * uploaded photo.
 */

import type { InsertArticle, InsertCarouselQuote, InsertTeamMember } from '@shared/schema';
import { storage } from '../../storage';
import { isRecentlyPublished } from '../../publishState';
import { createLogger } from '../../lib/logger';
import { recordActivity } from '../../services/activity';
import { getArticleImages } from '../../utils/airtableHelpers';
import { configFor, listRecords, type AirtableConfig } from './client';
import {
  emptyResults,
  type AirtableArticleFields,
  type AirtableCarouselQuoteFields,
  type AirtableRecord,
  type AirtableTeamMemberFields,
  type SyncResults,
} from './types';

const log = createLogger('airtable:sync');

const PLACEHOLDER_IMAGE = 'https://placehold.co/600x400?text=No+Image';

export interface SyncOutcome {
  message: string;
  results: SyncResults;
}

/**
 * Pulls the Articles table.
 *
 * Positional credentials rather than a config object: `routes.ts` and the
 * webhook both call this with settings they have already loaded.
 */
export async function syncArticlesFromAirtable(
  apiKey: string,
  baseId: string,
  tableName: string,
  userId?: number,
): Promise<SyncOutcome> {
  const config = configFor(apiKey, baseId, tableName);
  const response = await listRecords<AirtableArticleFields>(config);
  const results = emptyResults();

  for (const record of response.records) {
    try {
      await syncArticleRecord(record, results);
    } catch (error) {
      results.errors++;
      results.details.push(`Error processing record ${record.id}: ${String(error)}`);
      log.error('Failed to sync article record', { recordId: record.id, error });
    }
  }

  await recordActivity({
    userId,
    action: 'sync',
    resource: 'article',
    resourceId: 'all',
    details: {
      source: 'airtable',
      total: response.records.length,
      created: results.created,
      updated: results.updated,
      errors: results.errors,
    },
  });

  log.info('Synced articles from Airtable', {
    total: response.records.length,
    created: results.created,
    updated: results.updated,
    errors: results.errors,
  });

  return {
    message: `Articles synced from Airtable (${response.records.length} total records processed)`,
    results,
  };
}

async function syncArticleRecord(
  record: AirtableRecord<AirtableArticleFields>,
  results: SyncResults,
): Promise<void> {
  const fields = record.fields;

  if (Object.keys(fields).length === 0) {
    results.errors++;
    results.details.push(`Record ${record.id}: No fields found in record`);
    return;
  }

  const title = firstString(fields, ['Name', 'name', 'title', 'Title', 'NAME'])
    ?? `Untitled Article (ID: ${record.id})`;
  const content = firstString(fields, ['Body', 'body', 'content', 'Content', 'BODY'])
    ?? 'This article content is not available.';
  const description = firstString(fields, ['Description', 'description', 'desc', 'Desc', 'DESCRIPTION'])
    ?? 'No description provided.';

  const images = getArticleImages(fields);

  // "Republished" is an editor's way of pulling a live article back to draft, so
  // it overrides Finished. The column name is matched loosely because bases have
  // been seen with trailing whitespace and inconsistent casing.
  const republished = hasRepublishedFlag(fields);
  const finished = Boolean(fields.Finished) && !republished;
  const scheduled = republished ? '' : (fields.Scheduled ?? '');
  const publishedAt = finished && scheduled ? new Date(scheduled) : null;

  const articleData: InsertArticle = {
    title,
    description,
    excerpt: null,
    content,
    contentFormat: 'html',
    imageUrl: images.main ?? PLACEHOLDER_IMAGE,
    imageType: 'url',
    imagePath: null,
    instagramImageUrl: images.instagram ?? '',
    featured: fields.Featured ? 'yes' : 'no',
    publishedAt,
    date: fields.Date ?? '',
    Scheduled: scheduled,
    finished,
    republished,
    author: firstOfLookup(fields['Name (from Author)']) ?? 'Unknown Author',
    // "none" rather than empty, because the editor's photo picker is a Select
    // and an empty value would leave it unset.
    photo: firstOfLookup(fields['Name (from Photo)']) ?? 'none',
    photoCredit: null,
    status: finished ? 'published' : 'draft',
    hashtags: fields.Hashtags ?? '',
    externalId: record.id,
    source: 'airtable',
  };

  if (!finished || republished) {
    if (isRecentlyPublished(record.id)) {
      // The scheduler published this locally and its Finished=true write to
      // Airtable is still in flight; reverting now would undo it.
      log.debug('Skipping draft-revert during publish race window', { recordId: record.id });
    } else {
      articleData.status = 'draft';
      // Scheduled is left in place for ordinary drafts — the auto-publisher
      // needs it — but a republished article must not look published.
      if (republished) articleData.publishedAt = null;
    }
  }

  const existing = await storage.getArticleByExternalId(record.id);
  if (existing) {
    await storage.updateArticle(existing.id, articleData);
    results.updated++;
    results.details.push(`Updated article: ${title}`);
  } else {
    await storage.createArticle(articleData);
    results.created++;
    results.details.push(`Created article: ${title}`);
  }
}

/** Pulls the Teams table. */
export async function syncTeamMembersFromAirtable(
  config: AirtableConfig,
  userId?: number,
): Promise<SyncOutcome> {
  const response = await listRecords<AirtableTeamMemberFields>(config);
  const results = emptyResults();

  for (const record of response.records) {
    try {
      const fields = record.fields;
      const name = fields.Name || `Team Member (ID: ${record.id})`;
      const role = firstRole(fields.Role) ?? 'Team Member';
      const bio = fields.Bio || 'Bio information not available.';

      if (fields.PhotoSub?.length) {
        results.details.push(
          `Record ${record.id}: has a PhotoSub reference that cannot be resolved without a second lookup`,
        );
      }

      const existing = await storage.getTeamMemberByExternalId(record.id);

      if (existing) {
        // imageUrl is deliberately omitted on update. The Teams table stores
        // photos as PhotoSub links we cannot resolve, so the sync has no image
        // to offer — writing the placeholder here erased every photo that had
        // been uploaded through the dashboard.
        await storage.updateTeamMember(existing.id, { name, role, bio, externalId: record.id });
        results.updated++;
        results.details.push(`Updated team member: ${name}`);
      } else {
        const memberData: InsertTeamMember = {
          name,
          role,
          bio,
          imageUrl: PLACEHOLDER_IMAGE,
          imageType: 'url',
          imagePath: null,
          externalId: record.id,
        };
        await storage.createTeamMember(memberData);
        results.created++;
        results.details.push(`Created team member: ${name}`);
      }
    } catch (error) {
      results.errors++;
      results.details.push(`Error processing record ${record.id}: ${String(error)}`);
      log.error('Failed to sync team member record', { recordId: record.id, error });
    }
  }

  await recordActivity({
    userId,
    action: 'sync',
    resource: 'team_member',
    resourceId: 'all',
    details: {
      source: 'airtable',
      total: response.records.length,
      created: results.created,
      updated: results.updated,
      errors: results.errors,
    },
  });

  return { message: 'Team members synced from Airtable', results };
}

/** Pulls the carousel quotes table. */
export async function syncCarouselQuotesFromAirtable(
  config: AirtableConfig,
  userId?: number,
): Promise<SyncOutcome> {
  const response = await listRecords<AirtableCarouselQuoteFields>(config);
  const results = emptyResults();

  // One read for the whole run: the old loop re-read every quote per record.
  const existingByExternalId = new Map(
    (await storage.getCarouselQuotes())
      .filter((quote) => quote.externalId)
      .map((quote) => [quote.externalId as string, quote]),
  );

  for (const record of response.records) {
    try {
      const main = record.fields.main || 'default';
      const philo = record.fields.philo || 'Quote information not available.';

      const quoteData: InsertCarouselQuote = {
        carousel: main,
        quote: philo,
        externalId: record.id,
      };

      const existing = existingByExternalId.get(record.id);
      if (existing) {
        await storage.updateCarouselQuote(existing.id, quoteData);
        results.updated++;
        results.details.push(`Updated carousel quote for: ${main}`);
      } else {
        await storage.createCarouselQuote(quoteData);
        results.created++;
        results.details.push(`Created carousel quote for: ${main}`);
      }
    } catch (error) {
      results.errors++;
      results.details.push(`Error processing record ${record.id}: ${String(error)}`);
      log.error('Failed to sync carousel quote record', { recordId: record.id, error });
    }
  }

  await recordActivity({
    userId,
    action: 'sync',
    resource: 'carousel_quote',
    resourceId: 'all',
    details: {
      source: 'airtable',
      total: response.records.length,
      created: results.created,
      updated: results.updated,
      errors: results.errors,
    },
  });

  return { message: 'Carousel quotes synced from Airtable', results };
}

/** First non-empty string among a set of candidate column names. */
function firstString(fields: AirtableArticleFields, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

function firstOfLookup(value: unknown): string | undefined {
  return Array.isArray(value) && typeof value[0] === 'string' && value[0] ? value[0] : undefined;
}

function firstRole(role: string[] | string | undefined): string | undefined {
  if (Array.isArray(role)) return role[0] || undefined;
  return role || undefined;
}

function hasRepublishedFlag(fields: AirtableArticleFields): boolean {
  const key = Object.keys(fields).find((name) => {
    const normalised = name.toLowerCase().replace(/\s+/g, '');
    return normalised === 'republished' || normalised.includes('republish');
  });
  return key ? Boolean(fields[key]) : false;
}
