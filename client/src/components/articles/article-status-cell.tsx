import { Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Article } from "@shared/schema";
import { getDisplayStatus, wasPreviouslyPublished } from "./article-utils";

interface ArticleStatusCellProps {
  article: Article;
  isPublishing: boolean;
  /** Card layout: stacks to the right and swaps tooltips for title attributes. */
  compact?: boolean;
}

function PublishingIndicator({ className }: { className: string }) {
  return (
    <div className={className}>
      <Loader2 className="h-3 w-3 animate-spin mr-1" />
      <span>Publishing...</span>
    </div>
  );
}

export function ArticleStatusCell({ article, isPublishing, compact = false }: ArticleStatusCellProps) {
  const republishable = wasPreviouslyPublished(article);

  if (compact) {
    return (
      <div className="flex flex-col items-end">
        <div className="flex items-center space-x-1">
          <StatusBadge status={getDisplayStatus(article)} />
          {republishable && (
            <div
              className="h-1.5 w-1.5 rounded-full bg-orange-400"
              title="Previously published (Republish available)"
            />
          )}
          {article.republished && (
            <div className="h-1.5 w-1.5 rounded-full bg-blue-400" title="Marked for republish" />
          )}
        </div>
        {isPublishing && <PublishingIndicator className="flex items-center text-xs text-amber-600 mt-1" />}
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-1">
      <StatusBadge status={getDisplayStatus(article)} />
      {republishable && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="h-2 w-2 rounded-full bg-orange-400 ml-1 cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Previously published (Republish available)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {article.republished && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="h-2 w-2 rounded-full bg-blue-400 ml-1 cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Marked for republish</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {isPublishing && <PublishingIndicator className="ml-2 flex items-center text-xs text-amber-600" />}
    </div>
  );
}
