/**
 * Compatibility barrel.
 *
 * The implementation moved to `server/services/images/fetch`. Beyond the move,
 * two things about the old module were actively dangerous and are fixed there:
 * it shipped a hard-coded ImgBB API key in the source, and it fetched arbitrary
 * user-supplied URLs with no scheme check, no address check, no timeout and no
 * size limit.
 *
 * `uploadToImgBB` now downloads through the guarded fetcher and re-hosts the
 * bytes using the configured key. Its signature is unchanged.
 */

export { uploadToImgBB } from '../services/images';

export {
  downloadImage,
  getFullImageUrl,
  fetchRemoteImage,
  assertFetchableImageUrl,
  ImageFetchError,
} from '../services/images';

export type { DownloadedImage, FetchedImage } from '../services/images';
