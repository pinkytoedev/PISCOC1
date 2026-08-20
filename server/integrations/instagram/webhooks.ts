/**
 * Instagram webhooks: verification, inbound events, and subscription management.
 *
 * Meta calls `/api/instagram/webhooks/callback` unauthenticated — the GET is the
 * hub challenge, the POST carries events — so the only things standing between
 * a stranger and this code are the verify token and the payload signature. Both
 * are checked here.
 *
 * Subscription state is authoritative on Meta's side. The previous version
 * treated the local `integration_settings` rows as authoritative instead: a
 * subscription whose Graph call failed was still written locally and reported
 * as `success: true`, so the settings page listed subscriptions that did not
 * exist, and deleting one Meta had listed always failed because no matching
 * local row was there to find.
 */

import crypto from 'crypto';
import type { Request } from 'express';
import type { ActivityLog } from '@shared/schema';
import { createLogger } from '../../lib/logger';
import { HttpError } from '../../lib/httpError';
import { storage } from '../../storage';
import { getInstagramSettings } from '../../services/settings';
import {
  CACHE_TTL,
  cached,
  clearInstagramCaches,
  getAppAccessToken,
  getAppCredentials,
  getUserAccessToken,
  graphRequest,
} from './client';

const log = createLogger('instagram:webhooks');

/** Prefix every webhook activity carries; the logs endpoint filters on it. */
const ACTIVITY_PREFIX = 'instagram_webhook_';

const SUBSCRIPTION_SETTING_PREFIX = 'webhook_subscription_';

const SUBSCRIPTIONS_CACHE_KEY = 'instagram:webhook-subscriptions';

/** The object type this app subscribes to on Meta's side. */
const SUBSCRIBED_OBJECT = 'instagram';

/**
 * Field groups offered by the settings UI.
 *
 * Kept as-is: the client renders these keys directly and posts the selected
 * group's array straight back to `/subscribe`.
 */
export const WEBHOOK_FIELD_GROUPS = {
  BASIC: ['mentions', 'comments'],
  MEDIA: ['media'],
  STORIES: ['story_insights'],
  MESSAGING: ['messaging_webhook_events'],
  ALL: ['mentions', 'comments', 'media', 'story_insights', 'messaging_webhook_events'],
};

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

/**
 * Records a webhook event to the activity log.
 *
 * Deliberately bypasses `services/activity`: that module's action vocabulary is
 * a closed union of CRUD verbs, which does not model "a third party told us
 * something happened". More concretely, `/api/instagram/webhooks/logs` and the
 * settings page both select rows by the `instagram_webhook_` action prefix, so
 * remapping these onto `publish`/`update` would empty that view.
 *
 * Never throws — a failure to log must not turn a 200 into a retry storm from
 * Meta.
 */
async function recordWebhookActivity(event: string, details: Record<string, unknown> = {}) {
  try {
    await storage.createActivityLog({
      action: `${ACTIVITY_PREFIX}${event}`,
      userId: null,
      resourceType: 'instagram_webhook',
      resourceId: null,
      details: { timestamp: new Date().toISOString(), ...details },
    });
  } catch (error) {
    log.error('Failed to record webhook activity', { event, error });
  }
}

