/**
 * Integration settings access.
 *
 * Credentials for Airtable and GitHub live in the `integration_settings`
 * table. ImgBB is deliberately not here — its key is environment-only.
 *
 * Before this module, 93 call sites read them directly — typically three
 * sequential `getIntegrationSettingByKey` awaits to assemble one Airtable
 * config, on every request. That is three round trips per call for values that
 * change perhaps once a month, and it left the "is it configured?" check
 * written slightly differently in each place.
 *
 * Reads go through a short-lived cache and a typed accessor per integration.
 * Writes invalidate, so a settings change takes effect immediately.
 */

import type { IntegrationSetting } from '@shared/schema';
import { storage } from '../storage';
import { createLogger } from '../lib/logger';

const log = createLogger('settings');

/**
 * Cache lifetime. Long enough to collapse the repeated reads inside a single
 * request, short enough that an external edit is picked up promptly even if an
 * invalidation is somehow missed.
 */
const TTL_MS = 30_000;

interface CacheEntry {
  settings: Map<string, IntegrationSetting>;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

async function loadService(service: string): Promise<Map<string, IntegrationSetting>> {
  const cached = cache.get(service);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.settings;
  }

  const rows = await storage.getIntegrationSettings(service);
  const settings = new Map(rows.map((row) => [row.key, row]));
  cache.set(service, { settings, expiresAt: Date.now() + TTL_MS });
  return settings;
}

/** Drops cached values so the next read reflects a write. */
export function invalidateSettings(service?: string): void {
  if (service) {
    cache.delete(service);
    return;
  }
  cache.clear();
}

/** Raw value for one key, or undefined when absent or blank. */
export async function getSettingValue(service: string, key: string): Promise<string | undefined> {
  const settings = await loadService(service);
  const value = settings.get(key)?.value;
  return value ? value : undefined;
}

/** Whether a setting exists, holds a value, and is enabled. */
export async function isSettingEnabled(service: string, key: string): Promise<boolean> {
  const settings = await loadService(service);
  const setting = settings.get(key);
  return Boolean(setting?.value && setting.enabled);
}

/** Reads several keys of one service in a single pass. */
export async function getSettingValues<K extends string>(
  service: string,
  keys: readonly K[],
): Promise<Partial<Record<K, string>>> {
  const settings = await loadService(service);
  const out: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = settings.get(key)?.value;
    if (value) out[key] = value;
  }
  return out;
}

/** Creates or updates a setting, then invalidates the cache. */
export async function putSetting(
  service: string,
  key: string,
  value: string,
  enabled = true,
): Promise<IntegrationSetting> {
  const existing = (await loadService(service)).get(key);

  const saved = existing
    ? await storage.updateIntegrationSetting(existing.id, { value, enabled })
    : await storage.createIntegrationSetting({ service, key, value, enabled });

  invalidateSettings(service);

  if (!saved) throw new Error(`Failed to save setting ${service}.${key}`);
  log.info('Setting updated', { service, key });
  return saved;
}

// ---------------------------------------------------------------------------
// Typed per-integration configuration
//
// Each accessor returns a fully-formed config or null. Callers branch once on
// null instead of repeating the "are all three of these present?" check.
// ---------------------------------------------------------------------------

export interface AirtableSettings {
  apiKey: string;
  baseId: string;
  articlesTable: string;
  /** Optional; the sync routines fall back to defaults when unset. */
  teamMembersTable?: string;
  carouselQuotesTable?: string;
}

export async function getAirtableSettings(): Promise<AirtableSettings | null> {
  const values = await getSettingValues('airtable', [
    'api_key',
    'base_id',
    'articles_table',
    'team_members_table',
    'carousel_quotes_table',
  ]);

  if (!values.api_key || !values.base_id || !values.articles_table) return null;

  return {
    apiKey: values.api_key,
    baseId: values.base_id,
    articlesTable: values.articles_table,
    teamMembersTable: values.team_members_table,
    carouselQuotesTable: values.carousel_quotes_table,
  };
}

// ImgBB has no accessor here on purpose: its key comes from `IMGBB_API_KEY`
// only. See `services/images/host.ts`.

export async function getGitHubToken(): Promise<string | undefined> {
  return getSettingValue('github', 'access_token');
}
