/**
 * Multer configuration for contributor uploads.
 *
 * Two things here matter beyond the obvious size limits:
 *
 * 1. Files land in the OS temp directory, not a directory inside the repo, and
 *    are always removed when the response finishes. The old flow wrote into
 *    `./uploads` and only unlinked on the success path, so every rejected
 *    request left its file behind — an anonymous caller could fill the disk by
 *    posting large archives with a bad article id.
 *
 * 2. Content type is checked against the file's magic bytes after upload, not
 *    just the client-supplied MIME type and extension, both of which are
 *    trivially forged.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../lib/env';
import { HttpError } from '../lib/httpError';

const TEMP_PREFIX = 'piscoc-upload-';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (_req, file, cb) => {
    // The original name is never used as a path component; it is kept only as a
    // readable suffix after being stripped of anything but safe characters.
    const safeSuffix = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .slice(-64);
    cb(null, `${TEMP_PREFIX}${crypto.randomBytes(12).toString('hex')}-${safeSuffix}`);
  },
});

/**
 * Accepted image types.
 *
 * HEIC/HEIF are included because that is what an iPhone camera produces by
 * default — rejecting it would break photo submissions from the most common
 * device. They are transcoded to JPEG after upload (see `normalizeImage`),
 * since ImgBB and browsers do not handle HEIC reliably.
 *
 * SVG is deliberately absent: it is an XML document that can carry script, and
 * these images are served back to users.
 */
const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
]);

export const imageUpload = multer({
  storage,
  limits: { fileSize: env.uploads.maxImageBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype.toLowerCase();
    // Safari sometimes sends HEIC as application/octet-stream; fall back to the
    // extension, and rely on the magic-byte check to confirm.
    const heicByExtension =
      mime === 'application/octet-stream' && /\.(heic|heif|avif)$/i.test(file.originalname);

    if (IMAGE_MIME_TYPES.has(mime) || heicByExtension) {
      cb(null, true);
      return;
    }
    cb(HttpError.badRequest('Only JPEG, PNG, GIF, WebP, HEIC and AVIF images are accepted'));
  },
});

export const zipUpload = multer({
  storage,
  limits: { fileSize: env.uploads.maxZipBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const looksLikeZip =
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed' ||
      file.mimetype === 'application/octet-stream' ||
      file.originalname.toLowerCase().endsWith('.zip');

    if (looksLikeZip) {
      cb(null, true);
      return;
    }
    cb(HttpError.badRequest('Only ZIP archives are accepted'));
  },
});

/**
 * Leading bytes that identify a format regardless of what the client claimed.
 *
 * HEIC/HEIF are ISO base-media files: the first four bytes are a box length,
 * then the literal "ftyp" at offset 4, then a brand. Matching on "ftyp" alone
 * would also accept MP4, so the brand is checked too.
 */
const MAGIC_BYTES: Array<{ kind: 'image' | 'zip'; signature: number[]; offset?: number }> = [
  { kind: 'image', signature: [0xff, 0xd8, 0xff] }, // JPEG
  { kind: 'image', signature: [0x89, 0x50, 0x4e, 0x47] }, // PNG
  { kind: 'image', signature: [0x47, 0x49, 0x46, 0x38] }, // GIF
  { kind: 'image', signature: [0x52, 0x49, 0x46, 0x46] }, // WEBP (RIFF container)
  { kind: 'zip', signature: [0x50, 0x4b, 0x03, 0x04] },
  { kind: 'zip', signature: [0x50, 0x4b, 0x05, 0x06] }, // empty archive
];

/**
 * ISO base-media brands that denote a still image rather than video.
 *
 * Covers HEIC (what an iPhone camera writes) and AVIF, which shares the
 * container and which both modern phones and `sharp` itself produce. Video
 * brands such as `isom`/`mp4x` are deliberately excluded — they use the same
 * `ftyp` header, so matching on that alone would accept an MP4 as an image.
 */
const HEIF_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1',
  'avif', 'avis',
]);

function isHeif(header: Buffer): boolean {
  if (header.length < 12) return false;
  if (header.subarray(4, 8).toString('latin1') !== 'ftyp') return false;
  return HEIF_BRANDS.has(header.subarray(8, 12).toString('latin1').toLowerCase());
}

/**
 * Confirms a file really is what its declared type says.
 * Rejects, for example, an HTML document sent as `image/png`.
 */
export async function assertFileKind(filePath: string, expected: 'image' | 'zip'): Promise<void> {
  const handle = await fs.open(filePath, 'r');
  try {
    // 12 bytes covers the longest signature checked here (the HEIF brand).
    const buffer = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buffer, 0, 12, 0);
    const header = buffer.subarray(0, bytesRead);

    if (expected === 'image' && isHeif(header)) return;

    const matches = MAGIC_BYTES.some(
      ({ kind, signature, offset = 0 }) =>
        kind === expected &&
        signature.every((byte, index) => header[offset + index] === byte),
    );

    if (!matches) {
      throw HttpError.badRequest(
        expected === 'zip'
          ? 'That file is not a valid ZIP archive'
          : 'That file is not a valid image',
      );
    }
  } finally {
    await handle.close();
  }
}

/**
 * Converts an uploaded image to a web-safe format when necessary.
 *
 * iPhones upload HEIC, which neither browsers nor the image host render
 * reliably, so it is transcoded to JPEG in place. Everything else is left
 * untouched — re-encoding a JPEG would only lose quality.
 *
 * Returns the descriptor the caller should hand to the image host, since the
 * filename and mime type change when a conversion happens.
 */
export async function normalizeImage(file: Express.Multer.File): Promise<{
  path: string;
  filename: string;
  size: number;
  mimetype: string;
}> {
  const handle = await fs.open(file.path, 'r');
  let header: Buffer;
  try {
    const buffer = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buffer, 0, 12, 0);
    header = buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }

  if (!isHeif(header)) {
    return {
      path: file.path,
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  const converted = `${file.path}.jpg`;
  await sharp(file.path).jpeg({ quality: 90 }).toFile(converted);
  const { size } = await fs.stat(converted);

  // The original is removed now rather than left for the cleanup hook, which
  // only knows about the path multer produced.
  await fs.rm(file.path, { force: true }).catch(() => {});
  // Point the request at the converted file so cleanup collects that instead.
  file.path = converted;

  return {
    path: converted,
    filename: file.originalname.replace(/\.(heic|heif|avif)$/i, '.jpg'),
    size,
    mimetype: 'image/jpeg',
  };
}

/**
 * Deletes any uploaded temp file once the response is done.
 *
 * Registered before the route handlers so it runs whether the request succeeds,
 * fails validation, or throws — which is what guarantees nothing accumulates
 * on disk.
 */
export function cleanupUploadedFile(req: Request, res: Response, next: NextFunction) {
  res.on('finish', () => void removeTempFile(req));
  res.on('close', () => void removeTempFile(req));
  next();
}

async function removeTempFile(req: Request): Promise<void> {
  const filePath = req.file?.path;
  if (!filePath) return;

  // Only ever unlink inside the temp directory, and only files this module
  // created — a guard against an unexpected path reaching here.
  const base = path.basename(filePath);
  if (!base.startsWith(TEMP_PREFIX) || path.dirname(filePath) !== os.tmpdir()) return;

  await fs.rm(filePath, { force: true }).catch(() => {
    /* Already gone, or the OS will reap it. */
  });
}
