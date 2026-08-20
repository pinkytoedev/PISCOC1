import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Article, InsertArticle, TeamMember } from "@shared/schema";
import { Loader2, RefreshCw } from "lucide-react";
import { useSaveArticle } from "@/hooks/use-article-mutations";
import {
  extractUploadedImageUrl,
  useAirtableImageUpload,
  useArticleAssetUpload,
  useImgbbEnabled,
  useImgbbImageUpload,
  type AirtableImageField,
} from "@/hooks/use-article-uploads";
import {
  ArticleAssetUploadPanel,
  type AssetUploadState,
  type PanelAssetType,
} from "@/components/articles/article-asset-upload-panel";
import { ArticleFormFields } from "@/components/articles/article-form-fields";
import { AirtableSourceNotice, ImgbbStatusNotice } from "@/components/articles/article-source-notices";
import {
  buildArticleSubmission,
  buildRepublishSubmission,
} from "@/components/articles/article-submission";

interface CreateArticleModalProps {
  isOpen: boolean;
  onClose: () => void;
  editArticle?: Article | null;
}

const IDLE_UPLOADS: Record<PanelAssetType, AssetUploadState> = {
  image: { status: "idle" },
  "html-zip": { status: "idle" },
};

const DEFAULT_FORM: Partial<InsertArticle> = {
  title: "",
  description: "",
  excerpt: null,
  content: "",
  contentFormat: "html", // Airtable stores HTML
  imageUrl: "",
  imageType: "url",
  imagePath: null,
  instagramImageUrl: "", // Airtable instaPhoto field
  featured: "no",
  author: "",
  photo: "",
  photoCredit: null,
  status: "draft",
  hashtags: "",
  date: "", // Airtable Date field
  finished: false, // Airtable Finished checkbox
  republished: false,
};

/** Which form field an Airtable attachment field writes back into. */
const IMAGE_FORM_FIELD: Record<AirtableImageField, "imageUrl" | "instagramImageUrl"> = {
  MainImage: "imageUrl",
  instaPhoto: "instagramImageUrl",
};

