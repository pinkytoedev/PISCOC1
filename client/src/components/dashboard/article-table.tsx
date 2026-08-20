import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Article } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import {
  useDeleteArticle,
  usePushArticleToAirtable,
  useReuploadSession,
  useUpdateArticleInAirtable,
} from "@/hooks/use-article-mutations";
import { useAutoPublishScheduler } from "@/hooks/use-article-autopublish";
import { useImgbbImageUpload, type AirtableImageField } from "@/hooks/use-article-uploads";
import { ArticleCard } from "@/components/articles/article-card";
import { ArticleTableRow } from "@/components/articles/article-table-row";
import {
  ArticleCardPagination,
  ArticleTablePagination,
} from "@/components/articles/article-table-pagination";
import type {
  ArticlePendingState,
  ArticleRowActions,
} from "@/components/articles/article-table-actions";
import { getRelevantDate } from "@/components/articles/article-utils";

const ARTICLES_PER_PAGE = 15;

interface ArticleTableProps {
  filter?: string;
  sort?: string;
  onEdit?: (article: Article) => void;
  onView?: (article: Article) => void;
  onDelete?: (article: Article) => void;
  highlightedArticleId?: number | null;
}

function sortArticles(articles: Article[], sort: string | undefined): Article[] {
  return [...articles].sort((a, b) => {
    if (!sort || sort === "newest") return getRelevantDate(b) - getRelevantDate(a);
    if (sort === "oldest") return getRelevantDate(a) - getRelevantDate(b);

    if (sort === "chronological") {
      const dateA = a.Scheduled ? new Date(a.Scheduled).getTime() : a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.Scheduled ? new Date(b.Scheduled).getTime() : b.date ? new Date(b.date).getTime() : 0;

      if (dateA && dateB) return dateA - dateB;
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;

      return new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime();
    }

    return 0;
  });
}

