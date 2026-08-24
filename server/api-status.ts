/**
 * Integration status probes.
 *
 * Backs the dashboard's "is everything up?" panel. Each probe is a cheap,
 * read-only call against one dependency, and every one of them is bounded by a
 * timeout: the endpoint runs all four concurrently, so without a deadline a
 * single unresponsive third party would hold the whole page open.
 */

import axios from 'axios';
import { pgPool } from './db';
import { createLogger } from './lib/logger';
import { getImgBBApiKey, getSettingValue } from './services/settings';

const log = createLogger('api-status');

/** Long enough for a healthy service, short enough that the panel stays responsive. */
const PROBE_TIMEOUT_MS = 5_000;

export interface ApiStatus {
  name: string;
  status: 'online' | 'offline' | 'unknown';
  message?: string;
  lastChecked: Date;
}

export interface ApiStatusResponse {
  statuses: ApiStatus[];
  timestamp: Date;
}

function online(name: string): ApiStatus {
  return { name, status: 'online', lastChecked: new Date() };
}

/** "We cannot tell" — the integration has not been configured at all. */
function unconfigured(name: string, message: string): ApiStatus {
  return { name, status: 'unknown', message, lastChecked: new Date() };
}

function offline(name: string, message: string): ApiStatus {
  return { name, status: 'offline', message, lastChecked: new Date() };
}

function describe(error: unknown): string {
  if (axios.isAxiosError(error)) {
    // The status code is the useful part; response bodies from these endpoints
    // can echo back the credential that was sent.
    return error.response ? `HTTP ${error.response.status}` : error.message;
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Runs one probe, turning any escape into an "offline" result.
 *
 * Keeps each check to its own success path — previously every one of them
 * carried an identical try/catch that reconstructed the same object.
 */
async function probe(name: string, check: () => Promise<ApiStatus>): Promise<ApiStatus> {
  try {
    return await check();
  } catch (error) {
    log.debug('Probe failed', { integration: name, error });
    return offline(name, describe(error));
  }
}

/**
 * Airtable.
 *
 * `meta/bases` is used rather than a record read because it validates the key
 * without needing a base or table to be configured yet. It is also why this
 * probe does not go through `lib/airtableClient`, which only speaks the record
 * API.
 */
function checkAirtable(): Promise<ApiStatus> {
  return probe('Airtable', async () => {
    const apiKey = await getSettingValue('airtable', 'api_key');
    if (!apiKey) return unconfigured('Airtable', 'API key not configured');

    const response = await axios.get('https://api.airtable.com/v0/meta/bases', {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: PROBE_TIMEOUT_MS,
    });

    return response.status >= 200 && response.status < 300
      ? online('Airtable')
      : offline('Airtable', `HTTP ${response.status}`);
  });
}

/**
 * ImgBB.
 *
 * There is no status endpoint, so the probe posts nothing to the upload URL and
 * reads the rejection: a 400 ("no image supplied") means the service answered,
 * which is all the panel needs to know.
 */
function checkImgBB(): Promise<ApiStatus> {
  return probe('ImgBB', async () => {
    const apiKey = await getImgBBApiKey();
    if (!apiKey) return unconfigured('ImgBB', 'API key not configured');

    try {
      await axios.get('https://api.imgbb.com/1/upload', {
        params: { key: apiKey },
        timeout: PROBE_TIMEOUT_MS,
      });
      return online('ImgBB');
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        return online('ImgBB');
      }
      throw error;
    }
  });
}

/**
 * Database.
 *
 * A bare `SELECT 1`. The previous check called `getAllUsers()`, which read
 * every user row — password hashes included — into memory on every poll of the
 * status panel.
 */
function checkDatabase(): Promise<ApiStatus> {
  return probe('Database', async () => {
    await pgPool.query('SELECT 1');
    return online('Database');
  });
}

/** Runs every probe concurrently; the slowest one bounds the response. */
export async function getAllApiStatuses(): Promise<ApiStatusResponse> {
  const statuses = await Promise.all([
    checkAirtable(),
    checkImgBB(),
    checkDatabase(),
  ]);

  return { statuses, timestamp: new Date() };
}
