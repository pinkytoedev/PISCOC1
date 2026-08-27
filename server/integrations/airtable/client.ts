/**
 * Airtable transport for this integration.
 *
 * Single-record writes go through `lib/airtableClient`; what lives here is what
 * that module deliberately does not cover — paginated reads, batched writes,
 * and picking which of the three configured tables a call targets.
 *
 * Every URL is built in one place, so the table name cannot be left unencoded
 * the way it was at several of the old call sites.
 */

import { HttpError } from '../../lib/httpError';
import { createLogger } from '../../lib/logger';
import { getAirtableSettings, getSettingValue, isSettingEnabled } from '../../services/settings';
import type { AirtableConfig } from '../../lib/airtableClient';
import { createRecord, updateRecord } from '../../lib/airtableClient';
import type { AirtableListResponse, AirtableWriteRecord } from './types';

const log = createLogger('airtable:client');

export type { AirtableConfig };
export { createRecord, updateRecord };

/** Airtable rejects create/update batches larger than this. */
export const BATCH_LIMIT = 10;

/** Airtable's own per-page maximum. */
const PAGE_SIZE = 100;

/** Upper bound on records a single list call will walk. */
const MAX_RECORDS = 10_000;

const REQUEST_TIMEOUT_MS = 20_000;

/** Which of the configured tables a call targets. */
export type AirtableTable = 'articles' | 'teamMembers' | 'quotes';

/**
 * Setting keys per table, in precedence order.
 *
 * The carousel table has always been stored under `quotes_table`;
 * `services/settings` calls the same thing `carousel_quotes_table`. Both are
 * accepted so an existing install keeps working whichever key it wrote.
 */
const TABLE_SETTING_KEYS: Record<AirtableTable, readonly string[]> = {
  articles: ['articles_table'],
  teamMembers: ['team_members_table'],
  quotes: ['quotes_table', 'carousel_quotes_table'],
};

/**
 * Resolves credentials and the target table name.
 *
 * `AirtableConfig.articlesTable` is simply "the table this call addresses" as
 * far as the shared client is concerned, so the resolved name goes there
 * whichever table it actually is.
 *
 * Throws a 400 rather than returning null: every caller is a route that has to
 * tell the operator their integration is not set up.
 */
export async function requireConfig(target: AirtableTable = 'articles'): Promise<AirtableConfig> {
  const settings = await getAirtableSettings();
  if (!settings) {
    throw HttpError.badRequest('Airtable settings are not fully configured');
  }

  const table = await resolveTable(target);
  if (!table) {
    throw HttpError.badRequest('Airtable settings are not fully configured');
  }

  // A setting can hold a value and still be switched off; the old code checked
  // this on some routes and not others.
  const enabled = await Promise.all(
    ['api_key', 'base_id', table.key].map((key) => isSettingEnabled('airtable', key)),
  );
  if (enabled.some((ok) => !ok)) {
    throw HttpError.badRequest('Some Airtable settings are disabled');
  }

  return { apiKey: settings.apiKey, baseId: settings.baseId, articlesTable: table.name };
}

/**
 * Same resolution as `requireConfig`, but answers null instead of throwing.
 *
 * Used by paths where Airtable is a mirror rather than the point of the
 * request — deleting a quote, for instance, must still remove it locally when
 * the integration is switched off or half-configured.
 */
export async function optionalConfig(target: AirtableTable): Promise<AirtableConfig | null> {
  try {
    return await requireConfig(target);
  } catch (error) {
    if (error instanceof HttpError) return null;
    throw error;
  }
}

async function resolveTable(target: AirtableTable): Promise<{ key: string; name: string } | null> {
  for (const key of TABLE_SETTING_KEYS[target]) {
    const name = await getSettingValue('airtable', key);
    if (name) return { key, name };
  }
  return null;
}

/** Builds a config for an explicitly supplied table, used by the exported helpers. */
export function configFor(apiKey: string, baseId: string, tableName: string): AirtableConfig {
  return { apiKey, baseId, articlesTable: tableName };
}