export function CreateArticleModal({ isOpen, onClose, editArticle }: CreateArticleModalProps) {
  const { toast } = useToast();
  const isEditing = !!editArticle;
  const isFromAirtable = editArticle?.source === "airtable";

  const [formData, setFormData] = useState<Partial<InsertArticle>>(editArticle ?? DEFAULT_FORM);
  const [uploadStatus, setUploadStatus] = useState<Record<PanelAssetType, AssetUploadState>>(IDLE_UPLOADS);

  const imgbbEnabled = useImgbbEnabled(isOpen);

  useEffect(() => {
    if (!isOpen) return;

    const initial: Partial<InsertArticle> = editArticle ? { ...editArticle } : { ...DEFAULT_FORM };

    // publishedAt is typed as a Date but arrives over JSON as an ISO string.
    const publishedAt: unknown = initial.publishedAt;
    if (typeof publishedAt === "string") {
      initial.publishedAt = new Date(publishedAt);
    }

    // The photographer select needs a concrete value for its "None" option.
    if (!initial.photo) initial.photo = "none";

    setFormData(initial);
    setUploadStatus(IDLE_UPLOADS);
  }, [isOpen, editArticle]);

  const { data: teamMembers, isLoading: isLoadingTeamMembers } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const saveArticleMutation = useSaveArticle({
    onSuccess: () => {
      toast({
        title: isEditing ? "Article updated" : "Article created",
        description: isEditing
          ? "The article has been updated successfully."
          : "The article has been created successfully.",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: isEditing ? "Error updating article" : "Error creating article",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  const applyUploadedUrl = (field: AirtableImageField, url: string) => {
    setFormData((previous) => ({ ...previous, [IMAGE_FORM_FIELD[field]]: url }));
  };

  const imgbbUpload = useImgbbImageUpload({
    onSuccess: (data, { field }) => {
      const isMain = field === "MainImage";
      toast({
        title: `${isMain ? "Main" : "Instagram"} image uploaded via ImgBB successfully`,
        description: "The image was uploaded to ImgBB and linked to Airtable",
      });

      const url = extractUploadedImageUrl(data);
      if (!url) {
        toast({
          title: "Warning: Image URL not found in response",
          description: "The image was uploaded, but we couldn't extract its URL from the response",
          variant: "destructive",
        });
        return;
      }

      applyUploadedUrl(field, url);
    },
    onError: (error) => {
      toast({
        title: "Failed to upload image via ImgBB",
        description: error.message || "There was an error uploading the image",
        variant: "destructive",
      });
    },
  });

  const airtableUpload = useAirtableImageUpload({
    onSuccess: (data, { field }) => {
      toast({
        title: `${field === "MainImage" ? "Image" : "Instagram image"} uploaded successfully`,
        description: "The image was uploaded to Airtable and attached to the article",
      });

      const url = extractUploadedImageUrl(data);
      if (url) applyUploadedUrl(field, url);
    },
    onError: (error) => {
      toast({
        title: "Failed to upload image",
        description: error.message || "There was an error uploading the image to Airtable",
        variant: "destructive",
      });
    },
  });

  const assetUpload = useArticleAssetUpload({
    onMutate: ({ type }) => {
      setUploadStatus((previous) => ({
        ...previous,
        [type]: { status: "uploading", message: "Uploading..." },
      }));
    },
    onSuccess: (data, { type }) => {
      if (type === "image" && data.imageUrl) {
        setFormData((previous) => ({ ...previous, imageUrl: data.imageUrl }));
      }

      if (type === "html-zip" && data.html) {
        setFormData((previous) => ({ ...previous, content: data.html, contentFormat: "html" }));
      }

      setUploadStatus((previous) => ({
        ...previous,
        [type]: { status: "success", message: data.message || "Upload completed successfully." },
      }));

      toast({
        title: type === "image" ? "Main image uploaded" : "HTML ZIP uploaded",
        description: data.message || "The file was uploaded successfully.",
      });
    },
    onError: (error, { type }) => {
      setUploadStatus((previous) => ({
        ...previous,
        [type]: { status: "error", message: error.message || "Upload failed" },
      }));

      toast({
        title: "Upload failed",
        description: error.message || "There was an error uploading the file.",
        variant: "destructive",
      });
    },
  });

  const uploadingField = imgbbUpload.isPending
    ? imgbbUpload.variables?.field
    : airtableUpload.isPending
      ? airtableUpload.variables?.field
      : null;

  const handleImageFile = (field: AirtableImageField, file: File) => {
    if (!editArticle?.id) return;

    if (imgbbEnabled) {
      imgbbUpload.mutate({ articleId: editArticle.id, field, file });
      return;
    }

    if (!isEditing || !isFromAirtable) {
      toast({
        title: "Cannot upload directly to Airtable",
        description: "Direct Airtable uploads are only available for existing Airtable articles",
        variant: "destructive",
      });
      return;
    }

    airtableUpload.mutate({ articleId: editArticle.id, field, file });
  };

  const handleAssetUpload = (type: PanelAssetType, file: File) => {
    if (!editArticle?.id) {
      toast({
        title: "Save the article first",
        description: "Uploads require an existing article ID.",
        variant: "destructive",
      });
      return;
    }

    assetUpload.mutate({ articleId: editArticle.id, type, file });
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveArticleMutation.mutate({
      id: editArticle?.id,
      data: buildArticleSubmission(formData, editArticle),
    });
  };

  const handleRepublish = () => {
    if (!editArticle?.publishedAt) return;
    saveArticleMutation.mutate({
      id: editArticle.id,
      data: buildRepublishSubmission(formData, new Date(editArticle.publishedAt)),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Article" : "Create New Article"}</DialogTitle>
          <DialogDescription>
            Fill in the details below to {isEditing ? "update the" : "create a new"} article. You can{" "}
            {isEditing ? "change" : "edit"} content after creation.
          </DialogDescription>
        </DialogHeader>

        {isFromAirtable && (
          <>
            <AirtableSourceNotice externalId={editArticle?.externalId ?? null} />
            <ImgbbStatusNotice enabled={imgbbEnabled} />
          </>
        )}

        <ArticleAssetUploadPanel
          canUpload={isEditing}
          status={uploadStatus}
          onSelect={handleAssetUpload}
        />

        <form onSubmit={handleSubmit} className="space-y-4">
          <ArticleFormFields
            formData={formData}
            onInputChange={handleInputChange}
            onSelectChange={handleSelectChange}
            teamMembers={teamMembers}
            isLoadingTeamMembers={isLoadingTeamMembers}
            isFromAirtable={!!isFromAirtable}
            imgbbEnabled={imgbbEnabled}
            uploadingField={uploadingField ?? null}
            onImageFile={handleImageFile}
          />

          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>

            {/* Only a draft that was live before can be put back. */}
            {isEditing && formData.status === "draft" && editArticle?.publishedAt && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleRepublish}
                className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200"
                disabled={saveArticleMutation.isPending}
              >
                {saveArticleMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Republish
              </Button>
            )}

            <Button type="submit" disabled={saveArticleMutation.isPending}>
              {saveArticleMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditing ? "Updating..." : "Creating..."}
                </>
              ) : isEditing ? (
                "Update Article"
              ) : (
                "Create Article"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
