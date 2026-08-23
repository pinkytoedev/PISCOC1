/**
 * Contributor upload page.
 *
 * Reached from a link an editor sends. There is no account, no password and
 * nothing to configure: open the link, drop the files, submit. The link itself
 * carries the authorization and names the article, so the page can identify
 * everything from the URL alone.
 *
 * Files are queued and uploaded together, which is what makes a multi-asset
 * submission a single action rather than three separate ones.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  FileArchive,
  Image as ImageIcon,
  Instagram,
  Loader2,
  PartyPopper,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type AssetType = "image" | "instagram-image" | "html-zip";

interface LinkInfo {
  article: {
    id: number;
    title: string;
    hasContent: boolean;
    hasCoverImage: boolean;
    hasInstagramImage: boolean;
  };
  uploadTypes: AssetType[];
  expiresAt: string;
  isReuploadSession: boolean;
}

type QueueStatus = "ready" | "uploading" | "done" | "error";

interface QueuedFile {
  id: string;
  file: File;
  assetType: AssetType;
  status: QueueStatus;
  message?: string;
}

const ASSET_LABELS: Record<AssetType, { title: string; hint: string; icon: typeof ImageIcon }> = {
  image: {
    title: "Cover image",
    hint: "JPEG, PNG, GIF or WebP",
    icon: ImageIcon,
  },
  "instagram-image": {
    title: "Instagram image",
    hint: "Square works best",
    icon: Instagram,
  },
  "html-zip": {
    title: "Article content",
    hint: "A .zip containing your HTML and its images",
    icon: FileArchive,
  },
};

/**
 * Infers which slot a dropped file belongs in.
 *
 * A ZIP is unambiguous. A single image is assumed to be the cover unless the
 * cover is already filled, which is the common case and saves the contributor
 * from having to categorize anything.
 */
