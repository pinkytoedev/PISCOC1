/**
 * Reading and publishing Instagram media.
 *
 * Publishing is a two-step handshake: create a container describing the post,
 * then publish that container. Meta fetches the image asynchronously between
 * the two, so the container is not immediately publishable.
 *
 * The code this replaces handled that with `await sleep(2000)` on the article
 * path and with nothing at all on the dashboard path — which is why manual
 * posts intermittently failed with "The media ID is not available" while
 * scheduled ones usually worked. Both paths now call `publishImage`, which
 * polls the container's `status_code` until Meta reports it FINISHED, within a
 * fixed attempt and time budget.
 */

import { createLogger } from '../../lib/logger';
import { HttpError } from '../../lib/httpError';
import { getSettingValue, putSetting, getInstagramSettings } from '../../services/settings';
import { recordActivity } from '../../services/activity';
import {
  CACHE_TTL,
  GraphApiError,
  cached,
  clearInstagramCaches,
  graphRequest,
  requireUserAccessToken,
  withRetry,
} from './client';
import { imageCandidates } from './images';

const log = createLogger('instagram:media');

/** Fields requested for every media read, so responses stay consistent. */
const MEDIA_FIELDS =
  'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username,children{id,media_type,media_url,thumbnail_url}';

// ---------------------------------------------------------------------------
// Graph response types
// ---------------------------------------------------------------------------

export interface InstagramMediaChild {
  id: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
}

export interface InstagramMedia {
  id: string;
  caption?: string;
  media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  permalink?: string;
  thumbnail_url?: string;
  timestamp?: string;
  username?: string;
  children?: { data: InstagramMediaChild[] };
}

interface FacebookPage {
  id: string;
  name?: string;
  access_token?: string;
}

interface PagedResponse<T> {
  data?: T[];
}

interface PageWithInstagram {
  instagram_business_account?: { id: string };
}

interface CreatedId {
  id?: string;
}

type ContainerStatusCode = 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';

interface ContainerStatus {
  id: string;
  status_code?: ContainerStatusCode;
  status?: string;
}

// ---------------------------------------------------------------------------
// Account discovery
// ---------------------------------------------------------------------------

/** Facebook Pages the logged-in user administers. */
export async function getUserPages(): Promise<FacebookPage[]> {
  const accessToken = await requireUserAccessToken();

  return cached('instagram:pages', CACHE_TTL.MEDIUM, async () => {
    const result = await graphRequest<PagedResponse<FacebookPage>>('me/accounts', {
      accessToken,
      bucket: 'me/accounts',
    });
    return result.data ?? [];
  });
}

/** Instagram Business Account linked to a Page, if there is one. */
export async function getInstagramBusinessAccount(pageId: string): Promise<string | null> {
  const accessToken = await requireUserAccessToken();

  return cached(`instagram:page-account:${pageId}`, CACHE_TTL.LONG, async () => {
    try {
      const page = await graphRequest<PageWithInstagram>(pageId, {
        accessToken,
        bucket: 'page',
        query: { fields: 'instagram_business_account' },
      });
      return page.instagram_business_account?.id ?? null;
    } catch (error) {
      // A Page the user administers but has no Instagram permission on is a
      // normal outcome of the scan, not a failure of the whole lookup.
      log.debug('Page has no reachable Instagram account', { pageId, error });
      return null;
    }
  });
}

/**
 * Instagram Business Account ID for this installation.
 *
 * Resolution order: the configured setting, the legacy discovered value, then a
 * scan of the user's Pages. The scan result is persisted so subsequent calls
 * cost nothing — it was previously one `me/accounts` call plus one call per
 * Page on every dashboard load, against a 20/hour budget.
 */
export async function getInstagramAccountId(): Promise<string | null> {
  const configured = (await getInstagramSettings())?.accountId;
  if (configured) return configured;

  // Where the discovery path has always written its result.
  const discovered = await getSettingValue('instagram', 'account_id');
  if (discovered) return discovered;

  const pages = await getUserPages();
  if (pages.length === 0) {
    log.warn('No Facebook Pages are associated with the connected account');
    return null;
  }

  for (const page of pages) {
    const accountId = await getInstagramBusinessAccount(page.id);
    if (accountId) {
      await putSetting('instagram', 'account_id', accountId);
      log.info('Discovered Instagram Business Account', { pageId: page.id });
      return accountId;
    }
  }

  log.warn('None of the connected Pages has an Instagram Business Account', {
    pagesChecked: pages.length,
  });
  return null;
}

