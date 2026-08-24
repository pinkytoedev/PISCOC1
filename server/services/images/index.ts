/**
 * Public surface for image handling.
 *
 * Two layers live behind this module:
 *
 *   `host.ts`         — the only code that talks to ImgBB
 *   `fetch.ts`        — the only code that pulls bytes off a remote URL
 *   `airtableLink.ts` — writing the resulting URL back onto an Airtable record
 *
 * The `uploadImageToImgBB` / `uploadImageUrlToImgBB` wrappers at the bottom are
 * the legacy contract: they swallow the error and return `null`. Every existing
 * caller branches on `if (!result)` — the ZIP processor, for instance, skips a
 * single failed image rather than discarding an otherwise good submission — so
 * that behaviour is preserved deliberately. New code should call the throwing
 * `uploadFileToImgBB` / `uploadUrlToImgBB` and let the error carry the reason.
 */

import { createLogger } from '../../lib/logger';
import {
  uploadFileToImgBB,
  uploadUrlToImgBB,
  type ImgBBImage,
  type UploadedFileInfo,
} from './host';

const log = createLogger('images');

export {
  ImageHostError,
  isImgBBConfigured,
  rehostRemoteImage,
  uploadBufferToImgBB,
  uploadFileToImgBB,
  uploadUrlToImgBB,
} from './host';
export type { ImgBBImage, ImgBBVariant, UploadedFileInfo } from './host';

export {
  ImageFetchError,
  assertFetchableImageUrl,
  classifyAddress,
  fetchRemoteImage,
} from './fetch';
export type { FetchedImage, FetchRemoteImageOptions } from './fetch';

export {
  AirtableWriteError,
  cleanupUploadedFile,
  createAirtableAttachmentFromFile,
  uploadImageToAirtable,
  uploadImageUrlAsLinkField,
  uploadImageUrlToAirtable,
  writeRecordFields,
} from './airtableLink';
export type { AirtableAttachment, AirtableRecordResponse } from './airtableLink';

/** Historical alias; the response shape is the ImgBB `data` object. */
export type ImgBBUploadResponse = ImgBBImage;

/** Legacy null-returning wrapper around {@link uploadFileToImgBB}. */
export async function uploadImageToImgBB(file: UploadedFileInfo): Promise<ImgBBImage | null> {
  try {
    return await uploadFileToImgBB(file);
  } catch (error) {
    log.error('ImgBB file upload failed', { filename: file.filename, error });
    return null;
  }
}

/** Legacy null-returning wrapper around {@link uploadUrlToImgBB}. */
export async function uploadImageUrlToImgBB(
  imageUrl: string,
  filename: string,
): Promise<ImgBBImage | null> {
  try {
    return await uploadUrlToImgBB(imageUrl, filename);
  } catch (error) {
    log.error('ImgBB URL upload failed', { filename, error });
    return null;
  }
}

