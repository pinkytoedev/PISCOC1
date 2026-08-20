import { ChevronDown, Edit, Eye, Image, ImagePlus, RefreshCw, Trash2, Upload } from "lucide-react";
import { Article } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArticleStatusCell } from "./article-status-cell";
import { ArticleThumbnail } from "./article-thumbnail";
import type { ArticleRowActions } from "./article-table-actions";
import { formatArticleDate, formatTags } from "./article-utils";

const MAX_VISIBLE_TAGS = 2;

interface ArticleCardProps {
  article: Article;
  actions: ArticleRowActions;
  isPublishing: boolean;
  isHighlighted: boolean;
  showCreationDate: boolean;
}

/** Mobile counterpart of a table row; secondary actions collapse into a menu. */
export function ArticleCard({
  article,
  actions,
  isPublishing,
  isHighlighted,
  showCreationDate,
}: ArticleCardProps) {
  const tags = formatTags(article.hashtags);

  return (
    <div className={`bg-white rounded-lg shadow p-4 ${isHighlighted ? "discord-highlight" : ""}`}>
      <div className="flex items-center space-x-3 mb-3">
        <ArticleThumbnail article={article} className="h-12 w-12 rounded-md flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 truncate">{article.title}</h3>
          <p className="text-xs text-gray-500 mt-1">
            ID: {article.id} • {article.source || "Local"}
          </p>
        </div>
        <ArticleStatusCell article={article} isPublishing={isPublishing} compact />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3">
        <div>
          <span className="font-medium">Author:</span> {article.author || "Unassigned"}
        </div>
        <div>
          <span className="font-medium">Photo:</span> {article.photo || "N/A"}
        </div>
        <div>
          <span className="font-medium">{showCreationDate ? "Created:" : "Scheduled:"}</span>{" "}
          {formatArticleDate(article, showCreationDate, showCreationDate ? "Not recorded" : "Unscheduled")}
        </div>
        <div>
          {article.hashtags && (
            <div className="flex flex-wrap gap-1 mt-1">
              {tags.slice(0, MAX_VISIBLE_TAGS).map((tag, index) => (
                <Badge key={index} variant="outline" className="text-xs py-0">
                  {tag}
                </Badge>
              ))}
              {tags.length > MAX_VISIBLE_TAGS && (
                <Badge variant="outline" className="text-xs py-0">
                  +{tags.length - MAX_VISIBLE_TAGS}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 mt-2 border-t pt-3">
        {actions.onEdit && (
          <Button size="sm" variant="outline" onClick={() => actions.onEdit?.(article)} className="flex-1">
            <Edit className="h-4 w-4 mr-2" /> Edit
          </Button>
        )}

        {actions.onView && (
          <Button size="sm" variant="outline" onClick={() => actions.onView?.(article)} className="flex-1">
            <Eye className="h-4 w-4 mr-2" /> View
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              More <ChevronDown className="h-4 w-4 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {article.source === "airtable" ? (
              <DropdownMenuItem onClick={() => actions.onUpdateAirtable(article)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                <span>Update from Airtable</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => actions.onPushToAirtable(article)}>
                <Upload className="mr-2 h-4 w-4" />
                <span>Push to Airtable</span>
              </DropdownMenuItem>
            )}

            <DropdownMenuItem onClick={() => actions.onUploadImage(article, "MainImage")}>
              <Image className="mr-2 h-4 w-4" />
              <span>Upload main image</span>
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => actions.onUploadImage(article, "instaPhoto")}>
              <ImagePlus className="mr-2 h-4 w-4" />
              <span>Upload Instagram image</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => actions.onDelete(article)}
              className="text-red-500 focus:text-red-500"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
