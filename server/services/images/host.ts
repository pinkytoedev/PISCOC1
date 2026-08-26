/**
 * ImgBB image hosting — the one place the server talks to api.imgbb.com.
 *
 * There used to be four: `utils/imgbbUploader` (file and URL uploads),
 * `utils/imageDownloader` (re-hosting, with an API key hard-coded in the
 * source), `integrations/imgbb` (an inline copy of the URL upload) and the
 * migration script. Each had its own idea of what a failure was — one returned
 * `null`, one threw, one logged and continued — none had a timeout, none
 * retried, and one leaked key material into the log by printing the settings
 * object. Consolidating them means one retry policy, one error type, and one
 * place where the key is read.
 */

import fsp from 'fs/promises';
import { env } from '../../lib/env';
import { createLogger } from '../../lib/logger';
import { fetchRemoteImage } from './fetch';

const log = createLogger('images:host');

const IMGBB_ENDPOINT = 'https://api.imgbb.com/1/upload';

/** ImgBB re-encodes large uploads, so it is slower than a plain API call. */
const REQUEST_TIMEOUT_MS = 30_000;

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

/** A file on local disk that is about to be hosted. */
export interface UploadedFileInfo {
  path: string;
  filename: string;
  size: number;
  mimetype: string;
}

/** One of the resized variants ImgBB returns alongside the original. */
export interface ImgBBVariant {
  filename: string;
  name: string;
  mime: string;
  extension: string;
  url: string;
}

/** The `data` object of a successful ImgBB upload. */
export interface ImgBBImage {
  id: string;
  /** Direct link to the full-size image — what gets stored on the article. */
  url: string;
  display_url: string;
  delete_url?: string;
  url_viewer?: string;
  title?: string;
  time?: string;
  expiration?: string;
  /** ImgBB returns these numeric fields as strings on some responses. */
  width?: number | string;
  height?: number | string;
  size?: number | string;
  image?: ImgBBVariant;
  medium?: ImgBBVariant;
  thumb?: ImgBBVariant;
}

/** The full envelope; `success` is the only reliable indicator of the outcome. */
interface ImgBBEnvelope {
  data?: ImgBBImage;
  success?: boolean;
  status?: number;
  error?: { message?: string; code?: number };
}

export class ImageHostError extends Error {
  readonly status?: number;
  /** Whether another attempt could plausibly succeed. */
  readonly retryable: boolean;

  constructor(message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = 'ImageHostError';
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

/**
 * Resolves the API key.
 *
 * `IMGBB_API_KEY` is the only source. The key used to be editable in the CMS
 * and stored in `integration_settings`, and that copy won whenever it was
 * present — so a key saved once and since rotated kept overriding the value the
 * deployment actually sets, and uploads failed with no indication of why.
 */
function resolveApiKey(): string {
  if (!env.imgbbApiKey) {
    throw new ImageHostError('ImgBB API key is not configured (set IMGBB_API_KEY)');
  }
  return env.imgbbApiKey;
}

/** Whether ImgBB is usable at all, without attempting an upload. */
export function isImgBBConfigured(): boolean {
  return Boolean(env.imgbbApiKey);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Posts one multipart request to ImgBB.
 *
 * `image` is either base64-encoded bytes or a URL for ImgBB to fetch itself —
 * the API accepts both in the same field.
 */
async function postToImgBB(image: string, filename: string | undefined, apiKey: string): Promise<ImgBBImage> {
  const form = new FormData();
  form.append('key', apiKey);
  form.append('image', image);
  if (filename) form.append('name', filename);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(IMGBB_ENDPOINT, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new ImageHostError(`ImgBB upload failed (${response.status}): ${text.slice(0, 300)}`, {
        status: response.status,
        // 429 and 5xx are the transient ones; a 4xx means the request is wrong.
        retryable: response.status === 429 || response.status >= 500,
      });
    }

    let envelope: ImgBBEnvelope;
    try {
      envelope = JSON.parse(text) as ImgBBEnvelope;
    } catch {
      throw new ImageHostError(`ImgBB returned a non-JSON response: ${text.slice(0, 200)}`, {
        retryable: true,
      });
    }

    if (!envelope.success || !envelope.data) {
      throw new ImageHostError(`ImgBB upload failed: ${envelope.error?.message ?? 'unknown error'}`, {
        status: envelope.status,
      });
    }

    return envelope.data;
  } catch (error) {
    if (error instanceof ImageHostError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ImageHostError(`ImgBB did not respond within ${REQUEST_TIMEOUT_MS}ms`, {
        status: 504,
        retryable: true,
      });
    }
    // Connection reset, DNS failure and similar are worth another attempt.
    throw new ImageHostError(
      `ImgBB request failed: ${error instanceof Error ? error.message : String(error)}`,
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
  }
}

/** The single retry policy: bounded attempts, exponential backoff, transient errors only. */
async function uploadWithRetry(image: string, filename: string | undefined, context: string): Promise<ImgBBImage> {
  const apiKey = resolveApiKey();

  let lastError: ImageHostError | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await postToImgBB(image, filename, apiKey);
      if (attempt > 1) log.info('ImgBB upload succeeded after retry', { context, attempt });
      return result;
    } catch (error) {
      lastError = error instanceof ImageHostError ? error : new ImageHostError(String(error));

      if (!lastError.retryable || attempt === MAX_ATTEMPTS) break;

      const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      log.warn('ImgBB upload failed; retrying', {
        context,
        attempt,
        delayMs: delay,
        error: lastError.message,
      });
      await sleep(delay);
    }
  }

  throw lastError ?? new ImageHostError('ImgBB upload failed');
}

/**
 * Hosts raw bytes.
 *
 * ImgBB is given base64 rather than a binary part because that is the form the
 * API documents and the form this codebase has always used successfully; the
 * cost is a ~33% larger request body, bounded by the upload size limits.
 */
export async function uploadBufferToImgBB(buffer: Buffer, filename: string): Promise<ImgBBImage> {
  return uploadWithRetry(buffer.toString('base64'), filename, filename);
}

/** Hosts a file from local disk. The file is left in place for the caller to clean up. */
export async function uploadFileToImgBB(file: UploadedFileInfo): Promise<ImgBBImage> {
  // Async read: the synchronous `readFileSync` this replaces blocked the event
  // loop for the whole of a multi-megabyte read, on every single upload.
  const buffer = await fsp.readFile(file.path);
  log.debug('Uploading file to ImgBB', { filename: file.filename, bytes: buffer.length });
  return uploadBufferToImgBB(buffer, file.filename);
}

/**
 * Hands ImgBB a URL and lets it do the fetching.
 *
 * Nothing is downloaded here, so no bytes cross this server — but by the same
 * token there is no content check either. Use `rehostRemoteImage` when the URL
 * came from a user and the result has to be a real image.
 */
export async function uploadUrlToImgBB(imageUrl: string, filename?: string): Promise<ImgBBImage> {
  log.debug('Asking ImgBB to fetch a URL', { filename });
  return uploadWithRetry(imageUrl, filename, filename ?? 'remote-url');
}

/**
 * Downloads a remote image through the SSRF-guarded fetcher and re-hosts it.
 *
 * This is the path for URLs that came from article records: the guard, the size
 * cap and the content-type check all apply before anything is forwarded on.
 */
export async function rehostRemoteImage(imageUrl: string, filename?: string): Promise<ImgBBImage> {
  const image = await fetchRemoteImage(imageUrl);
  const name = filename ?? imageUrl.split('/').pop()?.split('?')[0] ?? 'image';
  return uploadBufferToImgBB(image.buffer, name);
}
