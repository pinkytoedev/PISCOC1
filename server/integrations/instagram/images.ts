/**
 * Getting an image to somewhere Instagram will accept it from.
 *
 * The Graph API does not take an upload; it takes a URL, fetches it itself, and
 * is fussy about what it will accept — no redirects to signed URLs, no
 * `Content-Type: application/octet-stream`, no hosts it cannot reach. Article
 * cover images live on whatever host the contributor used, so a direct URL
 * frequently fails with a generic "media could not be fetched".
 *
 * Rather than guess which host will work, this module produces an ordered list
 * of candidate URLs for the same image and lets the caller try each until the
 * Graph API accepts one:
 *
 *   1. re-hosted on our own public domain (most reliable — we control it)
 *   2. re-hosted on ImgBB (works when our domain is unreachable from Meta)
 *   3. the original URL, stripped of query parameters (last resort)
 *
 * Replaces `server/utils/instagramImageProcessor.ts`, which did the same work
 * with synchronous `fs` calls on the request thread and never deleted anything
 * it downloaded.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '../../lib/logger';
import { env } from '../../lib/env';
import { recordActivity } from '../../services/activity';
import { fetchRemoteImage } from '../../services/images';

const log = createLogger('instagram:images');

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'instagram');

/** Served publicly by `middleware/staticMiddleware` under `/uploads`. */
const PUBLIC_PREFIX = '/uploads/instagram';

/** Downloaded copies are only needed while Meta fetches them. */
const RETENTION_MS = 24 * 60 * 60 * 1000;

/** A slow origin must not hold up the publish flow indefinitely. */
const DOWNLOAD_TIMEOUT_MS = 20_000;

/**
 * Instagram itself rejects anything much larger, and an unbounded write would
 * let a hostile URL fill the disk.
 */
const MAX_IMAGE_BYTES = env.uploads.maxImageBytes;

/**
 * Public origin Meta will fetch from.
 *
 * Deliberately not the request's own host: in development that is localhost,
 * which Meta cannot reach, and the resulting container creation fails with an
 * unhelpful error. Mirrors the resolution order in `services/uploadTokens`.
 */
function publicOrigin(): string {
  if (env.baseUrl) return env.baseUrl.replace(/\/$/, '');
  if (env.publicDomain) return `https://${env.publicDomain}`;
  return 'https://piscoc.pinkytoepaper.com';
}

/** Strips anything that could escape the upload directory or confuse Meta. */
function safeFilename(imageUrl: string): string {
  const lastSegment = imageUrl.split('?')[0].split('/').pop() ?? 'image';
  const cleaned = lastSegment.replace(/[^A-Za-z0-9._-]/g, '_').slice(-64) || 'image';
  const withExtension = /\.(jpe?g|png|gif|webp)$/i.test(cleaned) ? cleaned : `${cleaned}.jpg`;
  return `instagram_${Date.now()}_${withExtension}`;
}

/**
 * Downloads an image and re-serves it from our own domain.
 *
 * @returns Absolute URL Meta can fetch.
 */
export async function hostImageLocally(imageUrl: string): Promise<string> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  // The URL comes from an article's imageUrl, which is user-settable, so this
  // is a server-side request to an attacker-influenced address. `fetchRemoteImage`
  // resolves the host and rejects private, loopback and link-local targets —
  // including the cloud metadata endpoint — re-checking on every redirect hop,
  // and streams with a hard size cap rather than buffering whatever arrives.
  const { buffer } = await fetchRemoteImage(imageUrl, {
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
    maxBytes: MAX_IMAGE_BYTES,
  });

  if (buffer.byteLength === 0) {
    throw new Error('Source image is empty');
  }

  const filename = safeFilename(imageUrl);
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);

  const hostedUrl = `${publicOrigin()}${PUBLIC_PREFIX}/${filename}`;
  log.info('Re-hosted image for Instagram', { filename, bytes: buffer.byteLength });

  await recordActivity({
    action: 'upload',
    resource: 'instagram-image',
    resourceId: filename,
    details: { bytes: buffer.byteLength, hostedUrl },
  });

  return hostedUrl;
}

/**
 * Deletes re-hosted copies older than the retention window.
 *
 * Called opportunistically from `imageCandidates` rather than on a timer: the
 * directory only grows when something is posted, so that is exactly when it is
 * worth sweeping. Failures are logged and swallowed — a full disk is a problem,
 * but not one that should abort a publish.
 */
export async function cleanupHostedImages(olderThanMs = RETENTION_MS): Promise<number> {
  let removed = 0;

  try {
    const files = await fs.readdir(UPLOAD_DIR);
    const cutoff = Date.now() - olderThanMs;

    for (const file of files) {
      if (!file.startsWith('instagram_')) continue;

      const filePath = path.join(UPLOAD_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < cutoff) {
          await fs.unlink(filePath);
          removed += 1;
        }
      } catch (error) {
        log.debug('Could not sweep hosted image', { file, error });
      }
    }
  } catch (error) {
    // Missing directory just means nothing has been posted yet.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn('Failed to sweep hosted images', { error });
    }
    return removed;
  }

  if (removed > 0) log.info('Swept expired hosted images', { removed });
  return removed;
}

/** One way of exposing the same image to Meta. */
export interface ImageCandidate {
  /** Identifies the strategy in logs, e.g. `self-hosted`. */
  readonly strategy: string;
  /** Produces the URL; may fail, in which case the next candidate is tried. */
  resolve(): Promise<string>;
}

/**
 * Candidate URLs in the order they should be attempted.
 *
 * Returned lazily so a strategy's cost — a download, an ImgBB round trip — is
 * only paid if the preceding one was rejected.
 */
export function imageCandidates(originalUrl: string): ImageCandidate[] {
  return [
    {
      strategy: 'self-hosted',
      async resolve() {
        // Sweep before adding to the directory, so retention is enforced even
        // if nothing else ever calls the cleanup.
        void cleanupHostedImages().catch(() => undefined);
        return hostImageLocally(originalUrl);
      },
    },
    {
      strategy: 'imgbb',
      async resolve() {
        const { uploadToImgBB } = await import('../../utils/imageDownloader');
        return uploadToImgBB(originalUrl);
      },
    },
    {
      strategy: 'direct',
      async resolve() {
        // Query parameters are usually expiring signatures; Meta fetches the
        // URL some seconds later and often gets a 403 back.
        return originalUrl.split('?')[0];
      },
    },
  ];
}