function inferAssetType(file: File, allowed: AssetType[], taken: Set<AssetType>): AssetType | null {
  const isZip = file.name.toLowerCase().endsWith(".zip") || file.type.includes("zip");

  if (isZip) return allowed.includes("html-zip") ? "html-zip" : null;
  if (!file.type.startsWith("image/")) return null;

  if (allowed.includes("image") && !taken.has("image")) return "image";
  if (allowed.includes("instagram-image") && !taken.has("instagram-image")) return "instagram-image";
  return allowed.includes("image") ? "image" : null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ContributorUploadPage() {
  const [, params] = useRoute("/upload/:token");
  const token = params?.token ?? "";
  const { toast } = useToast();

  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    data: info,
    isLoading,
    error,
    refetch,
  } = useQuery<LinkInfo>({
    queryKey: [`/api/public-upload/${token}`],
    enabled: Boolean(token),
    retry: false,
  });

  const allowed = useMemo<AssetType[]>(() => info?.uploadTypes ?? [], [info]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      if (!allowed.length) return;

      setQueue((current) => {
        const taken = new Set(current.map((item) => item.assetType));
        const additions: QueuedFile[] = [];

        for (const file of Array.from(files)) {
          const assetType = inferAssetType(file, allowed, taken);

          if (!assetType) {
            toast({
              title: "Unsupported file",
              description: `${file.name} isn't a type this link accepts.`,
              variant: "destructive",
            });
            continue;
          }

          taken.add(assetType);
          additions.push({
            id: `${file.name}-${file.size}-${additions.length}`,
            file,
            assetType,
            status: "ready",
          });
        }

        // A later file for the same slot replaces the earlier one, so picking
        // the wrong image and re-dropping just works.
        const replaced = new Set(additions.map((item) => item.assetType));
        return [...current.filter((item) => !replaced.has(item.assetType)), ...additions];
      });
    },
    [allowed, toast],
  );

  const removeFile = (id: string) =>
    setQueue((current) => current.filter((item) => item.id !== id));

  /**
   * Moves a queued file into another asset slot.
   *
   * At most one entry may hold a given assetType: `uploadAll` posts to
   * `/{token}/{assetType}`, so two entries sharing a type silently overwrite
   * each other server-side while both report success. The displaced entry
   * therefore takes the slot this one vacates rather than keeping its own.
   */
  const changeAssetType = (id: string, assetType: AssetType) =>
    setQueue((current) => {
      const target = current.find((item) => item.id === id);
      if (!target || target.assetType === assetType) return current;

      const vacated = target.assetType;

      return current.map((item) => {
        if (item.id === id) {
          return { ...item, assetType, status: "ready" as const, message: undefined };
        }
        if (item.assetType === assetType) {
          // Its previous "done" no longer describes the slot it now holds, so it
          // goes back to "ready" and must be re-sent.
          return { ...item, assetType: vacated, status: "ready" as const, message: undefined };
        }
        return item;
      });
    });

  /** Uploads everything queued, one request per asset, reporting per file. */
  const uploadAll = async () => {
    const pending = queue.filter((item) => item.status !== "done");
    if (!pending.length) return;

    setIsUploading(true);

    for (const item of pending) {
      setQueue((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, status: "uploading", message: undefined } : entry,
        ),
      );

      try {
        const body = new FormData();
        body.append("file", item.file);

        const response = await fetch(`/api/public-upload/${token}/${item.assetType}`, {
          method: "POST",
          body,
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.message || "Upload failed");
        }

        setQueue((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "done", message: payload?.message }
              : entry,
          ),
        );
      } catch (uploadError) {
        setQueue((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "error",
                  message: uploadError instanceof Error ? uploadError.message : "Upload failed",
                }
              : entry,
          ),
        );
      }
    }

    setIsUploading(false);
    await refetch();
  };

  /** Closes the re-upload session, publishing the contributor's changes. */
  const finish = async () => {
    setIsUploading(true);
    try {
      const response = await fetch(`/api/public-upload/${token}/complete`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(payload?.message || "Could not finish");

      setIsFinished(true);
    } catch (finishError) {
      toast({
        title: "Couldn't publish",
        description: finishError instanceof Error ? finishError.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Accepting a drop anywhere on the page means the contributor never has to
  // aim at a small target.
  useEffect(() => {
    const prevent = (event: DragEvent) => event.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  if (isLoading) {
    return (
      <CenteredCard>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Checking your link…</p>
      </CenteredCard>
    );
  }

  if (error || !info) {
    return (
      <CenteredCard>
        <AlertCircle className="h-10 w-10 text-destructive" />
        <h1 className="text-xl font-semibold">This link doesn't work</h1>
        <p className="max-w-sm text-center text-muted-foreground">
          {error instanceof Error ? error.message : "The link may have expired or been revoked."}
        </p>
        <p className="text-sm text-muted-foreground">Ask your editor for a fresh link.</p>
      </CenteredCard>
    );
  }

  if (isFinished) {
    return (
      <CenteredCard>
        <PartyPopper className="h-12 w-12 text-emerald-600" />
        <h1 className="text-2xl font-semibold">All done — thank you!</h1>
        <p className="max-w-sm text-center text-muted-foreground">
          Your changes to “{info.article.title}” are live. You can close this page.
        </p>
      </CenteredCard>
    );
  }

  const uploadedCount = queue.filter((item) => item.status === "done").length;
  const hasFailures = queue.some((item) => item.status === "error");
  const canFinish = info.isReuploadSession && uploadedCount > 0 && !isUploading && !hasFailures;

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardDescription>Upload for</CardDescription>
            <CardTitle className="text-2xl">{info.article.title}</CardTitle>
            <CardDescription>
              Drop your files below — you can add all of them at once. Link expires{" "}
              {new Date(info.expiresAt).toLocaleDateString()}.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                addFiles(event.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50",
              )}
            >
              <UploadCloud className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Drop files here, or click to choose</p>
              <p className="text-sm text-muted-foreground">
                {allowed.map((type) => ASSET_LABELS[type].title).join(" · ")}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept={[
                  allowed.includes("image") || allowed.includes("instagram-image") ? "image/*" : "",
                  allowed.includes("html-zip") ? ".zip" : "",
                ]
                  .filter(Boolean)
                  .join(",")}
                onChange={(event) => {
                  if (event.target.files) addFiles(event.target.files);
                  // Reset so re-selecting the same file still fires onChange.
                  event.target.value = "";
                }}
              />
            </div>

            {queue.length > 0 && (
              <ul className="space-y-2">
                {queue.map((item) => {
                  const Icon = ASSET_LABELS[item.assetType].icon;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 rounded-md border bg-background p-3"
                    >
                      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {ASSET_LABELS[item.assetType].title} · {formatBytes(item.file.size)}
                        </p>
                        {item.message && (
                          <p
                            className={cn(
                              "mt-1 text-xs",
                              item.status === "error" ? "text-destructive" : "text-emerald-600",
                            )}
                          >
                            {item.message}
                          </p>
                        )}
                      </div>

                      {/* Lets the contributor correct a wrong guess without re-dropping. */}
                      {item.status === "ready" && allowed.length > 1 && (
                        <select
                          value={item.assetType}
                          onChange={(event) =>
                            changeAssetType(item.id, event.target.value as AssetType)
                          }
                          className="rounded border bg-background px-2 py-1 text-xs"
                          aria-label="Change file type"
                        >
                          {allowed.map((type) => (
                            <option key={type} value={type}>
                              {ASSET_LABELS[type].title}
                            </option>
                          ))}
                        </select>
                      )}

                      {item.status === "uploading" && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      {item.status === "done" && (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      )}
                      {item.status === "error" && (
                        <AlertCircle className="h-5 w-5 text-destructive" />
                      )}

                      {item.status !== "uploading" && item.status !== "done" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeFile(item.id)}
                          aria-label={`Remove ${item.file.name}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex flex-col gap-3">
              <Button
                onClick={uploadAll}
                disabled={isUploading || queue.every((item) => item.status === "done")}
                size="lg"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  `Upload ${queue.filter((item) => item.status !== "done").length || ""} file${
                    queue.filter((item) => item.status !== "done").length === 1 ? "" : "s"
                  }`.replace("  ", " ")
                )}
              </Button>

              {info.isReuploadSession && (
                <>
                  <Button
                    onClick={finish}
                    disabled={!canFinish}
                    variant={canFinish ? "default" : "outline"}
                    size="lg"
                  >
                    I'm finished — publish my changes
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    {hasFailures
                      ? "Fix the failed uploads above before publishing."
                      : uploadedCount === 0
                        ? "Upload at least one file first."
                        : "This puts the updated article back on the site."}
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 px-4">
      {children}
    </div>
  );
}