/** Activity rows the settings page shows under "webhook events". */
export async function getWebhookLogs(): Promise<ActivityLog[]> {
  const logs = await storage.getActivityLogs();
  return logs.filter((entry) => entry.action.startsWith(ACTIVITY_PREFIX));
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/** Token Meta echoes back during hub verification. */
async function getVerifyToken(): Promise<string | undefined> {
  const configured = (await getInstagramSettings())?.verifyToken;
  return configured || process.env.INSTAGRAM_VERIFY_TOKEN || undefined;
}

export interface ChallengeResult {
  ok: boolean;
  /** Echoed back verbatim on success; Meta compares it byte for byte. */
  challenge?: string;
}

/**
 * Handles the `hub.mode=subscribe` challenge Meta sends when a callback URL is
 * registered or re-verified.
 */
export async function verifyHubChallenge(query: Request['query']): Promise<ChallengeResult> {
  const mode = typeof query['hub.mode'] === 'string' ? query['hub.mode'] : undefined;
  const token = typeof query['hub.verify_token'] === 'string' ? query['hub.verify_token'] : undefined;
  const challenge =
    typeof query['hub.challenge'] === 'string' ? query['hub.challenge'] : undefined;

  const expected = await getVerifyToken();

  if (!expected) {
    // Without a configured token any caller could complete verification and
    // point our callback at their own app.
    log.error('Webhook verification attempted but no verify token is configured');
    await recordWebhookActivity('verification_failed', { mode, reason: 'not_configured' });
    return { ok: false };
  }

  if (mode !== 'subscribe' || !token || !timingSafeEquals(token, expected)) {
    log.warn('Webhook verification rejected', { mode });
    await recordWebhookActivity('verification_failed', { mode });
    return { ok: false };
  }

  log.info('Webhook verified');
  await recordWebhookActivity('verification_success', { mode });
  return { ok: true, challenge };
}

function timingSafeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // `timingSafeEqual` throws on a length mismatch, so that has to be checked
  // first — and a length difference is not itself a secret.
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Checks the `X-Hub-Signature` HMAC on an inbound event.
 *
 * The digest is computed over the raw request bytes, captured by the
 * `express.json({ verify })` hook in `server/index.ts`. Re-serialising
 * `req.body` would not do: `JSON.stringify` normalises key order, whitespace
 * and unicode escaping, so the reconstructed string is not the string Meta
 * signed, and a valid delivery could be rejected.
 *
 * Verification is skipped when no app secret is configured, matching the
 * previous behaviour: a deployment with no Facebook app should not 403 the
 * endpoint it never receives calls on.
 */
export function verifyWebhookSignature(req: Request): boolean {
  const { appSecret } = getAppCredentials();
  if (!appSecret) {
    log.warn('FACEBOOK_APP_SECRET is unset; accepting webhook without signature verification');
    return true;
  }

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    // A signed delivery must never be accepted on a re-serialised body.
    log.error('Raw body unavailable; cannot verify webhook signature');
    return false;
  }

  const payload = rawBody;

  // Meta sends both headers; sha256 is the current one.
  const candidates: Array<{ header: string; algorithm: string }> = [
    { header: 'x-hub-signature-256', algorithm: 'sha256' },
    { header: 'x-hub-signature', algorithm: 'sha1' },
  ];

  for (const { header, algorithm } of candidates) {
    const supplied = req.headers[header];
    if (typeof supplied !== 'string') continue;

    const [prefix, digest] = supplied.split('=');
    if (prefix !== algorithm || !digest) continue;

    const expected = crypto.createHmac(algorithm, appSecret).update(payload).digest('hex');
    if (timingSafeEquals(digest, expected)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Inbound events
// ---------------------------------------------------------------------------

interface WebhookChange {
  field?: string;
  value?: unknown;
}

interface WebhookMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { mid?: string; text?: string };
  delivery?: unknown;
  read?: unknown;
  timestamp?: number;
}

interface WebhookEntry {
  id?: string;
  time?: number;
  changes?: WebhookChange[];
  messaging?: WebhookMessagingEvent[];
}

export interface WebhookPayload {
  object?: string;
  entry?: WebhookEntry[];
}

/**
 * Change fields we understand, mapped to the activity name they are recorded
 * under. The names are the ones the settings page already knows how to label.
 */
const CHANGE_ACTIVITY: Record<string, string> = {
  mentions: 'mention',
  comments: 'comment',
  media: 'media',
  story_insights: 'story_insight',
};

/**
 * Records an inbound payload.
 *
 * Recording is all this does. Nothing downstream consumes mentions, comments or
 * DMs yet; the endpoint exists so the subscription stays healthy and so the
 * events are visible in the settings page while that changes.
 */
export async function processWebhookPayload(payload: WebhookPayload): Promise<void> {
  await recordWebhookActivity('event_received', { object: payload.object, data: payload });

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const activity = change.field ? CHANGE_ACTIVITY[change.field] : undefined;
      if (activity) {
        await recordWebhookActivity(activity, { value: change.value });
      } else {
        log.info('Unhandled Instagram change notification', { field: change.field });
        await recordWebhookActivity('unhandled_change', {
          field: change.field,
          value: change.value,
        });
      }
    }

    for (const event of entry.messaging ?? []) {
      if (event.message) {
        await recordWebhookActivity('message_received', {
          senderId: event.sender?.id,
          recipientId: event.recipient?.id,
          messageId: event.message.mid,
          text: event.message.text,
          eventTimestamp: event.timestamp,
        });
      } else if (event.delivery) {
        await recordWebhookActivity('message_delivery', { delivery: event.delivery });
      } else if (event.read) {
        await recordWebhookActivity('message_read', { read: event.read });
      } else {
        await recordWebhookActivity('unhandled_messaging_event', { event });
      }
    }

    await recordWebhookActivity('entry_processed', { entryId: entry.id });
  }
}

/** Records a rejected payload; the route answers 403. */
export async function recordInvalidSignature(): Promise<void> {
  log.warn('Rejected webhook with an invalid signature');
  await recordWebhookActivity('invalid_signature');
}

