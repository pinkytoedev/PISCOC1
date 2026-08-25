/**
 * Diagnostics for the attachment-field → link-field migration.
 *
 * Airtable stopped accepting third-party URLs in attachment fields. Before
 * switching the real columns over, an image URL is written to a scratch text
 * column called "Test" to confirm the token, base and table are right and that
 * the URL survives the round trip.
 */

import type { Article } from '@shared/schema';
import { storage } from '../storage';
import { createLogger } from '../lib/logger';
import { tryUpdateRecord } from '../lib/airtableClient';

const log = createLogger('airtable:test-field');

/** The scratch column every check writes to. */
const TEST_FIELD = 'Test';

/**
 * Writes an image URL to the scratch column of one record.
 *
 * Returns false rather than throwing: every caller is a diagnostic that wants
 * to report the outcome, not abort.
 */
export async function uploadLinkToAirtableTestField(
  imageUrl: string,
  recordId: string,
  // Accepted but unused: "Test" is a text column, so only the URL is written.
  // Callers pass a filename because the attachment-based original needed one.
  _filename = 'test-image.jpg',
): Promise<boolean> {
  return tryUpdateRecord(recordId, { [TEST_FIELD]: imageUrl }, `airtable test field for ${recordId}`);
}

export interface MigrationOutcome {
  success: boolean;
  migrated: number;
  failed: number;
}

/**
 * Runs the check over one article or the whole library.
 *
 * `testOnly` stops after the first article's main image, which is the point of
 * the endpoints that call it: prove the write works without touching the rest
 * of the base.
 */
export async function migrateArticleImagesToLinks(
  articleId?: number,
  testOnly = true,
): Promise<MigrationOutcome> {
  try {
    const candidates = await loadCandidates(articleId);
    log.info('Checking Airtable link migration', { articles: candidates.length, testOnly });

    let migrated = 0;
    let failed = 0;

    for (const article of candidates) {
      const externalId = article.externalId as string;

      if (article.imageUrl) {
        const ok = await uploadLinkToAirtableTestField(
          article.imageUrl,
          externalId,
          `main-image-${article.id}.jpg`,
        );
        if (ok) migrated++;
        else failed++;

        // One article is enough to prove the path works.
        if (testOnly) break;
      }

      if (!testOnly && article.instagramImageUrl) {
        const ok = await uploadLinkToAirtableTestField(
          article.instagramImageUrl,
          externalId,
          `insta-image-${article.id}.jpg`,
        );
        if (ok) migrated++;
        else failed++;
      }
    }

    return { success: migrated > 0 && failed === 0, migrated, failed };
  } catch (error) {
    log.error('Airtable link migration check failed', { articleId, error });
    return { success: false, migrated: 0, failed: 1 };
  }
}

async function loadCandidates(articleId?: number): Promise<Article[]> {
  const articles = articleId
    ? [await storage.getArticle(articleId)]
    : await storage.getArticles();

  return articles.filter(
    (article): article is Article =>
      Boolean(article)
      && article!.source === 'airtable'
      && Boolean(article!.externalId)
      && Boolean(article!.imageUrl || article!.instagramImageUrl),
  );
}
