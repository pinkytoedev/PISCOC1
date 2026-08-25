/**
 * Extracts an article body from an uploaded ZIP archive.
 *
 * The archive comes from a contributor, so it is treated as hostile input:
 * every limit below exists to stop one upload from exhausting disk, memory,
 * the ImgBB quota or the event loop, and the extracted HTML is sanitized
 * before it is ever stored.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import extract from 'extract-zip';
import { storage } from '../storage';
import { log } from '../vite';
import { env } from '../lib/env';
import { sanitizeArticleHtml } from '../lib/sanitizeHtml';
import { getAirtableConfig, updateRecord } from '../lib/airtableClient';
import { uploadImageToImgBB, UploadedFileInfo } from './imgbbUploader';
import { InsertImageAsset } from '../../shared/schema';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

/** Depth guard for the recursive walk — real archives are nowhere near this. */
const MAX_DIRECTORY_DEPTH = 10;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
};

function mimeTypeFor(extension: string): string {
  return MIME_BY_EXTENSION[extension.toLowerCase()] ?? 'application/octet-stream';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ZipProcessResult {
  success: boolean;
  message: string;
  html?: string;
  /** True when sanitization stripped markup — surfaced so the uploader knows. */
  sanitized?: boolean;
  imagesProcessed?: number;
}

interface WalkedFile {
  absolutePath: string;
  relativePath: string;
  size: number;
}

/**
 * Walks the extraction directory, re-checking the entry-count and total-size
 * budgets against what actually landed on disk.
 *
 * This runs after extraction, so it cannot by itself stop a zip bomb — the
 * preventive check is the `onEntry` hook in `processZipFile`, which reads the
 * declared sizes from the central directory before any bytes are written. This
 * walk stays as defence in depth and to enforce the directory-depth limit.
 */
async function walkExtracted(root: string): Promise<WalkedFile[]> {
  const files: WalkedFile[] = [];
  let totalBytes = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DIRECTORY_DEPTH) {
      throw new Error(`Archive nests directories more than ${MAX_DIRECTORY_DEPTH} levels deep`);
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);

      // Symlinks could point outside the extraction directory; skip them.
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        await walk(absolutePath, depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;

      if (files.length >= env.uploads.maxZipEntries) {
        throw new Error(`Archive contains more than ${env.uploads.maxZipEntries} files`);
      }

      const stat = await fs.stat(absolutePath);
      totalBytes += stat.size;

      if (totalBytes > env.uploads.maxZipExpandedBytes) {
        const limitMb = Math.round(env.uploads.maxZipExpandedBytes / (1024 * 1024));
        throw new Error(`Archive expands to more than ${limitMb}MB`);
      }

      files.push({
        absolutePath,
        relativePath: path.relative(root, absolutePath),
        size: stat.size,
      });
    }
  }

  await walk(root, 0);
  return files;
}

/**
 * Rewrites references to a bundled image so they point at its hosted URL.
 *
 * Handles `src`/`href`/`data-src` attributes and CSS `url()` in both quoted and
 * unquoted form. The previous version built these patterns inside template
 * literals containing `\s` and `\(`; neither is a valid string escape, so they
 * collapsed to `s` and `(` and the compiled expression matched nothing —
 * meaning CSS-referenced images silently kept pointing at paths that no longer
 * existed. Using `String.raw` keeps the backslashes intact.
 */
function rewriteImageReferences(html: string, originalPath: string, newUrl: string): string {
  const normalized = originalPath.replace(/\\/g, '/');

  // A reference may be written relative, root-relative, dot-relative, or as a
  // bare filename.
  const variations = Array.from(
    new Set([normalized, `./${normalized}`, `/${normalized}`, path.basename(normalized)]),
  );

  let result = html;

  for (const variation of variations) {
    const escaped = escapeRegExp(variation);

    const attributeRef = new RegExp(
      String.raw`(src|href|data-src)\s*=\s*["']${escaped}["']`,
      'gi',
    );
    const quotedCssUrl = new RegExp(
      String.raw`url\(\s*(["'])${escaped}\1\s*\)`,
      'gi',
    );
    const bareCssUrl = new RegExp(
      String.raw`url\(\s*${escaped}\s*\)`,
      'gi',
    );

    result = result
      .replace(attributeRef, `$1="${newUrl}"`)
      .replace(quotedCssUrl, `url("${newUrl}")`)
      .replace(bareCssUrl, `url("${newUrl}")`);
  }

  return result;
}

/**
 * Processes an uploaded archive and sets the article's HTML body.
 *
 * @param filePath  Path to the uploaded ZIP.
 * @param articleId Article to update.
 * @param userId    Actor for the activity log; omitted for contributor uploads
 *                  so the entry is not misattributed to a real account.
 */
