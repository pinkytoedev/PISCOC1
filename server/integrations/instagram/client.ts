/**
 * Facebook Graph API client for the Instagram integration.
 *
 * Everything that talks to graph.facebook.com goes through `graphRequest`.
 * Before this module there were two parallel implementations — `instagram.ts`
 * and `instagramClient.ts` each hand-rolled `fetch` against the same endpoints,
 * pinned different API versions (v17.0 in one, v18.0 in the other), and
 * disagreed about which errors were fatal. Publishing an article took the
 * uncached, unretried path while the identical action from the dashboard took
 * the cached, rate-limited one.
 *
 * Three things are centralised here:
 *
 *   version    one constant, so bumping the Graph version is a one-line change
 *   auth       the access token travels in an `Authorization: Bearer` header
 *              rather than the query string, so it cannot end up in a request
 *              log, a proxy trace or an error message
 *   failure    non-2xx replies become `GraphApiError`, which carries Meta's
 *              numeric code so callers can tell "rate limited, retry" from
 *              "this image is rejected, try another host"
 */

import { createLogger } from '../../lib/logger';
import { HttpError } from '../../lib/httpError';
import { getInstagramSettings, getSettingValue, putSetting } from '../../services/settings';
import { getOrFetch, clearCache } from '../../utils/apiCache';

const log = createLogger('instagram:graph');

/**
 * Graph API version used for every call. Meta dates each version and retires it
 * roughly two years later, so this is expected to be bumped periodically —
 * which is the whole reason it is a single constant.
 */
export const GRAPH_API_VERSION = 'v18.0';

const GRAPH_HOST = 'https://graph.facebook.com';

/**
 * A Graph call that has not answered in this long is not going to. The old code
 * passed no signal at all, so a hung connection to Meta held an Express request
 * open until the socket timed out.
 */
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * App credentials. These are process-level rather than per-tenant, and are not
 * modelled in `lib/env` because the integration is optional — a deployment with
 * no Facebook app should boot fine and simply report Instagram as unconfigured.
 */
const APP_ID = process.env.FACEBOOK_APP_ID;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET;

