import { useRef } from "react";
import { FileArchive, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AssetUploadStatus = "idle" | "uploading" | "success" | "error";

export interface AssetUploadState {
  status: AssetUploadStatus;
  message?: string;
}

/** The asset kinds this panel exposes; the endpoint accepts more. */
export type PanelAssetType = "image" | "html-zip";

interface ArticleAssetUploadPanelProps {
  /** Uploads need an existing article id, so a brand new article cannot use them. */
  canUpload: boolean;
  status: Record<PanelAssetType, AssetUploadState>;
  onSelect: (type: PanelAssetType, file: File) => void;
}

const LABELS: Record<PanelAssetType, string> = {
  image: "Main image",
  "html-zip": "HTML ZIP",
};

export function ArticleAssetUploadPanel({ canUpload, status, onSelect }: ArticleAssetUploadPanelProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (type: PanelAssetType) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onSelect(type, file);
    // Allow re-selecting the same file.
    event.target.value = "";
  };

  return (
    <div className="mb-4 p-4 border border-pink-200 bg-pink-50 rounded-md">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-pink-800">Upload assets</p>
          <p className="text-xs text-pink-700">
            Trigger the same actions as the /public-upload page directly from here.
          </p>
        </div>
        {!canUpload && <span className="text-xs text-pink-700">Save the article before uploading</span>}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!canUpload || status.image.status === "uploading"}
          onClick={() => imageInputRef.current?.click()}
          className="justify-center"
        >
          {status.image.status === "uploading" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading main image...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload Main Image
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="secondary"
          disabled={!canUpload || status["html-zip"].status === "uploading"}
          onClick={() => zipInputRef.current?.click()}
          className="justify-center"
        >
          {status["html-zip"].status === "uploading" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading HTML ZIP...
            </>
          ) : (
            <>
              <FileArchive className="mr-2 h-4 w-4" />
              Upload HTML ZIP
            </>
          )}
        </Button>
      </div>

      <input
        type="file"
        className="hidden"
        ref={imageInputRef}
        accept="image/*"
        onChange={handleChange("image")}
      />
      <input
        type="file"
        className="hidden"
        ref={zipInputRef}
        accept=".zip,application/zip"
        onChange={handleChange("html-zip")}
      />

      <div className="mt-2 space-y-1">
        {(["image", "html-zip"] as const).map((type) => {
          const state = status[type];
          if (state.status === "idle") return null;

          const color =
            state.status === "error"
              ? "text-red-600"
              : state.status === "success"
                ? "text-green-700"
                : "text-gray-700";

          return (
            <p key={type} className={`text-xs ${color}`}>
              {LABELS[type]}: {state.message}
            </p>
          );
        })}
      </div>
    </div>
  );
}
