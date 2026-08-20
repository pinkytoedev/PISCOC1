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

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export const imageUpload = multer({
  storage,
  limits: { fileSize: env.uploads.maxImageBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME_TYPES.has(file.mimetype.toLowerCase())) {
      cb(null, true);
      return;
    }
    cb(HttpError.badRequest('Only JPEG, PNG, GIF and WebP images are accepted'));
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

/** Leading bytes that identify a format regardless of what the client claimed. */
const MAGIC_BYTES: Array<{ kind: 'image' | 'zip'; signature: number[]; offset?: number }> = [
  { kind: 'image', signature: [0xff, 0xd8, 0xff] }, // JPEG
  { kind: 'image', signature: [0x89, 0x50, 0x4e, 0x47] }, // PNG
  { kind: 'image', signature: [0x47, 0x49, 0x46, 0x38] }, // GIF
  { kind: 'image', signature: [0x52, 0x49, 0x46, 0x46] }, // WEBP (RIFF container)
  { kind: 'zip', signature: [0x50, 0x4b, 0x03, 0x04] },
  { kind: 'zip', signature: [0x50, 0x4b, 0x05, 0x06] }, // empty archive
];

/**
 * Confirms a file really is what its declared type says.
 * Rejects, for example, an HTML document sent as `image/png`.
 */
export async function assertFileKind(filePath: string, expected: 'image' | 'zip'): Promise<void> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(8);
    const { bytesRead } = await handle.read(buffer, 0, 8, 0);
    const header = buffer.subarray(0, bytesRead);

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
