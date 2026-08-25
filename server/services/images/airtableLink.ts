/**
 * Writing an image back to an Airtable record.
 *
 * Airtable can hold an image two ways: as an attachment field, where Airtable
 * fetches and stores a copy, or as a plain URL field pointing at the hosted
 * image. The attachment path is fragile — Airtable rejects any attachment
 * object carrying properties other than `url`/`filename` with a 422, and it
 * refuses `data:` URLs above a modest size — which is why the link-field path
 * exists and is what the ImgBB flow actually uses.
 *
 * All three writers previously repeated the same block: three sequential
 * settings reads, a hand-built URL, a bearer header, and a ~40-line error
 * branch that logged the record id, the field name and the whole payload size
 * on failure. Credentials came from `storage` directly, so a settings change
 * took effect only after a restart. They now share one helper and read through
 * `lib/airtableClient`.
 */

import fsp from 'fs/promises';
import { getAirtableConfig, type AirtableConfig } from '../../lib/airtableClient';
import { createLogger } from '../../lib/logger';
import type { UploadedFileInfo } from './host';

const log = createLogger('images:airtable');

/** Airtable is not usually the slow party here; the timeout is a backstop. */
const REQUEST_TIMEOUT_MS = 15_000;

export interface AirtableAttachment {
  id: string;
  url: string;
  filename: string;
  size: number;
  type: string;
  width?: number;
  height?: number;
  thumbnails?: {
    small: { url: string; width: number; height: number };
    large: { url: string; width: number; height: number };
    full: { url: string; width: number; height: number };
  };
}

/** Shape of the record Airtable echoes back from a PATCH. */
export interface AirtableRecordResponse {
  id?: string;
  createdTime?: string;
  fields?: Record<string, unknown>;
}

/**
 * A rejected Airtable write, with the parts of the response callers act on.
 *
 * `type` is Airtable's machine-readable reason. `UNKNOWN_FIELD_NAME` in
 * particular is worth surfacing to the operator verbatim — it means the base is
 * missing a column, which no amount of retrying will fix.
 */
export class AirtableWriteError extends Error {
  readonly status: number;
  readonly type?: string;
  readonly body: string;

  constructor(status: number, body: string, type?: string) {
    super(`Airtable PATCH failed (${status}): ${body.slice(0, 400)}`);
    this.name = 'AirtableWriteError';
    this.status = status;
    this.body = body;
    this.type = type;
  }
}

function airtableErrorType(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      const detail = (parsed as { error?: unknown }).error;
      if (typeof detail === 'object' && detail !== null && 'type' in detail) {
        const type = (detail as { type?: unknown }).type;
        if (typeof type === 'string') return type;
      }
    }
  } catch {
    // Airtable occasionally returns an HTML error page; there is no type to read.
  }
  return undefined;
}

/** Attachment entries in that echo, as far as we rely on them. */
interface AirtableAttachmentResponse {
  id?: string;
  url?: string;
  size?: number;
}

function isAttachmentResponse(value: unknown): value is AirtableAttachmentResponse {
  return typeof value === 'object' && value !== null;
}

/**
 * PATCHes fields onto one record and returns the echoed record.
 *
 * `lib/airtableClient.updateRecord` discards the response body; the attachment
 * writers need it, because the URL Airtable assigns to a stored attachment is
 * not the URL that was sent.
 */
