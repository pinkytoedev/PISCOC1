import { Article } from "@shared/schema";

export function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

/** The hashtag field is one space-separated string; normalise the leading `#`. */
export function formatTags(hashtags: string | null | undefined): string[] {
  if (!hashtags) return [];
  return hashtags
    .split(" ")
    .filter((tag) => tag.trim() !== "")
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

/** An article queued for republishing gets its own badge rather than its stored status. */
export function getDisplayStatus(article: Article): string {
  if (article.republished) return "republish";
  return article.status || "draft";
}

/** Airtable's Scheduled field is the source of truth for ordering; the rest are fallbacks. */
export function getRelevantDate(article: Article): number {
  if (article.Scheduled) return new Date(article.Scheduled).getTime();
  if (article.publishedAt) return new Date(article.publishedAt).getTime();
  return new Date(article.createdAt || "").getTime();
}

/** Renders either the Airtable creation date or the scheduled/published date. */
export function formatArticleDate(
  article: Article,
  showCreationDate: boolean,
  fallback: string,
): string {
  if (showCreationDate) {
    return article.date ? new Date(article.date).toLocaleDateString() : fallback;
  }
  if (article.Scheduled && article.Scheduled.length > 0) {
    return new Date(article.Scheduled).toLocaleDateString();
  }
  if (article.publishedAt) {
    return new Date(article.publishedAt).toLocaleDateString();
  }
  return fallback;
}

/** A draft with a past publication date can be put back live. */
export function wasPreviouslyPublished(article: Article): boolean {
  return Boolean(
    article.status === "draft" && article.publishedAt && new Date(article.publishedAt) < new Date(),
  );
}
