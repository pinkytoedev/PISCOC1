import type { Article, InsertArticle } from "@shared/schema";

/** `forceWebhook` is read straight off the request body by the articles route. */
export interface ArticleSubmission extends Partial<InsertArticle> {
  forceWebhook?: boolean;
}

/**
 * Turns form state into the payload the articles endpoint expects.
 *
 * The two rules worth knowing: publishing derives `publishedAt` from the
 * Scheduled input, and unpublishing clears Scheduled — leaving a past date on a
 * draft makes the auto-publisher push it straight back live.
 */
export function buildArticleSubmission(
  formData: Partial<InsertArticle>,
  previous?: Article | null,
): ArticleSubmission {
  const submission: ArticleSubmission = { ...formData };

  // Airtable's "Date" column tracks when the record was last written from here.
  submission.date = new Date().toISOString();

  const publishNow = () => {
    const now = new Date();
    submission.publishedAt = now;
    submission.Scheduled = now.toISOString();
  };

  if (submission.Scheduled) {
    const scheduled = new Date(submission.Scheduled);
    if (!isNaN(scheduled.getTime())) {
      submission.publishedAt = scheduled;
    } else if (submission.status === "published") {
      publishNow();
    }
  } else if (submission.status === "published") {
    publishNow();
  }

  if (submission.status !== "published") {
    // publishedAt is kept so the original publication date survives.
    submission.Scheduled = null;
  }

  const isNowPublished = submission.status === "published";
  submission.finished = isNowPublished;

  if (previous?.status === "published" && !isNowPublished) {
    submission.republished = true;
    // The backend infers the unpublish from the previous row too; the flag makes
    // sure the webhook fires even when that comparison misses.
    submission.forceWebhook = true;
  }

  return submission;
}

/** Restores a draft to its original publication, undoing an unpublish. */
export function buildRepublishSubmission(
  formData: Partial<InsertArticle>,
  originalPublishedAt: Date,
): ArticleSubmission {
  return {
    ...formData,
    status: "published",
    finished: true,
    republished: false,
    publishedAt: originalPublishedAt,
    Scheduled: originalPublishedAt.toISOString(),
    date: new Date().toISOString(),
  };
}