async function patchRecord(
  config: AirtableConfig,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecordResponse> {
  const table = encodeURIComponent(config.articlesTable);
  const url = `https://api.airtable.com/v0/${config.baseId}/${table}/${encodeURIComponent(recordId)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      // Airtable's body is the only part that says *why* — unknown field,
      // invalid attachment object, revoked token. A 403 in particular is
      // ambiguous between a bad key, missing scopes and a wrong table name.
      throw new AirtableWriteError(response.status, text, airtableErrorType(text));
    }

    return (text ? JSON.parse(text) : {}) as AirtableRecordResponse;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Airtable did not respond within ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requireConfig(): Promise<AirtableConfig> {
  const config = await getAirtableConfig();
  if (!config) throw new Error('Airtable integration is not configured');
  return config;
}

/**
 * Writes arbitrary fields to the article record and returns Airtable's echo.
 *
 * Throws rather than returning `null`, for the route handlers that need to
 * report the specific reason back to the operator.
 */
export async function writeRecordFields(
  recordId: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecordResponse> {
  return patchRecord(await requireConfig(), recordId, fields);
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/** Best-effort content type from a URL or filename; JPEG is the safe default. */
function guessMimeType(...candidates: string[]): string {
  for (const candidate of candidates) {
    const extension = candidate.toLowerCase().split('?')[0].split('#')[0].split('.').pop();
    if (extension && MIME_BY_EXTENSION[extension]) return MIME_BY_EXTENSION[extension];
  }
  return 'image/jpeg';
}

/**
 * Builds an attachment object from a local file as a `data:` URL.
 *
 * Kept for the prototype flow that predates ImgBB hosting. Airtable rejects
 * data URLs beyond roughly a megabyte, so anything real should go through
 * `uploadImageUrlAsLinkField` with an ImgBB URL instead.
 */
export async function createAirtableAttachmentFromFile(
  file: UploadedFileInfo,
): Promise<AirtableAttachment | null> {
  try {
    const data = await fsp.readFile(file.path);
    return {
      id: `file_${Date.now()}`,
      url: `data:${file.mimetype};base64,${data.toString('base64')}`,
      filename: file.filename,
      size: file.size,
      type: file.mimetype,
    };
  } catch (error) {
    log.error('Failed to build attachment from file', { filename: file.filename, error });
    return null;
  }
}

/**
 * Writes a local file to an Airtable attachment field as a `data:` URL.
 *
 * Returns `null` on failure rather than throwing: every caller treats a failed
 * image write as "report it and carry on", not as a reason to fail the request.
 */
export async function uploadImageToAirtable(
  file: UploadedFileInfo,
  recordId: string,
  fieldName: string,
): Promise<AirtableAttachment | null> {
  try {
    const config = await requireConfig();
    const buffer = await fsp.readFile(file.path);

    if (buffer.length > 1024 * 1024) {
      log.warn('Attachment exceeds 1MB; Airtable often rejects data URLs this large', {
        filename: file.filename,
        bytes: buffer.length,
      });
    }

    // Airtable accepts only `url` (and optionally `filename`) inside an
    // attachment object; anything else comes back as INVALID_ATTACHMENT_OBJECT.
    const dataUrl = `data:${file.mimetype};base64,${buffer.toString('base64')}`;
    const record = await patchRecord(config, recordId, { [fieldName]: [{ url: dataUrl }] });

    const stored = record.fields?.[fieldName];
    if (!Array.isArray(stored) || stored.length === 0) return null;

    const first: unknown = stored[0];
    if (!isAttachmentResponse(first) || !first.url) return null;

    return {
      id: first.id ?? `file_${Date.now()}`,
      url: first.url,
      filename: file.filename,
      size: file.size,
      type: file.mimetype,
    };
  } catch (error) {
    log.error('Failed to attach image to Airtable record', { recordId, fieldName, error });
    return null;
  }
}

/** Writes a remote URL to an Airtable attachment field; Airtable fetches it itself. */
export async function uploadImageUrlToAirtable(
  imageUrl: string,
  recordId: string,
  fieldName: string,
  filename: string,
): Promise<AirtableAttachment | null> {
  try {
    const config = await requireConfig();
    const resolvedFilename = filename || imageUrl.split('/').pop() || 'image.jpg';

    const record = await patchRecord(config, recordId, {
      [fieldName]: [{ url: imageUrl, filename: resolvedFilename }],
    });

    const stored = record.fields?.[fieldName];
    if (!Array.isArray(stored) || stored.length === 0) return null;

    const first: unknown = stored[0];
    if (!isAttachmentResponse(first) || !first.url) return null;

    return {
      id: first.id ?? `airtable_${Date.now()}`,
      url: first.url,
      filename: resolvedFilename,
      size: first.size ?? 0,
      type: guessMimeType(imageUrl, resolvedFilename),
    };
  } catch (error) {
    log.error('Failed to attach image URL to Airtable record', { recordId, fieldName, error });
    return null;
  }
}

/**
 * Writes a URL into a plain text/URL field rather than an attachment field.
 *
 * This is the path the ImgBB integration uses: the image is already hosted, so
 * Airtable only needs to remember where, and none of the attachment-object
 * restrictions apply.
 */
export async function uploadImageUrlAsLinkField(
  imageUrl: string,
  recordId: string,
  fieldName: string,
): Promise<boolean> {
  try {
    const config = await requireConfig();
    const record = await patchRecord(config, recordId, { [fieldName]: imageUrl });

    // Airtable echoes the stored value; a mismatch means the field is not the
    // plain text/URL field this function assumes.
    if (record.fields?.[fieldName] === imageUrl) return true;

    log.warn('Airtable stored a different value than the link that was sent', {
      recordId,
      fieldName,
    });
    return false;
  } catch (error) {
    log.error('Failed to write image link to Airtable record', { recordId, fieldName, error });
    return false;
  }
}

/**
 * Removes a temp file, tolerating its absence.
 *
 * Async, unlike the `existsSync`/`unlinkSync` pair it replaces — and without
 * the check, which was a race as well as a second blocking syscall. Callers
 * that do not await it still get the delete; failures are logged, never thrown,
 * because a leftover temp file must not fail a request that already succeeded.
 */
export async function cleanupUploadedFile(filePath: string): Promise<void> {
  try {
    await fsp.rm(filePath, { force: true });
  } catch (error) {
    log.warn('Failed to remove temp file', { filePath, error });
  }
}
