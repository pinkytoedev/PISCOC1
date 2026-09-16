/**
 * Re-upload sessions.
 *
 * A published article sometimes needs its content replaced — corrected copy, a
 * new cover image, revised HTML. Doing that in place would briefly serve a
 * half-updated article and would trip the auto-publisher.
 *
 * A session makes the edit atomic from the reader's point of view:
 *
 *   start    → article returns to draft, `isReuploading` is set, and a single
 *              upload link is issued covering every asset type
 *   upload   → the contributor replaces any number of assets, in any order,
 *              through that one link; nothing is published yet
 *   complete → the article is republished, Airtable is synced, and the site
 *              cache is refreshed
 *   cancel   → the article is restored to its previous status untouched
 *
 * The previous implementation completed the session after *any* single asset
 * upload. The first file to land republished the article, and the remaining
 * uploads were then rejected with "Cannot upload to published articles" — so a
 * submission of HTML plus a cover image could never finish. Completion is now
 * an explicit step.
 */

import type { Article } from '@shared/schema';
import { storage } from '../storage';
import { log } from '../vite';
import { HttpError } from '../lib/httpError';
import { getAirtableConfig, tryUpdateRecord } from '../lib/airtableClient';
import { createUploadToken, revokeArticleTokens, type IssuedToken } from './uploadTokens';
import { notifyArticleChanged } from './siteRefresh';

/** Asset types a contributor can replace during a session. */
export const REUPLOAD_ASSET_TYPES = ['image', 'instagram-image', 'html-zip'] as const;

export interface ReuploadSession {
  article: Article;
  /** Present only when the session is started — the plaintext link is shown once. */
  upload?: IssuedToken;
}

function isAirtableBacked(article: Article): boolean {
  return article.source === 'airtable' && Boolean(article.externalId);
}

/**
 * Opens a re-upload session and issues the contributor link.
 *
 * Only articles that are actually live make sense here; an unpublished draft is
 * already editable through the normal upload flow.
 */
export async function startReuploadSession(
  articleId: number,
  userId: number | undefined,
): Promise<ReuploadSession> {
  const article = await storage.getArticle(articleId);
  if (!article) throw HttpError.notFound('Article not found');

  if (article.isReuploading) {
    throw HttpError.conflict('A re-upload session is already open for this article');
  }

  if (article.status !== 'published' && !article.finished) {
    throw HttpError.badRequest(
      'Only published or finished articles can be re-uploaded; edit drafts directly',
    );
  }

  // The link is issued *before* the article is touched.
  //
  // Both statements below write to `upload_tokens`. When that table was out of
  // sync with the schema in production they threw after the article had already
  // been flipped to draft, which left a session open in the database that no
  // link could close and that the dashboard could not even see — the mutation's
  // error path does not refetch, so the table went on showing the old row.
  // Doing the fallible work first means a failure here leaves the article
  // exactly as it was.
  //
  // Any link from an earlier session must stop working now that a new one
  // exists, so an old link cannot write into the current session.
  await revokeArticleTokens(articleId);

  const upload = await createUploadToken({
    articleId,
    uploadTypes: [...REUPLOAD_ASSET_TYPES],
    createdById: userId,
    name: `Re-upload: ${article.title}`,
  });

  let updated: Article | undefined;
  try {
    updated = await storage.updateArticle(articleId, {
      status: 'draft',
      finished: false,
      isReuploading: true,
      reuploadStartedAt: new Date(),
      reuploadStartedBy: userId ?? null,
      reuploadPreviousStatus: article.status,
    });
  } catch (error) {
    // The two writes are not in one transaction, so the link has to be undone
    // by hand — otherwise a failure here leaves a live link pointing at an
    // article that is still published.
    await revokeArticleTokens(articleId).catch(() => {});
    throw error;
  }

  if (!updated) {
    await revokeArticleTokens(articleId).catch(() => {});
    throw HttpError.internal('Failed to open re-upload session');
  }

  // Unpublishing has to reach Airtable too, otherwise the next sync sees
  // Finished=true and flips the article straight back to published.
  if (isAirtableBacked(article)) {
    await tryUpdateRecord(
      article.externalId!,
      { Finished: false },
      `unpublish article ${articleId} for re-upload`,
    );
  }

  // Pull the article off the live site while it is being rebuilt.
  await notifyArticleChanged(updated, 'reupload-started');

  await storage.createActivityLog({
    userId,
    action: 'update',
    resourceType: 'article',
    resourceId: articleId.toString(),
    details: { action: 'start_reupload', previousStatus: article.status },
  });

  log(`Opened re-upload session for article ${articleId}`, 'reupload');

  return { article: updated, upload };
}

