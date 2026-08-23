import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Article, InsertArticle } from "@shared/schema";

export const ARTICLES_QUERY_KEY = ["/api/articles"] as const;
/** The dashboard's status cards are derived from the same articles. */
export const METRICS_QUERY_KEY = ["/api/metrics"] as const;

/**
 * Callback surface the article hooks expose. Kept narrower than TanStack's own
 * options so callers cannot accidentally replace the cache invalidation that
 * every one of these mutations depends on.
 */
export interface MutationCallbacks<TData, TVariables> {
  onMutate?: (variables: TVariables) => void;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
}

function invalidateArticles() {
  queryClient.invalidateQueries({ queryKey: ARTICLES_QUERY_KEY });
  // Nothing invalidated the metrics key, and the client sets staleTime:
  // Infinity with no refetch on focus or interval — so the dashboard's Total /
  // Drafts / Published Today cards were fetched once and then contradicted the
  // article lists rendered directly beneath them for the rest of the session.
  queryClient.invalidateQueries({ queryKey: METRICS_QUERY_KEY });
}

export interface SaveArticleVariables {
  /** Omit to create; supply to update in place. */
  id?: number;
  data: Partial<InsertArticle>;
}

/** Creates or updates an article. Shared by the create/edit modal and the table. */
export function useSaveArticle(callbacks?: MutationCallbacks<Article, SaveArticleVariables>) {
  return useMutation<Article, Error, SaveArticleVariables>({
    mutationFn: async ({ id, data }) => {
      const response = await apiRequest(
        id ? "PUT" : "POST",
        id ? `/api/articles/${id}` : "/api/articles",
        data,
      );
      return await response.json();
    },
    onMutate: callbacks?.onMutate,
    onSuccess: (data, variables) => {
      invalidateArticles();
      callbacks?.onSuccess?.(data, variables);
    },
    onError: callbacks?.onError,
  });
}

export function useDeleteArticle() {
  const { toast } = useToast();

  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await apiRequest("DELETE", `/api/articles/${id}`);
    },
    onSuccess: () => {
      invalidateArticles();
      toast({
        title: "Article deleted",
        description: "The article has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting article",
        description: error.message || "There was an error deleting the article.",
        variant: "destructive",
      });
    },
  });
}

/** Pushes local edits of an already-linked article back into its Airtable record. */
export function useUpdateArticleInAirtable() {
  const { toast } = useToast();

  return useMutation<unknown, Error, number>({
    mutationFn: async (articleId) => {
      const response = await apiRequest("POST", `/api/airtable/update/article/${articleId}`);
      return await response.json();
    },
    onSuccess: () => {
      invalidateArticles();
      toast({
        title: "Airtable updated",
        description: "The article was successfully updated in Airtable.",
      });
    },
    onError: (error) => {
      toast({
        title: "Airtable update failed",
        description: error.message || "Failed to update article in Airtable.",
        variant: "destructive",
      });
    },
  });
}

/** Creates an Airtable record for an article that does not have one yet. */
export function usePushArticleToAirtable() {
  const { toast } = useToast();

  return useMutation<unknown, Error, number>({
    mutationFn: async (articleId) => {
      const response = await apiRequest("POST", `/api/airtable/push/article/${articleId}`);
      return await response.json();
    },
    onSuccess: () => {
      invalidateArticles();
      toast({
        title: "Pushed to Airtable",
        description: "The article was successfully pushed to Airtable.",
      });
    },
    onError: (error) => {
      toast({
        title: "Airtable push failed",
        description: error.message || "Failed to push article to Airtable.",
        variant: "destructive",
      });
    },
  });
}

interface ReuploadSessionResponse {
  uploadUrl?: string;
}

/**
 * The three transitions of a re-upload session: open, publish, abandon.
 *
 * Opening one returns a contributor link that is shown once. Copying it straight
 * to the clipboard is the whole handoff: the editor pastes it into a message and
 * the contributor needs nothing else.
 */
export function useReuploadSession() {
  const { toast } = useToast();

  const start = useMutation<ReuploadSessionResponse, Error, number>({
    mutationFn: async (articleId) => {
      const response = await apiRequest("POST", `/api/articles/${articleId}/reupload`);
      return (await response.json()) as ReuploadSessionResponse;
    },
    onSuccess: async (data) => {
      invalidateArticles();

      let copied = false;
      if (data.uploadUrl) {
        try {
          await navigator.clipboard.writeText(data.uploadUrl);
          copied = true;
        } catch {
          // Clipboard access needs a secure context and can be denied; the URL
          // is still shown so it can be copied by hand.
        }
      }

      toast({
        title: "Re-upload session open",
        description: copied
          ? "Upload link copied to your clipboard — send it to your contributor."
          : data.uploadUrl
            ? `Send this link to your contributor: ${data.uploadUrl}`
            : "The article is now a draft and ready for new content.",
        duration: copied ? 5000 : 20000,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to start re-upload",
        description: error.message || "Could not open a re-upload session.",
        variant: "destructive",
      });
    },
  });

  const complete = useMutation<unknown, Error, number>({
    mutationFn: async (articleId) => {
      const response = await apiRequest("POST", `/api/articles/${articleId}/reupload/complete`);
      return await response.json();
    },
    onSuccess: () => {
      invalidateArticles();
      toast({ title: "Published", description: "The article is live again." });
    },
    onError: (error) => {
      toast({
        title: "Could not publish",
        description: error.message || "Failed to complete the re-upload.",
        variant: "destructive",
      });
    },
  });

  const cancel = useMutation<unknown, Error, number>({
    mutationFn: async (articleId) => {
      const response = await apiRequest("POST", `/api/articles/${articleId}/reupload/cancel`);
      return await response.json();
    },
    onSuccess: () => {
      invalidateArticles();
      toast({ title: "Re-upload cancelled", description: "The article was restored." });
    },
    onError: (error) => {
      toast({
        title: "Could not cancel",
        description: error.message || "Failed to cancel the re-upload.",
        variant: "destructive",
      });
    },
  });

  return { start, complete, cancel };
}
