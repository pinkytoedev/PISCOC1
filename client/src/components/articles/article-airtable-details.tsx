import { Info } from "lucide-react";
import { Article } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatTags, getDisplayStatus, truncateText } from "./article-utils";

function DetailRow({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="col-span-1 text-muted-foreground">{label}</div>
      <div className={className ? `col-span-2 ${className}` : "col-span-2"}>{children}</div>
    </div>
  );
}

function ContentPreview({ article }: { article: Article }) {
  if (!article.content) return <>No content available</>;

  if (article.contentFormat === "html") {
    return (
      <div className="prose prose-sm max-w-none">
        {truncateText(article.content.replace(/<[^>]*>/g, " "), 300)}
      </div>
    );
  }

  if (article.contentFormat === "plaintext" || article.contentFormat === "txt") {
    return <div className="font-mono">{truncateText(article.content, 300)}</div>;
  }

  if (article.contentFormat === "rtf") {
    return (
      <div>
        <span className="text-yellow-600 text-xs mb-1 block">RTF format</span>
        {truncateText(article.content, 300)}
      </div>
    );
  }

  return <>{truncateText(article.content, 300)}</>;
}

/** Read-only dump of the Airtable-backed fields, shown only for Airtable rows. */
export function ArticleAirtableDetails({ article }: { article: Article }) {
  if (article.source !== "airtable") return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="ml-1" aria-label="Airtable details">
          <Info className="h-4 w-4 text-gray-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-w-[95vw]">
        <div className="px-2 py-1.5 text-sm font-semibold">Airtable Details</div>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-sm space-y-2 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1 text-muted-foreground">External ID:</div>
            <div className="col-span-2 font-mono text-xs bg-gray-100 p-1 rounded break-all">
              {article.externalId || "N/A"}
            </div>
          </div>

          <DetailRow label="Format:">{article.contentFormat || "N/A"}</DetailRow>
          <DetailRow label="Featured:">{article.featured === "yes" ? "Yes" : "No"}</DetailRow>
          <DetailRow label="Status:">
            <StatusBadge status={getDisplayStatus(article)} />
          </DetailRow>
          <DetailRow label="Created:">
            {article.date ? new Date(article.date).toLocaleString() : "Not recorded"}
          </DetailRow>
          <DetailRow label="Scheduled:">
            {article.Scheduled
              ? new Date(article.Scheduled).toLocaleString()
              : article.publishedAt
                ? new Date(article.publishedAt).toLocaleString()
                : "Not scheduled"}
          </DetailRow>

          {article.author && (
            <DetailRow label="Author:" className="truncate">
              {article.author}
            </DetailRow>
          )}

          {article.photo && (
            <DetailRow label="Photo:" className="truncate">
              {article.photo}
            </DetailRow>
          )}

          {article.hashtags && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1 text-muted-foreground">Tags:</div>
              <div className="col-span-2 flex flex-wrap gap-1">
                {formatTags(article.hashtags).map((tag, index) => (
                  <Badge key={index} variant="outline" className="text-xs py-0">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1 text-muted-foreground">Description:</div>
            <div className="col-span-2 text-xs line-clamp-2">{article.description || "N/A"}</div>
          </div>

          <div className="mt-2 border-t pt-2">
            <div className="text-xs text-gray-500 mb-1">Content Preview:</div>
            <div className="text-xs bg-gray-50 p-2 rounded-md max-h-[100px] overflow-y-auto">
              <ContentPreview article={article} />
            </div>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