/**
 * Closes a session and republishes.
 *
 * `actor` distinguishes an editor clicking "Publish" in the dashboard from a
 * contributor finishing through their link; both are legitimate, and the
 * activity log should say which.
 */
export async function completeReuploadSession(
  articleId: number,
  actor: { userId?: number; via: 'dashboard' | 'upload-link' },
): Promise<Article> {
  const article = await storage.getArticle(articleId);
  if (!article) throw HttpError.notFound('Article not found');

  if (!article.isReuploading) {
    throw HttpError.conflict('No re-upload session is open for this article');
  }

  // An article with no body would publish an empty page.
  if (!article.content || article.content.trim().length === 0) {
    throw HttpError.badRequest('Cannot publish an article with no content');
  }

  // The link is spent the moment the session closes — and it is revoked
  // *before* the article is republished.
  //
  // This statement is the one that failed in production. Running it after the
  // flag was cleared meant a failure closed the session anyway: the caller saw
  // a 500, retried, and got "No re-upload session is open for this article"
  // forever after. Revoking first makes the failure retryable instead.
  await revokeArticleTokens(articleId);

  const updated = await storage.updateArticle(articleId, {
    status: 'published',
    finished: true,
    isReuploading: false,
    reuploadStartedAt: null,
    reuploadStartedBy: null,
    reuploadPreviousStatus: null,
    // The original publication date is preserved: this is a revision of an
    // existing article, not a new one.
    publishedAt: article.publishedAt ?? new Date(),
  });

  if (!updated) throw HttpError.internal('Failed to complete re-upload session');

  if (isAirtableBacked(updated)) {
    const config = await getAirtableConfig();
    if (config) {
      await tryUpdateRecord(
        updated.externalId!,
        { Finished: true, Body: updated.content ?? '' },
        `republish article ${articleId} after re-upload`,
      );
    }
  }

  // Refresh the live site so readers see the new content. The old handler
  // skipped this entirely, leaving stale content cached after every re-upload.
  await notifyArticleChanged(updated, 'reupload-completed');

  await storage.createActivityLog({
    userId: actor.userId,
    action: 'update',
    resourceType: 'article',
    resourceId: articleId.toString(),
    details: { action: 'complete_reupload', via: actor.via, status: 'published' },
  });

  log(`Completed re-upload session for article ${articleId} (via ${actor.via})`, 'reupload');

  return updated;
}

/** Abandons a session, restoring the article to the status it had before. */
export async function cancelReuploadSession(
  articleId: number,
  userId: number | undefined,
): Promise<Article> {
  const article = await storage.getArticle(articleId);
  if (!article) throw HttpError.notFound('Article not found');

  if (!article.isReuploading) {
    throw HttpError.conflict('No re-upload session is open for this article');
  }

  const previousStatus = article.reuploadPreviousStatus ?? 'published';

  // Revoked before the article is restored, for the same reason as completion:
  // a failure here must leave the session open and the call retryable, not
  // close it and then report an error.
  await revokeArticleTokens(articleId);

  const restored = await storage.updateArticle(articleId, {
    status: previousStatus,
    finished: previousStatus === 'published',
    isReuploading: false,
    reuploadStartedAt: null,
    reuploadStartedBy: null,
    reuploadPreviousStatus: null,
  });

  if (!restored) throw HttpError.internal('Failed to cancel re-upload session');

  if (isAirtableBacked(restored) && previousStatus === 'published') {
    await tryUpdateRecord(
      restored.externalId!,
      { Finished: true },
      `restore article ${articleId} after cancelled re-upload`,
    );
  }

  await notifyArticleChanged(restored, 'reupload-cancelled');

  await storage.createActivityLog({
    userId,
    action: 'update',
    resourceType: 'article',
    resourceId: articleId.toString(),
    details: { action: 'cancel_reupload', restoredStatus: previousStatus },
  });

  log(`Cancelled re-upload session for article ${articleId}`, 'reupload');

  return restored;
}
