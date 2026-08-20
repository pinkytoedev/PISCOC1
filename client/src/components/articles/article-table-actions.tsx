import {
  CheckCircle2,
  Edit,
  Eye,
  Image,
  ImagePlus,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { Article } from "@shared/schema";
import { Button } from "@/components/ui/button";
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

function IconButton({
  label,
  className,
  disabled,
  busy,
  icon,
  onClick,
}: {
  label: string;
  className: string;
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
            className={className}
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

  return (
    <div className="flex space-x-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => actions.onEdit?.(article)}
        className="text-primary hover:text-blue-700"
        aria-label="Edit article"
      >
        <Edit className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => actions.onView?.(article)}
        className="text-gray-500 hover:text-gray-700"
        aria-label="View article"
      >
        <Eye className="h-4 w-4" />
      </Button>

      <IconButton
        label="Upload Main Image"
        className="text-green-600 hover:text-green-800"
        disabled={pending.uploadingField === "MainImage"}
        busy={pending.uploadingField === "MainImage"}
        icon={<Image className="h-4 w-4" />}
        onClick={() => actions.onUploadImage(article, "MainImage")}
      />

      <IconButton
        label="Upload Instagram Image"
        className="text-pink-500 hover:text-pink-700"
        disabled={pending.uploadingField === "instaPhoto"}
        busy={pending.uploadingField === "instaPhoto"}
        icon={<ImagePlus className="h-4 w-4" />}
        onClick={() => actions.onUploadImage(article, "instaPhoto")}
      />

      {linkedToAirtable ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => actions.onUpdateAirtable(article)}
          className="text-blue-600 hover:text-blue-800"
          disabled={pending.isUpdatingAirtable}
          title="Update in Airtable"
          aria-label="Update in Airtable"
        >
          {pending.isUpdatingAirtable ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      ) : (
        <IconButton
          label="Push to Airtable"
          className="text-purple-600 hover:text-purple-800"
          disabled={pending.isPushingAirtable}
          busy={pending.isPushingAirtable}
          icon={<Upload className="h-4 w-4" />}
          onClick={() => actions.onPushToAirtable(article)}
        />
      )}

      {canReupload && (
        <IconButton
          label="Re-upload content (copies an upload link)"
          className="text-orange-600 hover:text-orange-800"
          disabled={pending.isStartingReupload}
          busy={pending.isStartingReupload}
          icon={<RotateCcw className="h-4 w-4" />}
          onClick={() => actions.onStartReupload(article)}
        />
      )}

      {article.isReuploading && (
        <>
          <IconButton
            label="Finish re-upload and publish"
            className="text-emerald-600 hover:text-emerald-800"
            disabled={pending.isCompletingReupload}
            busy={pending.isCompletingReupload}
            icon={<CheckCircle2 className="h-4 w-4" />}
            onClick={() => actions.onCompleteReupload(article)}
          />
          <IconButton
            label="Cancel re-upload"
            className="text-muted-foreground hover:text-foreground"
            disabled={pending.isCancellingReupload}
            busy={pending.isCancellingReupload}
            icon={<XCircle className="h-4 w-4" />}
            onClick={() => actions.onCancelReupload(article)}
          />
        </>
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={() => actions.onDelete(article)}
        className="text-red-500 hover:text-red-700"
        aria-label="Delete article"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
