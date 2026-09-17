/**
 * Compatibility barrel.
 *
 * The implementation lives in `server/services/images` so that ImgBB uploads,
 * remote downloads and the Airtable write-back share one retry policy, one
 * error type and one timeout. This path is kept because seven modules import
 * it: `airtable/images`, `contributorUpload`, `directUpload`,
 * `publicArticleUpload`, `teamPublicUpload`, `routes/teamMembers` and
 * `utils/zipProcessor`. New code should import from `../services/images`
 * directly.
 */

export {
  uploadImageToImgBB,
  uploadImageUrlToImgBB,
  uploadFileToImgBB,
  uploadUrlToImgBB,
  ImageHostError,
} from '../services/images';

export type { UploadedFileInfo, ImgBBUploadResponse } from '../services/images';