function tableUrl(config: AirtableConfig, recordId?: string, search?: URLSearchParams): string {
  const base = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.articlesTable)}`;
  const url = recordId ? `${base}/${encodeURIComponent(recordId)}` : base;
  const query = search?.toString();
  return query ? `${url}?${query}` : url;
}

async function send<T>(
  config: AirtableConfig,
  url: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      // Callers classify failures by matching the status in this string
      // (403/404/422/INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND), so the shape is
      // load-bearing.
      throw new Error(`Airtable API error: ${response.status} - ${text}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  } finally {
    clearTimeout(timer);
  }
}

export type QueryParams = Record<string, string | number | boolean>;

/**
 * Reads a table, following Airtable's `offset` cursor to the end.
 *
 * The page walk is bounded: a base that keeps returning the same offset used to
 * spin this loop forever, holding the request open.
 */
export async function listRecords<TFields>(
  config: AirtableConfig,
  params: QueryParams = {},
): Promise<AirtableListResponse<TFields>> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    search.append(key, String(value));
  }
  if (!params.maxRecords) search.append('maxRecords', String(MAX_RECORDS));
  if (!params.pageSize) search.append('pageSize', String(PAGE_SIZE));

  const maxPages = Math.ceil(MAX_RECORDS / PAGE_SIZE);
  const records: AirtableListResponse<TFields>['records'] = [];
  let offset: string | undefined;
  let page = 0;

  do {
    const pageSearch = new URLSearchParams(search);
    if (offset) pageSearch.set('offset', offset);

    const data = await send<AirtableListResponse<TFields>>(
      config,
      tableUrl(config, undefined, pageSearch),
      'GET',
    );

    if (Array.isArray(data.records)) records.push(...data.records);
    offset = data.offset;
    page++;

    if (offset && page >= maxPages) {
      log.warn('Stopped paging Airtable at the page cap', {
        table: config.articlesTable,
        pages: page,
        records: records.length,
      });
      break;
    }
  } while (offset);

  log.debug('Listed Airtable records', {
    table: config.articlesTable,
    pages: page,
    records: records.length,
  });

  return { records };
}

/** Creates or updates up to `BATCH_LIMIT` records in one call. */
export async function writeRecords<TFields>(
  config: AirtableConfig,
  method: 'POST' | 'PATCH',
  records: AirtableWriteRecord[],
): Promise<AirtableListResponse<TFields>> {
  if (records.length > BATCH_LIMIT) {
    throw new Error(`Airtable accepts at most ${BATCH_LIMIT} records per write`);
  }
  return send<AirtableListResponse<TFields>>(config, tableUrl(config), method, { records });
}

/**
 * Deletes up to `BATCH_LIMIT` records in one call.
 *
 * Airtable takes the ids as repeated `records[]` query parameters rather than a
 * body, which is why this cannot reuse `writeRecords`.
 */
export async function deleteRecords(
  config: AirtableConfig,
  recordIds: string[],
): Promise<{ records: Array<{ id: string; deleted: boolean }> }> {
  if (recordIds.length > BATCH_LIMIT) {
    throw new Error(`Airtable accepts at most ${BATCH_LIMIT} records per delete`);
  }

  const search = new URLSearchParams();
  for (const id of recordIds) search.append('records[]', id);

  return send<{ records: Array<{ id: string; deleted: boolean }> }>(
    config,
    tableUrl(config, undefined, search),
    'DELETE',
  );
}

/** Splits a list into Airtable-sized batches. */
export function batched<T>(items: T[], size = BATCH_LIMIT): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * Deletes one record.
 *
 * Keeps its positional signature because `routes.ts` calls it with credentials
 * it has already loaded.
 */
export async function deleteAirtableRecord(
  apiKey: string,
  baseId: string,
  tableName: string,
  recordId: string,
): Promise<{ id: string; deleted: boolean }> {
  const config = configFor(apiKey, baseId, tableName);
  log.info('Deleting Airtable record', { table: tableName, recordId });
  return send<{ id: string; deleted: boolean }>(
    config,
    tableUrl(config, recordId),
    'DELETE',
  );
}
