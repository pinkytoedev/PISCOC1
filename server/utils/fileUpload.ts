/**
 * Compatibility shim for the two callers that still import `upload` from here:
 * the team member image route in server/routes.ts and the Airtable attachment
 * route in server/integrations/airtable.ts.
 *
 * This file used to declare a fourth multer instance of its own, writing into a
 * `./uploads` directory created at import time and accepting anything whose
 * declared MIME type began with `image/` — SVG included, which ImgBB then hosts
 * as a script-bearing document. Both callers now get the shared configuration
 * from server/middleware/upload: temp-directory storage with a sanitized random
 * filename, a real allow-list, and the limits from `env.uploads`.
 *
 * Prefer importing `imageUpload` from '../middleware/upload' directly; this
 * alias exists only so the existing import sites keep working.
 */

export { imageUpload as upload } from '../middleware/upload';
