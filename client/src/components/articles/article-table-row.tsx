import { SiAirtable, SiInstagram } from "react-icons/si";
import { Article } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { ArticleAirtableDetails } from "./article-airtable-details";
import { ArticleStatusCell } from "./article-status-cell";
import { ArticleThumbnail } from "./article-thumbnail";
import {
  ArticleTableActions,
  type ArticlePendingState,
  type ArticleRowActions,
} from "./article-table-actions";
import { formatArticleDate, formatTags, truncateText } from "./article-utils";

const MAX_VISIBLE_TAGS = 3;

function SourceIcon({ source }: { source: string | null }) {
  if (!source) return null;
  if (source.includes("airtable")) return <SiAirtable className="text-[#3074D8] mr-1" />;
  if (source.includes("instagram")) return <SiInstagram className="text-pink-600 mr-1" />;
  return null;
}

interface ArticleTableRowProps {
  article: Article;
  actions: ArticleRowActions;
  pending: ArticlePendingState;
  isPublishing: boolean;
  isHighlighted: boolean;
  showCreationDate: boolean;
}

export function ArticleTableRow({
  article,
  actions,
  pending,
  isPublishing,
  isHighlighted,
  showCreationDate,
}: ArticleTableRowProps) {
  const tags = formatTags(article.hashtags);

  return (
    <tr
      className={`${article.source === "airtable" ? "bg-blue-50/30" : ""} ${isHighlighted ? "discord-highlight" : ""}`}
    >
      <td className="px-6 py-4">
        <div className="flex items-start">
          <div className="h-10 w-10 flex-shrink-0">
            <ArticleThumbnail article={article} className="h-10 w-10 rounded" />
          </div>
          <div className="ml-4 max-w-xs">
            <div
              className="text-sm font-medium text-gray-900 truncate max-w-[200px]"
              title={article.title.length > 35 ? article.title : undefined}
            >
              {truncateText(article.title, 35)}
            </div>

            {article.description && (
              <div
                className="text-xs text-gray-500 truncate max-w-[200px] mt-1"
                title={article.description.length > 40 ? article.description : undefined}
              >
                {truncateText(article.description, 40)}
              </div>
            )}

            {article.hashtags && (
              <div className="text-xs text-gray-500 mt-1 flex flex-wrap">
                {tags.slice(0, MAX_VISIBLE_TAGS).map((tag, index) => (
                  <Badge key={index} variant="outline" className="mr-1 mb-1 text-xs py-0">
                    {tag}
                  </Badge>
                ))}
                {tags.length > MAX_VISIBLE_TAGS && (
                  <div
                    className="mr-1 mb-1 text-xs py-0 cursor-pointer"
                    title={tags.slice(MAX_VISIBLE_TAGS).join(", ")}
                  >
                    <Badge variant="outline" className="text-xs py-0">
                      +{tags.length - MAX_VISIBLE_TAGS}
                    </Badge>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </td>

      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900 truncate max-w-[120px]" title={article.author}>
          {article.author}
        </div>
      </td>

      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900 truncate max-w-[120px]" title={article.photo || ""}>
          {article.photo || "—"}
        </div>
        {article.photoCredit && (
          <div className="text-xs text-gray-500 truncate max-w-[120px]" title={article.photoCredit}>
            Credit: {article.photoCredit}
          </div>
        )}
      </td>

      <td className="px-6 py-4 whitespace-nowrap">
        <ArticleStatusCell article={article} isPublishing={isPublishing} />
      </td>

      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {formatArticleDate(article, showCreationDate, "--")}
      </td>

      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        <div className="flex items-center">
          <span className="flex items-center">
            <SourceIcon source={article.source} />
            {article.source ? article.source.charAt(0).toUpperCase() + article.source.slice(1) : "Unknown"}
          </span>
          <ArticleAirtableDetails article={article} />
        </div>
      </td>

      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
        <ArticleTableActions article={article} actions={actions} pending={pending} />
      </td>
    </tr>
  );
}
