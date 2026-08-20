/**
 * Compatibility barrel.
 *
 * The Airtable image write-back moved to `server/services/images/airtableLink`.
 * This path is kept because `integrations/airtable.ts` and
 * `integrations/airtableTest.ts` import from it; new code should import from
 * `../services/images` directly.
 *
 * One signature changed: `cleanupUploadedFile` now returns a promise, because
 * it no longer blocks the event loop on `existsSync`/`unlinkSync`. Callers that
 * do not await it behave exactly as before.
 */

export {
  cleanupUploadedFile,
  createAirtableAttachmentFromFile,
  uploadImageToAirtable,
  uploadImageUrlAsLinkField,
  uploadImageUrlToAirtable,
} from '../services/images';

export type { AirtableAttachment, UploadedFileInfo } from '../services/images';
