import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSaveArticle } from "@/hooks/use-article-mutations";
import type { Article } from "@shared/schema";

const CHECK_INTERVAL_MS = 60_000;
const PROCESSED_RESET_INTERVAL_MS = 600_000;
/**
 * Only articles scheduled within this window are caught up. Without it an old
 * draft whose scheduled date is long past would be republished on every load.
 */
const CATCH_UP_WINDOW_MS = 2 * 60 * 60 * 1000;

interface AutoPublishOptions {
  articles: Article[] | undefined;
  /** Runs once the status change landed, for downstream syncing. */
  onPublished?: (article: Article) => void;
}

/**
 * Publishes articles whose scheduled time has just passed.
 *
 * The server has its own publisher; this is the dashboard catching up while a
 * tab is open. Ids that have been handled are remembered so a slow refetch
 * cannot make the same article publish twice.
 */
export function useAutoPublishScheduler({ articles, onPublished }: AutoPublishOptions) {
  const { toast } = useToast();
  const [processedArticleIds, setProcessedArticleIds] = useState<Set<number>>(new Set());

  const publishMutation = useSaveArticle({
    onSuccess: (_data, variables) => {
      const article = articles?.find((candidate) => candidate.id === variables.id);
      if (article) onPublished?.(article);

      toast({
        title: "Article status updated",
        description: `Article status was set to "${variables.data.status}"`,
      });
    },
    onError: (error) => {
      toast({
        title: "Status update failed",
        description: error.message || "Failed to update article status.",
        variant: "destructive",
      });
    },
  });

  const autoPublishingArticleId =
    publishMutation.isPending && publishMutation.variables ? publishMutation.variables.id ?? null : null;

  // `mutate` keeps a stable identity; the mutation object itself does not, and
  // depending on it would tear down the interval below on every render.
  const publish = publishMutation.mutate;

  // Forget handled ids periodically so an article rescheduled later still runs.
  useEffect(() => {
    const resetInterval = setInterval(() => setProcessedArticleIds(new Set()), PROCESSED_RESET_INTERVAL_MS);
    return () => clearInterval(resetInterval);
  }, []);

  const checkAndPublishScheduledArticles = useCallback(() => {
    if (!articles || articles.length === 0) return;

    const now = new Date();
    const cutoffTime = new Date(now.getTime() - CATCH_UP_WINDOW_MS);

    const articlesToPublish = articles.filter((article) => {
      // Only the Scheduled field counts — falling back to publishedAt used to
      // resurrect drafts that had been deliberately unpublished.
      if (!article.Scheduled) return false;

      const scheduledDate = new Date(article.Scheduled);
      if (scheduledDate > now || scheduledDate < cutoffTime) return false;

      if (article.status === "published" || processedArticleIds.has(article.id)) return false;

      return autoPublishingArticleId !== article.id;
    });

    if (articlesToPublish.length === 0) return;

    setProcessedArticleIds((previous) => {
      const next = new Set(previous);
      articlesToPublish.forEach((article) => next.add(article.id));
      return next;
    });

    // One at a time; the next tick picks up the rest.
    publish({ id: articlesToPublish[0].id, data: { status: "published" } });
  }, [articles, processedArticleIds, publish, autoPublishingArticleId]);

  useEffect(() => {
    if (!articles) return;

    checkAndPublishScheduledArticles();
    const intervalId = setInterval(checkAndPublishScheduledArticles, CHECK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [articles, checkAndPublishScheduledArticles]);

  return { autoPublishingArticleId };
}