/** Same, but raises the 404 every caller would otherwise repeat. */
async function requireInstagramAccountId(): Promise<string> {
  const accountId = await getInstagramAccountId();
  if (!accountId) {
    throw HttpError.notFound('No Instagram Business Account is linked to this Facebook account');
  }
  return accountId;
}

// ---------------------------------------------------------------------------
// Reading media
// ---------------------------------------------------------------------------

/** Largest page Meta will return for a media listing. */
const MAX_MEDIA_LIMIT = 100;
const DEFAULT_MEDIA_LIMIT = 25;

/**
 * Clamps a caller-supplied limit. `parseInt(req.query.limit)` used to reach the
 * Graph URL unchecked, so `?limit=abc` sent `limit=NaN` to Meta.
 */
export function normalizeMediaLimit(raw: unknown): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MEDIA_LIMIT;
  return Math.min(parsed, MAX_MEDIA_LIMIT);
}

export async function getInstagramMedia(limit = DEFAULT_MEDIA_LIMIT): Promise<InstagramMedia[]> {
  const accessToken = await requireUserAccessToken();
  const accountId = await requireInstagramAccountId();

  return cached(`instagram:media:${accountId}:${limit}`, CACHE_TTL.SHORT, async () => {
    const result = await graphRequest<PagedResponse<InstagramMedia>>(`${accountId}/media`, {
      accessToken,
      bucket: 'media',
      query: { fields: MEDIA_FIELDS, limit },
    });
    return result.data ?? [];
  });
}

export async function getInstagramMediaById(mediaId: string): Promise<InstagramMedia | null> {
  const accessToken = await requireUserAccessToken();

  return cached(`instagram:media-item:${mediaId}`, CACHE_TTL.MEDIUM, async () => {
    try {
      return await graphRequest<InstagramMedia>(mediaId, {
        accessToken,
        bucket: 'media',
        query: { fields: MEDIA_FIELDS },
      });
    } catch (error) {
      // Meta reports an unknown or inaccessible media ID as a 400, which the
      // route needs to distinguish from a genuine failure so it can 404.
      if (error instanceof GraphApiError && error.status >= 400 && error.status < 500) {
        return null;
      }
      throw error;
    }
  });
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

/** Container readiness poll: bounded in both attempts and elapsed time. */
const CONTAINER_POLL_ATTEMPTS = 10;
const CONTAINER_POLL_INTERVAL_MS = 2_000;
const CONTAINER_POLL_BUDGET_MS = 30_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Creates a media container for one already-hosted image URL. */
async function createContainer(
  accountId: string,
  accessToken: string,
  imageUrl: string,
  caption: string,
): Promise<string> {
  const result = await withRetry(
    () =>
      graphRequest<CreatedId>(`${accountId}/media`, {
        method: 'POST',
        accessToken,
        bucket: 'media',
        form: { image_url: imageUrl, caption },
      }),
    { label: 'create media container' },
  );

  if (!result?.id) throw new GraphApiError(502, 'Graph API returned no container ID');
  return result.id;
}

/**
 * Waits for Meta to finish fetching the container's image.
 *
 * Returns once the container is FINISHED. Throws on ERROR or EXPIRED, and on
 * exhausting the budget — publishing an unfinished container fails anyway, and
 * a clear timeout is easier to act on than Meta's generic rejection.
 */
async function waitForContainer(containerId: string, accessToken: string): Promise<void> {
  const deadline = Date.now() + CONTAINER_POLL_BUDGET_MS;

  for (let attempt = 1; attempt <= CONTAINER_POLL_ATTEMPTS; attempt++) {
    const status = await graphRequest<ContainerStatus>(containerId, {
      accessToken,
      bucket: 'media',
      query: { fields: 'status_code,status' },
    });

    switch (status.status_code) {
      case 'FINISHED':
      case 'PUBLISHED':
        return;
      case 'ERROR':
      case 'EXPIRED':
        throw new GraphApiError(
          400,
          `Instagram could not process the image (${status.status_code}): ${status.status ?? 'no detail'}`,
        );
      default:
        break;
    }

    if (Date.now() + CONTAINER_POLL_INTERVAL_MS >= deadline) break;
    log.debug('Container still processing', { containerId, attempt });
    await delay(CONTAINER_POLL_INTERVAL_MS);
  }

  throw new GraphApiError(504, 'Instagram did not finish processing the image in time');
}

/** Publishes a container that has already reported FINISHED. */
async function publishContainer(
  accountId: string,
  accessToken: string,
  containerId: string,
): Promise<string> {
  const result = await withRetry(
    () =>
      graphRequest<CreatedId>(`${accountId}/media_publish`, {
        method: 'POST',
        accessToken,
        bucket: 'media/publish',
        form: { creation_id: containerId },
      }),
    { label: 'publish media container' },
  );

  if (!result?.id) throw new GraphApiError(502, 'Graph API returned no media ID');
  return result.id;
}

export interface PublishResult {
  mediaId: string;
  containerId: string;
  /** Which image-hosting strategy Meta ultimately accepted. */
  strategy: string;
}

/**
 * The whole publish flow: find a URL Meta will accept, create the container,
 * wait for it, publish it.
 *
 * This is the single entry point for both the dashboard's "create post" button
 * and the scheduler's article publishing, so the two can no longer drift.
 */
export async function publishImage(imageUrl: string, caption: string): Promise<PublishResult> {
  const accessToken = await requireUserAccessToken();
  const accountId = await requireInstagramAccountId();

  const candidates = imageCandidates(imageUrl);
  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      const hostedUrl = await candidate.resolve();
      const containerId = await createContainer(accountId, accessToken, hostedUrl, caption.trim());

      await waitForContainer(containerId, accessToken);
      const mediaId = await publishContainer(accountId, accessToken, containerId);

      log.info('Published Instagram post', { mediaId, strategy: candidate.strategy });

      // The listing endpoints cache for five minutes; without this the post the
      // user just made is missing from the dashboard they are returned to.
      clearInstagramCaches();

      return { mediaId, containerId, strategy: candidate.strategy };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(`${candidate.strategy}: ${reason}`);
      log.warn('Image hosting strategy rejected', { strategy: candidate.strategy, reason });

      // A rate limit or an expired token will fail identically for every
      // candidate; retrying them just burns quota.
      if (error instanceof GraphApiError && (error.isRateLimited || error.code === 190)) {
        throw error;
      }
    }
  }

  throw new GraphApiError(502, `Instagram rejected every image source — ${failures.join('; ')}`);
}

