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
import { formatArticleDate, formatTags } from "./article-utils";

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
      {/*
        Deliberately the only column with no declared width. Under the
        `table-fixed` layout set on the table, the sized columns take their
        widths and this one absorbs everything left over — so the title grows on
        a wide monitor instead of leaving dead space, and shrinks to an ellipsis
        on a narrow one instead of forcing the table sideways. `min-w-0` is what
        lets the text actually shrink: without it a flex child refuses to go
        below its content width and the truncation never engages.
      */}
      <td className="px-4 py-4">
        <div className="flex items-start">
          <div className="h-10 w-10 flex-shrink-0">
            <ArticleThumbnail article={article} className="h-10 w-10 rounded" />
          </div>
          <div className="ml-3 min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-900 truncate" title={article.title}>
              {article.title}
            </div>

            {article.description && (
              <div
                className="text-xs text-gray-500 truncate mt-1"
                title={article.description}
              >
                {article.description}
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

      {/*
        Columns below drop out in priority order as the viewport narrows, rather
        than every column staying put and the whole table scrolling sideways.
        Title, Status, Date and Actions always survive; Author and Source return
        at xl, Photo at 2xl. The breakpoints are deliberately one step
        conservative because these are viewport-width queries while the table
        lives inside a layout with a ~256px sidebar.
      */}
      {/*
        No max-width on the text here. Under `table-fixed` the column's declared
        width already bounds the cell, so a max-w- on the inner div only fought
        it — truncating a name like "M. Delacroix-Whitfield" at 140px while the
        rest of the column sat empty.
      */}
      <td className="hidden xl:table-cell px-4 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900 truncate" title={article.author}>
          {article.author}
        </div>
      </td>

      <td className="hidden 2xl:table-cell px-4 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900 truncate" title={article.photo || ""}>
          {article.photo || "—"}
        </div>
        {article.photoCredit && (
          <div className="text-xs text-gray-500 truncate" title={article.photoCredit}>
            Credit: {article.photoCredit}
          </div>
        )}
      </td>

      <td className="px-4 py-4 whitespace-nowrap">
        <ArticleStatusCell article={article} isPublishing={isPublishing} />
      </td>

      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
        {formatArticleDate(article, showCreationDate, "--")}
      </td>

      <td className="hidden 2xl:table-cell px-4 py-4 whitespace-nowrap text-sm text-gray-500">
        <div className="flex items-center">
          <span className="flex items-center">
            <SourceIcon source={article.source} />
            {article.source ? article.source.charAt(0).toUpperCase() + article.source.slice(1) : "Unknown"}
          </span>
          <ArticleAirtableDetails article={article} />
        </div>
      </td>

      <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
        <ArticleTableActions article={article} actions={actions} pending={pending} />
      </td>
    </tr>
  );
}