export function ArticleTable({
  filter,
  sort,
  onEdit,
  onView,
  onDelete,
  highlightedArticleId,
}: ArticleTableProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreationDate, setShowCreationDate] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The file dialog resolves long after the click, so the target has to be kept.
  const [uploadTarget, setUploadTarget] = useState<{ articleId: number; field: AirtableImageField } | null>(
    null,
  );
  const [recentlyPushedArticles, setRecentlyPushedArticles] = useState<Set<number>>(new Set());

  const { data: articles, isLoading } = useQuery<Article[]>({
    queryKey: ["/api/articles"],
  });

  const deleteArticleMutation = useDeleteArticle();
  const updateAirtableMutation = useUpdateArticleInAirtable();
  const pushToAirtableMutation = usePushArticleToAirtable();
  const reupload = useReuploadSession();

  const uploadImageMutation = useImgbbImageUpload({
    onSuccess: (data) => {
      setUploadTarget(null);
      toast({
        title: "Image uploaded",
        description: `Image was successfully uploaded to ImgBB${data.airtable ? " and Airtable" : ""}.`,
      });
    },
    onError: (error) => {
      setUploadTarget(null);
      toast({
        title: "Image upload failed",
        description: error.message || "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    },
  });

  /**
   * A freshly published article has to reach Airtable: linked records get an
   * update, unlinked ones get created. The push is guarded because an
   * invalidation can re-run this before the new external id is visible.
   */
  const syncPublishedToAirtable = useCallback(
    (article: Article) => {
      // Give the write a moment to land before Airtable reads it back.
      if (article.source === "airtable" && article.externalId) {
        setTimeout(() => updateAirtableMutation.mutate(article.id), 500);
        return;
      }

      if (article.source === "airtable" || article.externalId) return;
      if (recentlyPushedArticles.has(article.id)) return;

      setRecentlyPushedArticles((previous) => new Set(previous).add(article.id));
      setTimeout(() => pushToAirtableMutation.mutate(article.id), 500);
      setTimeout(() => {
        setRecentlyPushedArticles((previous) => {
          const next = new Set(previous);
          next.delete(article.id);
          return next;
        });
      }, 5000);
    },
    [recentlyPushedArticles, updateAirtableMutation, pushToAirtableMutation],
  );

  const { autoPublishingArticleId } = useAutoPublishScheduler({
    articles,
    onPublished: syncPublishedToAirtable,
  });

  const handleUploadImage = (article: Article, field: AirtableImageField) => {
    setUploadTarget({ articleId: article.id, field });
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && uploadTarget) {
      uploadImageMutation.mutate({ ...uploadTarget, file });
    }
    event.target.value = "";
  };

  const handleDelete = (article: Article) => {
    if (onDelete) {
      onDelete(article);
      return;
    }
    if (confirm("Are you sure you want to delete this article?")) {
      deleteArticleMutation.mutate(article.id);
    }
  };

  const actions: ArticleRowActions = {
    onEdit,
    onView,
    onDelete: handleDelete,
    onUploadImage: handleUploadImage,
    onUpdateAirtable: (article) => updateAirtableMutation.mutate(article.id),
    onPushToAirtable: (article) => pushToAirtableMutation.mutate(article.id),
    onStartReupload: (article) => reupload.start.mutate(article.id),
    onCompleteReupload: (article) => reupload.complete.mutate(article.id),
    onCancelReupload: (article) => reupload.cancel.mutate(article.id),
  };

  const pendingFor = (article: Article): ArticlePendingState => ({
    uploadingField:
      uploadImageMutation.isPending && uploadImageMutation.variables?.articleId === article.id
        ? uploadImageMutation.variables.field
        : null,
    isUpdatingAirtable: updateAirtableMutation.isPending,
    isPushingAirtable: pushToAirtableMutation.isPending && pushToAirtableMutation.variables === article.id,
    isStartingReupload: reupload.start.isPending,
    isCompletingReupload: reupload.complete.isPending,
    isCancellingReupload: reupload.cancel.isPending,
  });

  const sortedAllArticles = useMemo(() => {
    const filtered = (articles ?? []).filter((article) => {
      if (searchQuery && !article.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filter && article.status !== filter) return false;
      return true;
    });
    return sortArticles(filtered, sort);
  }, [articles, searchQuery, filter, sort]);

  const totalPages = Math.ceil(sortedAllArticles.length / ARTICLES_PER_PAGE);
  const visibleArticles = sortedAllArticles.slice(
    (currentPage - 1) * ARTICLES_PER_PAGE,
    currentPage * ARTICLES_PER_PAGE,
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

      <div className="flex flex-col md:flex-row md:justify-between md:items-center p-4 border-b border-gray-200 gap-4">
        <h2 className="text-lg font-medium text-gray-900">
          {filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Articles` : "All Articles"}
        </h2>
        <div className="relative w-full md:w-auto">
          <input
            type="text"
            placeholder="Search articles..."
            aria-label="Search articles"
            className="border border-gray-300 rounded-md px-4 py-2 text-sm w-full md:w-64 focus:ring-primary focus:border-primary"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Title
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Author
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Photo
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center"
              >
                <button
                  onClick={() => setShowCreationDate(!showCreationDate)}
                  className="flex items-center group"
                  title={
                    showCreationDate
                      ? "Showing Creation Date (Airtable's Date field)"
                      : "Showing Scheduled Date (Airtable's Scheduled field)"
                  }
                >
                  {showCreationDate ? "Created" : "Scheduled"}
                  <RefreshCw className="h-3 w-3 ml-1 opacity-20 group-hover:opacity-100 transition-opacity" />
                </button>
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Source
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center">
                  Loading articles...
                </td>
              </tr>
            ) : visibleArticles.length > 0 ? (
              visibleArticles.map((article) => (
                <ArticleTableRow
                  key={article.id}
                  article={article}
                  actions={actions}
                  pending={pendingFor(article)}
                  isPublishing={autoPublishingArticleId === article.id}
                  isHighlighted={highlightedArticleId === article.id}
                  showCreationDate={showCreationDate}
                />
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center">
                  No articles found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <ArticleTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedAllArticles.length}
          pageSize={ARTICLES_PER_PAGE}
          onPageChange={handlePageChange}
        />
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden">
        {isLoading ? (
          <div className="space-y-4 p-4">
            {Array(3)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="bg-white rounded-lg shadow p-4">
                  <div className="animate-pulse space-y-3">
                    <div className="h-5 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                    <div className="flex justify-end">
                      <div className="h-8 bg-gray-200 rounded w-20"></div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        ) : visibleArticles.length === 0 ? (
          <div className="p-8 text-center text-gray-500 bg-white rounded-lg shadow">
            {searchQuery ? (
              <div>
                <p className="text-lg font-medium">No articles found</p>
                <p className="text-sm">Try adjusting your search query or filters</p>
              </div>
            ) : (
              <div>
                <p className="text-lg font-medium">No articles available</p>
                <p className="text-sm">Create your first article to get started</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {visibleArticles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                actions={actions}
                isPublishing={autoPublishingArticleId === article.id}
                isHighlighted={highlightedArticleId === article.id}
                showCreationDate={showCreationDate}
              />
            ))}

            <ArticleCardPagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}
