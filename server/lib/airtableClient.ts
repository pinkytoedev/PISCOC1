/**
 * Single entry point for Airtable REST calls.
 *
 * The codebase previously rebuilt the same request by hand in 19 places: three
 * settings lookups, a template-literal URL, a bearer header and a `fetch`. That
 * duplication is why one call site forgot to URL-encode the table name and why
 * failures were reported inconsistently. Everything now goes through here.
 */

import { storage } from '../storage';
import { log } from '../vite';

export interface AirtableConfig {
  apiKey: string;
  baseId: string;
  articlesTable: string;
}

/** Thrown when a caller needs Airtable but it has not been configured. */
export class AirtableNotConfiguredError extends Error {
  constructor() {
    super('Airtable integration is not configured');
    this.name = 'AirtableNotConfiguredError';
  }
}

/**
 * Reads Airtable credentials from integration settings.
 * Returns `null` rather than throwing so callers can treat a missing
 * integration as "skip the sync" instead of "fail the request".
 */
export async function getAirtableConfig(): Promise<AirtableConfig | null> {
  const [apiKey, baseId, articlesTable] = await Promise.all([
    storage.getIntegrationSettingByKey('airtable', 'api_key'),
    storage.getIntegrationSettingByKey('airtable', 'base_id'),
    storage.getIntegrationSettingByKey('airtable', 'articles_table'),
  ]);

  if (!apiKey?.value || !baseId?.value || !articlesTable?.value) {
    return null;
  }

  return {
    apiKey: apiKey.value,
    baseId: baseId.value,
    articlesTable: articlesTable.value,
  };
}

function recordUrl(config: AirtableConfig, recordId?: string): string {
  // Both the table name and the record id are encoded: table names routinely
  // contain spaces, and an unencoded id would let a stray value alter the path.
  const table = encodeURIComponent(config.articlesTable);
  const base = `https://api.airtable.com/v0/${config.baseId}/${table}`;
  return recordId ? `${base}/${encodeURIComponent(recordId)}` : base;
}

interface AirtableRequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  recordId?: string;
  body?: unknown;
  /** Aborts the call if Airtable does not respond in time. */
  timeoutMs?: number;
}

async function request<T>(
  config: AirtableConfig,
  { method, recordId, body, timeoutMs = 15_000 }: AirtableRequestOptions,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(recordUrl(config, recordId), {
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
      // The response body carries Airtable's reason (unknown field, invalid
      // permissions, …) which is the only useful part of the failure.
      throw new Error(`Airtable ${method} failed (${response.status}): ${text}`);
    }

    return (text ? JSON.parse(text) : {}) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Patches fields on an existing record. */
export async function updateRecord(
  config: AirtableConfig,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await request(config, { method: 'PATCH', recordId, body: { fields } });
}

/** Creates a record and returns its Airtable id. */
export async function createRecord(
  config: AirtableConfig,
  fields: Record<string, unknown>,
): Promise<string> {
  const data = await request<{ records?: Array<{ id: string }> }>(config, {
    method: 'POST',
    body: { records: [{ fields }] },
  });

  const id = data.records?.[0]?.id;
  if (!id) {
    throw new Error('Airtable create returned no record id');
  }
  return id;
}

/**
 * Runs an Airtable update without letting a failure break the caller.
 *
 * Most sync points are best-effort: the local write already succeeded and the
 * user should not see an error because a third party is down. Callers that do
 * need the failure should use `updateRecord` directly.
 */
export async function tryUpdateRecord(
  recordId: string,
  fields: Record<string, unknown>,
  context: string,
): Promise<boolean> {
  try {
    const config = await getAirtableConfig();
    if (!config) {
      log(`Airtable not configured; skipping ${context}`, 'airtable');
      return false;
    }
    await updateRecord(config, recordId, fields);
    return true;
  } catch (error) {
    log(`Failed ${context}: ${error instanceof Error ? error.message : String(error)}`, 'airtable');
    return false;
  }
}
