import { useRef } from "react";
import { Camera, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AirtableImageField } from "@/hooks/use-article-uploads";

const PLACEHOLDER_IMAGE = "https://placehold.co/600x400?text=Invalid+Image+URL";

/** Everything that differs between the cover image and the Instagram image. */
const FIELD_CONFIG = {
  MainImage: {
    name: "imageUrl",
    label: "Image URL",
    placeholder: "URL for article cover image",
    currentLabel: "Current image from Airtable:",
    uploadTargetSuffix: "",
    previewAlt: "Article cover preview",
    help: "Enter a direct link to an image for the article cover",
    icon: Upload,
  },
  instaPhoto: {
    name: "instagramImageUrl",
    label: "Instagram Image URL",
    placeholder: "URL for Instagram image",
    currentLabel: "Current Instagram image from Airtable:",
    uploadTargetSuffix: " instaPhoto field",
    previewAlt: "Instagram image preview",
    help: "Enter a direct link to an Instagram image (for Airtable instaPhoto field)",
    icon: Camera,
  },
} as const;

interface ArticleImageFieldProps {
  field: AirtableImageField;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Only Airtable-backed articles can push an image into an attachment field. */
  showUpload: boolean;
  imgbbEnabled: boolean;
  uploading: boolean;
  onFileSelected: (file: File) => void;
}

export function ArticleImageField({
  field,
  value,
  onChange,
  showUpload,
  imgbbEnabled,
  uploading,
  onFileSelected,
}: ArticleImageFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const config = FIELD_CONFIG[field];
  const UploadIcon = config.icon;
  const route = imgbbEnabled ? "via ImgBB to Airtable" : "to Airtable";

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFileSelected(file);
    event.target.value = "";
  };

  return (
    <div className="col-span-2">
      <Label htmlFor={config.name}>{config.label}</Label>
      <div className="flex gap-2">
        <Input
          id={config.name}
          name={config.name}
          value={value}
          onChange={onChange}
          placeholder={config.placeholder}
          className="flex-grow"
        />
        {showUpload && (
          <Button
            type="button"
            variant="outline"
            className="flex items-center gap-1"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <UploadIcon className="h-4 w-4" />
                <span>Upload</span>
              </>
            )}
          </Button>
        )}
        <input type="file" ref={fileInputRef} onChange={handleChange} className="hidden" accept="image/*" />
      </div>

      {showUpload && (
        <p className="text-xs text-blue-600 mt-1">
          {value && (
            <span className="block mb-1">
              <span className="font-medium">{config.currentLabel}</span>{" "}
              {value.length > 50 ? `${value.substring(0, 50)}...` : value}
            </span>
          )}
          {uploading ? (
            <span className="font-medium text-amber-600">
              Uploading image {route}
              {config.uploadTargetSuffix}...
            </span>
          ) : (
            <span>
              You can {imgbbEnabled ? "upload images via ImgBB to the" : "directly upload images to the"}{" "}
              {field} field in Airtable using the Upload button
            </span>
          )}
        </p>
      )}

      {value && (
        <div className="mt-2 p-1 border border-gray-200 rounded-md overflow-hidden w-32 h-32">
          <img
            src={value}
            alt={config.previewAlt}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.src = PLACEHOLDER_IMAGE;
            }}
          />
        </div>
      )}

      <p className="text-xs text-gray-500 mt-1">{config.help}</p>
    </div>
  );
}