/** Records a payload that blew up mid-processing; the route still answers 200. */
export async function recordProcessingError(error: unknown): Promise<void> {
  log.error('Failed to process webhook event', { error });
  await recordWebhookActivity('event_processing_error', {
    error: error instanceof Error ? error.message : String(error),
  });
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export interface WebhookSubscription {
  object: string;
  callback_url: string;
  active: boolean;
  fields: string[];
  subscription_id: string;
}

interface GraphSubscription {
  object?: string;
  callback_url?: string;
  active?: boolean;
  fields?: Array<string | { name: string }>;
}

/**
 * Stable identifier for a subscription as Meta reports it.
 *
 * Meta does not assign subscription IDs — a subscription is identified by
 * (object, fields) — so one is derived. It must be deterministic, because the
 * delete route receives it back and has to find the same subscription again.
 */
function subscriptionIdFor(object: string, fields: string[]): string {
  return `sub_${object}_${[...fields].sort().join('_')}`;
}

/** Meta returns fields either as strings or as `{ name }` objects. */
function normalizeFields(fields: GraphSubscription['fields']): string[] {
  return (fields ?? []).map((field) => (typeof field === 'string' ? field : field.name));
}

async function fetchGraphSubscriptions(appAccessToken: string): Promise<WebhookSubscription[]> {
  const result = await graphRequest<{ data?: GraphSubscription[] }>('app/subscriptions', {
    accessToken: appAccessToken,
    bucket: 'app/subscriptions',
  });

  return (result.data ?? []).map((sub) => {
    const object = sub.object ?? SUBSCRIBED_OBJECT;
    const fields = normalizeFields(sub.fields);
    return {
      object,
      callback_url: sub.callback_url ?? '',
      active: sub.active ?? true,
      fields,
      subscription_id: subscriptionIdFor(object, fields),
    };
  });
}

/** Locally recorded subscriptions, kept only as a fallback view. */
async function fetchLocalSubscriptions(): Promise<WebhookSubscription[]> {
  const settings = await storage.getIntegrationSettings(SUBSCRIBED_OBJECT);
  const rows = settings.filter((setting) => setting.key.startsWith(SUBSCRIPTION_SETTING_PREFIX));

  const parsed: WebhookSubscription[] = [];
  for (const row of rows) {
    try {
      parsed.push(JSON.parse(row.value) as WebhookSubscription);
    } catch (error) {
      log.warn('Skipping unparseable stored subscription', { key: row.key, error });
    }
  }
  return parsed;
}

export async function getWebhookSubscriptions(): Promise<WebhookSubscription[]> {
  return cached(SUBSCRIPTIONS_CACHE_KEY, CACHE_TTL.SHORT, async () => {
    const appAccessToken = await getAppAccessToken();

    if (appAccessToken) {
      try {
        return await fetchGraphSubscriptions(appAccessToken);
      } catch (error) {
        log.warn('Falling back to stored subscriptions; Graph lookup failed', { error });
      }
    }

    return fetchLocalSubscriptions();
  });
}

/**
 * Subscribes the app to a set of Instagram webhook fields.
 *
 * Fails loudly when Meta rejects the call. The version this replaces caught the
 * Graph error, wrote a local record anyway and returned `success: true`, so a
 * misconfigured callback URL looked like a working subscription.
 */
export async function subscribeToWebhook(
  fields: string[],
  callbackUrl: string,
  verifyToken?: string,
): Promise<WebhookSubscription> {
  const appAccessToken = await getAppAccessToken();
  if (!appAccessToken) {
    throw new HttpError(
      502,
      'Cannot subscribe: no app access token. Check FACEBOOK_APP_ID and FACEBOOK_APP_SECRET.',
    );
  }

  const token = verifyToken || (await getVerifyToken());
  if (!token) {
    throw HttpError.badRequest(
      'A verify token is required. Set INSTAGRAM_VERIFY_TOKEN or supply one with the request.',
    );
  }

  log.info('Subscribing to Instagram webhooks', { fields, callbackUrl });

  try {
    const accepted = await graphRequest<boolean | { success?: boolean }>('app/subscriptions', {
      method: 'POST',
      accessToken: appAccessToken,
      bucket: 'app/subscriptions',
      form: {
        object: SUBSCRIBED_OBJECT,
        callback_url: callbackUrl,
        fields: fields.join(','),
        verify_token: token,
      },
    });

    const succeeded = accepted === true || (typeof accepted === 'object' && accepted?.success);
    if (!succeeded) {
      throw new HttpError(502, 'Instagram did not confirm the subscription');
    }
  } catch (error) {
    await recordWebhookActivity('subscription_error', {
      error: error instanceof Error ? error.message : String(error),
      fields,
      callbackUrl,
    });
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      `Instagram rejected the subscription: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const subscription: WebhookSubscription = {
    object: SUBSCRIBED_OBJECT,
    callback_url: callbackUrl,
    active: true,
    fields,
    subscription_id: subscriptionIdFor(SUBSCRIBED_OBJECT, fields),
  };

  // Kept as a local record so the settings page still shows something if the
  // Graph lookup is unavailable later.
  try {
    await storage.createIntegrationSetting({
      service: SUBSCRIBED_OBJECT,
      key: `${SUBSCRIPTION_SETTING_PREFIX}${subscription.subscription_id}`,
      value: JSON.stringify(subscription),
      enabled: true,
    });
  } catch (error) {
    log.warn('Subscription created but not recorded locally', { error });
  }

  clearInstagramCaches(SUBSCRIPTIONS_CACHE_KEY);
  await recordWebhookActivity('subscription_created', {
    fields,
    callbackUrl,
    subscriptionId: subscription.subscription_id,
  });

  return subscription;
}

/**
 * Removes a subscription, both at Meta and locally.
 *
 * The ID may come from either source, so it is resolved against both. The old
 * implementation looked only at local rows and had a `TODO` where the Graph
 * call belonged — meaning "unsubscribe" on a Meta-reported subscription
 * returned a 500, and on a local one silently left the subscription live.
 */
export async function unsubscribeFromWebhook(
  subscriptionId: string,
): Promise<{ success: boolean }> {
  const settingKey = `${SUBSCRIPTION_SETTING_PREFIX}${subscriptionId}`;
  const localRow = await storage.getIntegrationSettingByKey(SUBSCRIBED_OBJECT, settingKey);

  let target: WebhookSubscription | undefined;
  if (localRow) {
    try {
      target = JSON.parse(localRow.value) as WebhookSubscription;
    } catch {
      // A corrupt row still identifies which subscription was meant.
    }
  }

  const appAccessToken = await getAppAccessToken();

  if (!target && appAccessToken) {
    const remote = await getWebhookSubscriptions();
    target = remote.find((sub) => sub.subscription_id === subscriptionId);
  }

  if (!target && !localRow) {
    throw HttpError.notFound(`Subscription ${subscriptionId} not found`);
  }

  if (appAccessToken && target) {
    try {
      await graphRequest<boolean>('app/subscriptions', {
        method: 'DELETE',
        accessToken: appAccessToken,
        bucket: 'app/subscriptions',
        query: {
          object: target.object,
          // Scoped to the fields of this subscription; omitting `fields` would
          // drop every subscription on the object.
          fields: target.fields.join(','),
        },
      });
    } catch (error) {
      await recordWebhookActivity('unsubscribe_error', {
        subscription_id: subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      });
      // The local row is left in place so the settings page keeps reflecting
      // the subscription that is, in fact, still live.
      throw new HttpError(
        502,
        `Instagram refused to remove the subscription: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (localRow) {
    await storage.deleteIntegrationSetting(localRow.id);
  }

  clearInstagramCaches(SUBSCRIPTIONS_CACHE_KEY);
  await recordWebhookActivity('unsubscribe_success', { subscription_id: subscriptionId });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export interface WebhookConnectionTest {
  success: boolean;
  appId: boolean;
  appSecret: boolean;
  accessToken: boolean;
  appAccessToken: boolean;
  message: string;
  details?: unknown;
}

/**
 * Reports which pieces of the webhook configuration are present, then proves
 * the app token actually works by listing subscriptions with it.
 *
 * The shape is consumed field by field by the settings page's diagnostics
 * panel, so it is preserved exactly.
 */
export async function testWebhookConnection(): Promise<WebhookConnectionTest> {
  const { appId, appSecret } = getAppCredentials();

  const result: WebhookConnectionTest = {
    success: false,
    appId: Boolean(appId),
    appSecret: Boolean(appSecret),
    accessToken: false,
    appAccessToken: false,
    message: '',
  };

  try {
    result.accessToken = Boolean(await getUserAccessToken());

    if (!result.appId) {
      result.message = 'Facebook App ID is missing';
      return result;
    }
    if (!result.appSecret) {
      result.message = 'Facebook App Secret is missing';
      return result;
    }
    if (!result.accessToken) {
      result.message = 'User Access Token is missing - please log in with Facebook';
      return result;
    }

    const appAccessToken = await getAppAccessToken();
    result.appAccessToken = Boolean(appAccessToken);
    if (!appAccessToken) {
      result.message = 'Failed to generate App Access Token';
      return result;
    }

    const subscriptions = await fetchGraphSubscriptions(appAccessToken);
    result.success = true;
    result.message = 'Webhook connection is properly configured';
    result.details = { subscriptions: subscriptions.length };
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('Webhook connection test failed', { error });
    result.message = `API test failed: ${message}`;
    result.details = { error: message };
    return result;
  }
}