export function getAppCredentials(): { appId?: string; appSecret?: string } {
  return { appId: APP_ID, appSecret: APP_SECRET };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Shape of the error envelope Meta returns on a failed Graph call. */
interface GraphErrorEnvelope {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

export class GraphApiError extends Error {
  /** HTTP status of the Graph reply. */
  readonly status: number;
  /** Meta's numeric error code, e.g. 4 = application request limit reached. */
  readonly code?: number;
  readonly subcode?: number;
  readonly type?: string;
  readonly fbTraceId?: string;

  constructor(
    status: number,
    message: string,
    detail: { code?: number; subcode?: number; type?: string; fbTraceId?: string } = {},
  ) {
    super(message);
    this.name = 'GraphApiError';
    this.status = status;
    this.code = detail.code;
    this.subcode = detail.subcode;
    this.type = detail.type;
    this.fbTraceId = detail.fbTraceId;
  }

  /**
   * Meta signals throttling with several distinct codes rather than a 429, so a
   * bare status check is not enough to decide whether a retry is worthwhile.
   */
  get isRateLimited(): boolean {
    if (this.status === 429) return true;
    return this.code === 4 || this.code === 17 || this.code === 32 || this.code === 613;
  }

  /** Transient conditions worth another attempt; everything else is terminal. */
  get isRetryable(): boolean {
    return this.isRateLimited || this.status >= 500;
  }
}

/**
 * Turns any failure from this module into something the HTTP layer can return.
 * A Graph 4xx is the caller's problem to see; anything else is ours, and its
 * detail stays in the logs.
 */
export function toHttpError(error: unknown, fallbackMessage: string): HttpError {
  if (error instanceof HttpError) return error;

  if (error instanceof GraphApiError) {
    if (error.isRateLimited) {
      return HttpError.tooManyRequests('Instagram is rate limiting this app; try again shortly');
    }
    // Meta's own 4xx text is safe to surface and is usually actionable
    // ("The image is not accessible", "Invalid OAuth access token").
    if (error.status >= 400 && error.status < 500) {
      return HttpError.badRequest(error.message);
    }
    return new HttpError(502, fallbackMessage);
  }

  return HttpError.internal(fallbackMessage);
}

/** Error text can echo a request; make sure a token never rides along with it. */
export function redactTokens(text: string): string {
  return text.replace(/(access_token=)[^&\s"']+/gi, '$1[redacted]');
}

// ---------------------------------------------------------------------------
// Rate limiting
//
// Meta enforces a rolling hourly budget per app, and exceeding it locks the app
// out for the remainder of the window — far more costly than delaying a single
// call. Requests are therefore counted per endpoint bucket and serialised
// within a bucket so two concurrent callers cannot both spend the last slot.
// ---------------------------------------------------------------------------

/** Requests per hour, per bucket. */
const RATE_LIMITS: Record<string, number> = {
  'app/subscriptions': 50,
  'me/accounts': 20,
  page: 20,
  media: 100,
  'media/publish': 25,
  default: 100,
};

const WINDOW_MS = 60 * 60 * 1000;

/** Minimum gap between two calls in the same bucket, to smooth bursts. */
const MIN_SPACING_MS = 150;

/**
 * How long a caller will wait for the window to roll over before giving up.
 * The previous limiter slept until `resetAt`, which could be nearly a full
 * hour with an Express request held open the whole time. Failing fast turns
 * that into a 429 the client can act on.
 */
const MAX_WAIT_FOR_WINDOW_MS = 5_000;

interface Bucket {
  count: number;
  windowEndsAt: number;
  lastStartedAt: number;
  /** Tail of the serialised chain of in-flight calls for this bucket. */
  chain: Promise<unknown>;
}

const buckets = new Map<string, Bucket>();

function limitFor(bucketName: string): number {
  return RATE_LIMITS[bucketName] ?? RATE_LIMITS.default;
}

function bucketFor(name: string): Bucket {
  let bucket = buckets.get(name);
  if (!bucket) {
    bucket = {
      count: 0,
      windowEndsAt: Date.now() + WINDOW_MS,
      lastStartedAt: 0,
      chain: Promise.resolve(),
    };
    buckets.set(name, bucket);
  }
  return bucket;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSlot(name: string, bucket: Bucket): Promise<void> {
  let now = Date.now();

  if (now >= bucket.windowEndsAt) {
    bucket.count = 0;
    bucket.windowEndsAt = now + WINDOW_MS;
  }

  if (bucket.count >= limitFor(name)) {
    const waitMs = bucket.windowEndsAt - now;
    if (waitMs > MAX_WAIT_FOR_WINDOW_MS) {
      throw new GraphApiError(429, `Local rate limit reached for "${name}"`, { code: 4 });
    }
    await delay(waitMs);
    now = Date.now();
    bucket.count = 0;
    bucket.windowEndsAt = now + WINDOW_MS;
  }

  const sinceLast = now - bucket.lastStartedAt;
  if (bucket.lastStartedAt > 0 && sinceLast < MIN_SPACING_MS) {
    await delay(MIN_SPACING_MS - sinceLast);
  }

  bucket.count += 1;
  bucket.lastStartedAt = Date.now();
}

/** Runs `fn` under the named bucket's budget, serialised against its peers. */
export function withRateLimit<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const bucket = bucketFor(name);

  const result = bucket.chain.then(async () => {
    await acquireSlot(name, bucket);
    return fn();
  });

  // The chain must not carry the rejection forward, or one failed call would
  // reject every request queued behind it.
  bucket.chain = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
}

/**
 * Retries a Graph call while it keeps failing for a transient reason.
 *
 * Bounded by construction: a `for` loop over a fixed attempt count, with the
 * final attempt's error rethrown. The version this replaces used `while (true)`
 * with the exit conditions spread across the body.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; label: string } = { label: 'graph call' },
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1_000;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const retryable = error instanceof GraphApiError && error.isRetryable;
      if (!retryable || attempt === attempts) break;

      const wait = baseDelayMs * 2 ** (attempt - 1);
      log.warn('Retrying Graph call', { label: options.label, attempt, waitMs: wait });
      await delay(wait);
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface GraphRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  /** Query parameters. The access token is never one of these. */
  query?: Record<string, string | number | undefined>;
  /** Form-encoded body, for the POST endpoints Meta exposes. */
  form?: Record<string, string>;
  accessToken: string;
  /** Rate-limit bucket; defaults to the first path segment. */
  bucket?: string;
  timeoutMs?: number;
}

function buildUrl(path: string, query?: GraphRequestOptions['query']): string {
  const url = new URL(`${GRAPH_HOST}/${GRAPH_API_VERSION}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function parseGraphError(status: number, body: string): GraphApiError {
  let envelope: GraphErrorEnvelope | undefined;
  try {
    envelope = JSON.parse(body) as GraphErrorEnvelope;
  } catch {
    // Meta occasionally answers with plain text (an HTML error page from a
    // load balancer, for instance); the raw body is the only detail available.
  }

  const detail = envelope?.error;
  const message = detail?.error_user_msg || detail?.message || redactTokens(body).slice(0, 500);

  return new GraphApiError(status, message || `Graph API returned ${status}`, {
    code: detail?.code,
    subcode: detail?.error_subcode,
    type: detail?.type,
    fbTraceId: detail?.fbtrace_id,
  });
}

/**
 * Issues one Graph API call and returns its parsed body.
 *
 * @throws {GraphApiError} on any non-2xx reply, a timeout, or an unparseable body.
 */
export async function graphRequest<T>(path: string, options: GraphRequestOptions): Promise<T> {
  const method = options.method ?? 'GET';
  const bucket = options.bucket ?? path.split('/')[0] ?? 'default';
  const url = buildUrl(path, options.query);

  return withRateLimit(bucket, async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          // Keeps the credential out of the URL, and therefore out of logs.
          Authorization: `Bearer ${options.accessToken}`,
          ...(options.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        body: options.form ? new URLSearchParams(options.form).toString() : undefined,
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new GraphApiError(504, `Graph API request failed: ${reason}`);
    }

    const text = await response.text();

    if (!response.ok) {
      const graphError = parseGraphError(response.status, text);
      log.warn('Graph API error', {
        path,
        method,
        status: graphError.status,
        code: graphError.code,
        subcode: graphError.subcode,
        fbTraceId: graphError.fbTraceId,
        detail: graphError.message,
      });
      throw graphError;
    }

    // A handful of Graph endpoints (the subscription writes) answer with the
    // bare literal `true` rather than an object.
    if (text === 'true') return true as unknown as T;
    if (text === 'false') return false as unknown as T;
    if (text.trim() === '') return undefined as unknown as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new GraphApiError(502, 'Graph API returned a body that is not JSON');
    }
  });
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/**
 * User access token obtained through Facebook Login. Required for anything
 * touching the Instagram Business Account: reading media, creating containers,
 * publishing.
 */
export async function getUserAccessToken(): Promise<string | null> {
  const settings = await getInstagramSettings();
  return settings?.accessToken ?? null;
}

/** Same, but raises the 401 the callers would otherwise all have to write. */
export async function requireUserAccessToken(): Promise<string> {
  const token = await getUserAccessToken();
  if (!token) {
    throw HttpError.unauthorized('Facebook access token is not configured');
  }
  return token;
}

/**
 * App access token, used for the app-level webhook subscription endpoints.
 *
 * Cached in the settings table because it is stable for the life of the app
 * secret; regenerating it on every webhook page load was one call per view
 * against a 50/hour budget.
 */
export async function getAppAccessToken(): Promise<string | null> {
  const cached = await getSettingValue('facebook', 'app_access_token');
  if (cached) return cached;

  if (!APP_ID || !APP_SECRET) {
    log.warn('Cannot mint an app access token: FACEBOOK_APP_ID or FACEBOOK_APP_SECRET is unset');
    return null;
  }

  try {
    // This is the one endpoint that cannot use a bearer header — it is the call
    // that produces the credential — so the secret goes in the query string.
    const data = await withRateLimit('oauth', async () => {
      const url = buildUrl('oauth/access_token', {
        client_id: APP_ID,
        client_secret: APP_SECRET,
        grant_type: 'client_credentials',
      });

      const response = await fetch(url, {
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
      const text = await response.text();

      if (!response.ok) throw parseGraphError(response.status, text);
      return JSON.parse(text) as { access_token?: string };
    });

    if (!data.access_token) {
      log.error('App access token response contained no token');
      return null;
    }

    await putSetting('facebook', 'app_access_token', data.access_token);
    log.info('Minted and stored a new app access token');
    return data.access_token;
  } catch (error) {
    log.error('Failed to mint app access token', { error });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Response caching
//
// `utils/apiCache` has no way to enumerate or namespace its keys. The old
// `clearInstagramCaches` tried to compensate by scanning `Object.keys(global)`
// for keys that were never there, so media caches were in practice never
// invalidated and a freshly published post did not appear in the dashboard for
// five minutes. Tracking the keys we create makes the clear exact.
// ---------------------------------------------------------------------------

export const CACHE_TTL = {
  /** Media listings change whenever something is posted. */
  SHORT: 5 * 60 * 1000,
  MEDIUM: 30 * 60 * 1000,
  /** The Page → Instagram account link effectively never changes. */
  LONG: 24 * 60 * 60 * 1000,
} as const;

const ownedCacheKeys = new Set<string>();

/** `getOrFetch`, but remembering the key so it can be invalidated later. */
export async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  ownedCacheKeys.add(key);
  return getOrFetch(key, fn, { ttl });
}

/** Drops one cached entry, or every entry this module owns. */
export function clearInstagramCaches(key?: string): void {
  if (key) {
    clearCache(key);
    ownedCacheKeys.delete(key);
    return;
  }

  log.debug('Clearing Instagram API caches', { keys: ownedCacheKeys.size });
  for (const owned of ownedCacheKeys) clearCache(owned);
  ownedCacheKeys.clear();
}
