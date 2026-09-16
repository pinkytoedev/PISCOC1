/**
 * Row actions for the desktop article table.
 *
 * These used to be up to eight icon buttons laid out in a row: edit, view, two
 * image uploads, an Airtable push, three re-upload controls and delete. At
 * roughly 424px that made Actions the widest column in the table and pushed the
 * total past 1500px, so on any normal laptop the table scrolled sideways and the
 * actions — the last column — were the part that disappeared off the edge.
 *
 * Now it matches what the mobile card has always done: the two everyday actions
 * stay inline, everything else collapses into a labelled menu. That is ~120px,
 * and it also replaces eight same-sized icons whose meaning had to be recovered
 * from a tooltip with a list that says what each item does.
 *
 * Re-upload is the one piece of state worth surfacing in the row itself, so
 * while a session is open "Publish" sits inline and the rest of that flow stays
 * in the menu.
 */

import {
  CheckCircle2,
  Edit,
  Eye,
  Image,
  ImagePlus,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { Article } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AirtableImageField } from "@/hooks/use-article-uploads";

/** Everything a row can trigger, passed as one object so rows stay cheap to render. */
export interface ArticleRowActions {
  onEdit?: (article: Article) => void;
  onView?: (article: Article) => void;
  onDelete: (article: Article) => void;
  onUploadImage: (article: Article, field: AirtableImageField) => void;
  onUpdateAirtable: (article: Article) => void;
  onPushToAirtable: (article: Article) => void;
  onStartReupload: (article: Article) => void;
  onCompleteReupload: (article: Article) => void;
  onCancelReupload: (article: Article) => void;
}

/** In-flight state narrowed to a single article. */
export interface ArticlePendingState {
  uploadingField: AirtableImageField | null;
  isUpdatingAirtable: boolean;
  isPushingAirtable: boolean;
  isStartingReupload: boolean;
  isCompletingReupload: boolean;
  isCancellingReupload: boolean;
}

interface ArticleTableActionsProps {
  article: Article;
  actions: ArticleRowActions;
  pending: ArticlePendingState;
}

/** Compact icon button with the label in a tooltip. */
function IconButton({
  label,
  className,
  disabled,
  busy,
  icon,
  onClick,
}: {
  label: string;
  className?: string;
  disabled?: boolean;
  busy?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClick}
            className={`h-8 w-8 ${className ?? ""}`}
            disabled={disabled}
            aria-label={label}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ArticleTableActions({ article, actions, pending }: ArticleTableActionsProps) {
  const linkedToAirtable = article.source === "airtable" && article.externalId;
  const canReupload = (article.status === "published" || article.finished) && !article.isReuploading;

  // Menu items cannot each carry their own spinner, so the trigger reports that
  // *something* on this row is in flight — the feedback the per-button
  // spinners used to give.
  const menuBusy =
    pending.uploadingField !== null ||
    pending.isUpdatingAirtable ||
    pending.isPushingAirtable ||
    pending.isStartingReupload ||
    pending.isCancellingReupload;

  return (
    <div className="flex items-center justify-end gap-1">
      {actions.onEdit && (
        <IconButton
          label="Edit article"
          className="text-primary hover:text-blue-700"
          icon={<Edit className="h-4 w-4" />}
          onClick={() => actions.onEdit?.(article)}
        />
      )}

      {actions.onView && (
        <IconButton
          label="View article"
          className="text-gray-500 hover:text-gray-700"
          icon={<Eye className="h-4 w-4" />}
          onClick={() => actions.onView?.(article)}
        />
      )}

      {/* An open re-upload session is transient and needs closing, so its
          primary action stays visible rather than hiding behind the menu. */}
      {article.isReuploading && (
        <IconButton
          label="Finish re-upload and publish"
          className="text-emerald-600 hover:text-emerald-800"
          disabled={pending.isCompletingReupload}
          busy={pending.isCompletingReupload}
          icon={<CheckCircle2 className="h-4 w-4" />}
          onClick={() => actions.onCompleteReupload(article)}
        />
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-500 hover:text-gray-700"
            aria-label="More actions"
          >
            {menuBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => actions.onUploadImage(article, "MainImage")}
            disabled={pending.uploadingField === "MainImage"}
          >
            <Image className="mr-2 h-4 w-4" />
            <span>Upload main image</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => actions.onUploadImage(article, "instaPhoto")}
            disabled={pending.uploadingField === "instaPhoto"}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            <span>Upload Instagram image</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {linkedToAirtable ? (
            <DropdownMenuItem
              onClick={() => actions.onUpdateAirtable(article)}
              disabled={pending.isUpdatingAirtable}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              <span>Update in Airtable</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => actions.onPushToAirtable(article)}
              disabled={pending.isPushingAirtable}
            >
              <Upload className="mr-2 h-4 w-4" />
              <span>Push to Airtable</span>
            </DropdownMenuItem>
          )}

          {canReupload && (
            <DropdownMenuItem
              onClick={() => actions.onStartReupload(article)}
              disabled={pending.isStartingReupload}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              <span>Re-upload content</span>
            </DropdownMenuItem>
          )}

          {article.isReuploading && (
            <DropdownMenuItem
              onClick={() => actions.onCancelReupload(article)}
              disabled={pending.isCancellingReupload}
            >
              <XCircle className="mr-2 h-4 w-4" />
              <span>Cancel re-upload</span>
            </DropdownMenuItem>
          )}

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
  );
}
