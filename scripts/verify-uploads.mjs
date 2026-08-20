/**
 * Upload pipeline checks — file-type verification and image normalization.
 *
 *   npx tsx scripts/verify-uploads.mjs
 *
 * These run without a server or database. They cover the guarantees the upload
 * path depends on: that a file's real format is checked rather than its claimed
 * one, that phone camera formats are accepted and transcoded, and that formats
 * sharing a container header with images are still rejected.
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { assertFileKind, normalizeImage } from '../server/middleware/upload.ts';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'piscoc-upload-check-'));
let fails = 0;
const check = (ok, label, extra = '') => {
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`);
};

// A genuine ISO base-media still image. HEIC and AVIF share this container and
// take the same code path; AVIF is used because libheif ships an AV1 encoder
// while HEVC encoding is usually absent, so it is the format we can generate.
const iso = path.join(dir, 'piscoc-upload-fixture-photo.avif');
await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ff8800' } })
  .heif({ compression: 'av1' })
  .toFile(iso);

console.log('=== ISO base-media still images (HEIC / AVIF) ===');
await assertFileKind(iso, 'image').then(
  () => check(true, 'accepted as an image'),
  (e) => check(false, 'rejected', e.message),
);

const out = await normalizeImage({
  path: iso,
  originalname: 'photo.avif',
  size: (await fs.stat(iso)).size,
  mimetype: 'image/avif',
});
const converted = await fs.readFile(out.path);
check(converted[0] === 0xff && converted[1] === 0xd8, 'transcoded to real JPEG', out.mimetype);
check(out.filename === 'photo.jpg', 'filename extension rewritten');
check(await fs.access(iso).then(() => false).catch(() => true), 'original removed');

const meta = await sharp(out.path).metadata();
check(meta.width === 64 && meta.height === 64, 'JPEG decodes at original size', `${meta.width}x${meta.height}`);

console.log('\n=== ordinary images are not re-encoded ===');
const png = path.join(dir, 'piscoc-upload-fixture-plain.png');
await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } }).png().toFile(png);
const before = await fs.readFile(png);
const passthrough = await normalizeImage({
  path: png, originalname: 'plain.png', size: before.length, mimetype: 'image/png',
});
check(passthrough.path === png && passthrough.mimetype === 'image/png', 'passes through untouched');
check(Buffer.compare(before, await fs.readFile(png)) === 0, 'bytes unmodified');

console.log('\n=== forged types are rejected ===');
// MP4 begins with the same ftyp box as HEIC; only the brand distinguishes them.
const mp4 = path.join(dir, 'piscoc-upload-fixture-clip.mp4');
const mp4Header = Buffer.alloc(16);
mp4Header.write('ftyp', 4, 'latin1');
mp4Header.write('isom', 8, 'latin1');
await fs.writeFile(mp4, mp4Header);
await assertFileKind(mp4, 'image').then(
  () => check(false, 'MP4 wrongly accepted as an image'),
  () => check(true, 'MP4 rejected despite sharing the ftyp header'),
);

const fakePng = path.join(dir, 'piscoc-upload-fixture-fake.png');
await fs.writeFile(fakePng, '<html><script>alert(1)</script></html>');
await assertFileKind(fakePng, 'image').then(
  () => check(false, 'HTML disguised as PNG accepted'),
  () => check(true, 'HTML disguised as PNG rejected'),
);

const fakeZip = path.join(dir, 'piscoc-upload-fixture-fake.zip');
await fs.writeFile(fakeZip, 'not an archive');
await assertFileKind(fakeZip, 'zip').then(
  () => check(false, 'non-ZIP accepted as an archive'),
  () => check(true, 'non-ZIP rejected'),
);

await fs.rm(dir, { recursive: true, force: true });
console.log(fails === 0 ? '\nALL UPLOAD CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails ? 1 : 0);