// ---------------------------------------------------------------------------
// Article publishing
// ---------------------------------------------------------------------------

/**
 * The parts of an article this module needs.
 *
 * Structural rather than the full `Article` type so a schema change elsewhere
 * cannot silently break the scheduler's call, and so tests can pass a literal.
 */
export interface PostableArticle {
  id: number | string;
  title: string;
  /** Airtable's InstaPhotoLink; nothing is posted without it. */
  instagramImageUrl?: string | null;
  /** Used verbatim as the caption, exactly as the editor wrote it. */
  hashtags?: string | null;
}

export interface ArticlePostResult {
  success: boolean;
  mediaId?: string;
  error?: string;
}

/**
 * Posts an article to Instagram.
 *
 * Best-effort by contract: both callers (the scheduler and the article update
 * route) have already published the article by the time this runs, so a failure
 * is reported in the return value rather than thrown.
 */
export async function postArticleToInstagram(
  article: PostableArticle,
): Promise<ArticlePostResult> {
  const articleId = String(article.id);

  if (!article.instagramImageUrl) {
    log.info('Skipping Instagram post: article has no Instagram image', { articleId });
    return { success: false, error: 'No Instagram image URL found for this article' };
  }

  // The hashtags field is the caption, used exactly as entered — editors format
  // it themselves, and anything appended here would show up in the post.
  const caption = article.hashtags?.trim() ?? '';

  try {
    const { mediaId, strategy } = await publishImage(article.instagramImageUrl, caption);

    await recordActivity({
      action: 'publish',
      resource: 'article',
      resourceId: articleId,
      details: { target: 'instagram', mediaId, strategy },
    });

    log.info('Posted article to Instagram', { articleId, mediaId });
    return { success: true, mediaId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('Failed to post article to Instagram', { articleId, error });

    await recordActivity({
      action: 'publish',
      resource: 'article',
      resourceId: articleId,
      details: { target: 'instagram', failed: true, error: message },
    });

    return { success: false, error: message };
  }
}