export async function processZipFile(
  filePath: string,
  articleId: number,
  userId?: number,
): Promise<ZipProcessResult> {
  const tempRoot = path.join(process.cwd(), 'temp');
  // `mkdtemp` avoids the collision that a timestamped name allows when two
  // uploads for the same article land in the same millisecond.
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, `article-${articleId}-`));

  try {
    // extract-zip rejects entries that resolve outside the target directory,
    // which is the zip-slip guard; the budgets below cover volume instead.
    //
    // The budgets are enforced from the central directory in `onEntry`, which
    // extract-zip calls before it opens a write stream for the entry. Checking
    // only after extraction — as `walkExtracted` does — cannot stop a zip bomb,
    // because by then the gigabytes are already on disk. A throw here cancels
    // the extraction and rejects, and yauzl's default `validateEntrySizes`
    // means an entry that understates `uncompressedSize` errors mid-stream
    // rather than slipping past this.
    let entryCount = 0;
    let declaredBytes = 0;

    await extract(filePath, {
      dir: tempDir,
      onEntry: (entry) => {
        // Directory records carry no payload.
        if (entry.fileName.endsWith('/')) return;

        entryCount += 1;
        if (entryCount > env.uploads.maxZipEntries) {
          throw new Error(`Archive contains more than ${env.uploads.maxZipEntries} files`);
        }

        declaredBytes += entry.uncompressedSize;
        if (declaredBytes > env.uploads.maxZipExpandedBytes) {
          const limitMb = Math.round(env.uploads.maxZipExpandedBytes / (1024 * 1024));
          throw new Error(`Archive expands to more than ${limitMb}MB`);
        }
      },
    });

    // Kept as defence in depth: this covers what actually landed on disk, plus
    // the directory-depth guard.
    const files = await walkExtracted(tempDir);

    const htmlFiles = files.filter((file) => file.relativePath.toLowerCase().endsWith('.html'));
    if (htmlFiles.length === 0) {
      throw new Error('No HTML file found in the archive');
    }

    // index.html wins when present; otherwise take the first, deterministically.
    const mainHtmlFile =
      htmlFiles.find((file) => path.basename(file.relativePath).toLowerCase() === 'index.html') ??
      htmlFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath))[0];

    let html = await fs.readFile(mainHtmlFile.absolutePath, 'utf-8');
    if (!html.trim()) {
      throw new Error(`HTML file is empty: ${path.basename(mainHtmlFile.relativePath)}`);
    }

    const imageFiles = files.filter((file) =>
      IMAGE_EXTENSIONS.some((ext) => file.relativePath.toLowerCase().endsWith(ext)),
    );

    if (imageFiles.length > env.uploads.maxZipImages) {
      throw new Error(
        `Archive contains ${imageFiles.length} images; the limit is ${env.uploads.maxZipImages}`,
      );
    }

    let imagesProcessed = 0;

    for (const image of imageFiles) {
      const fileInfo: UploadedFileInfo = {
        path: image.absolutePath,
        filename: path.basename(image.relativePath),
        size: image.size,
        mimetype: mimeTypeFor(path.extname(image.relativePath)),
      };

      const uploaded = await uploadImageToImgBB(fileInfo);

      if (!uploaded) {
        // One failed image should not discard an otherwise good submission; the
        // reference simply stays as-is and the log records it.
        log(`Failed to upload image ${image.relativePath} for article ${articleId}`, 'zip');
        continue;
      }

      html = rewriteImageReferences(html, image.relativePath, uploaded.display_url);
      imagesProcessed += 1;

      const imageAsset: InsertImageAsset = {
        originalFilename: fileInfo.filename,
        storagePath: uploaded.url,
        mimeType: fileInfo.mimetype,
        size: fileInfo.size,
        hash: uploaded.id,
        isDefault: false,
        category: 'article',
        metadata: {
          articleId,
          originalPath: image.relativePath,
          displayUrl: uploaded.display_url,
        },
      };
      await storage.createImageAsset(imageAsset);
    }

    // Sanitize last, so rewritten URLs are validated by the same pass that
    // strips scripts.
    const { html: safeHtml, modified: sanitized } = sanitizeArticleHtml(html);

    if (sanitized) {
      log(`Sanitizer removed markup from the upload for article ${articleId}`, 'zip');
    }

    if (!safeHtml.trim()) {
      throw new Error('The HTML contained no publishable content after sanitization');
    }

    const article = await storage.getArticle(articleId);
    if (!article) {
      throw new Error(`Article ${articleId} not found`);
    }

    const updated = await storage.updateArticle(articleId, {
      content: safeHtml,
      contentFormat: 'html',
    });

    if (!updated) {
      throw new Error('Failed to store the article content');
    }

    if (article.source === 'airtable' && article.externalId) {
      try {
        const config = await getAirtableConfig();
        if (config) {
          await updateRecord(config, article.externalId, { Body: safeHtml });
        }
      } catch (error) {
        // Airtable is a mirror; the authoritative write already succeeded.
        log(`Failed to sync article ${articleId} body to Airtable: ${String(error)}`, 'zip');
      }
    }

    await storage.createActivityLog({
      // Left undefined for contributor uploads rather than attributed to a
      // hardcoded user id that may not even exist.
      userId,
      action: 'upload',
      resourceType: 'html_content',
      resourceId: articleId.toString(),
      details: {
        fieldName: 'content',
        contentSize: safeHtml.length,
        imagesProcessed,
        sanitized,
      },
    });

    return {
      success: true,
      message: `Article content updated. ${imagesProcessed} image(s) hosted.${
        sanitized ? ' Some unsupported markup was removed.' : ''
      }`,
      html: safeHtml,
      sanitized,
      imagesProcessed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`ZIP processing failed for article ${articleId}: ${message}`, 'zip');
    return { success: false, message };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch((error) => {
      log(`Failed to clean up ${tempDir}: ${String(error)}`, 'zip');
    });
  }
}
