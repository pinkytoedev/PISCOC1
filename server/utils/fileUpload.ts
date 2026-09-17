/**
 * Compatibility shim: re-exports the shared image multer instance under its
 * old name.
 *
 * Exactly one module still imports `upload` from here —
 * `server/integrations/airtable/routes.ts`. Everything else imports
 * `imageUpload` from `../middleware/upload` directly, which is what new code
 * should do; this file can go once that last import moves.
 */

export { imageUpload as upload } from '../middleware/upload';
