/**
 * Public article upload page.
 *
 * The token-free submission flow: pick your article from the list of the ones
 * still open for submissions, attach whichever files you have, send them. No
 * account and no per-article link required.
 *
 * The whole page is behind an admin switch. When it is off, the status endpoint
 * still answers — that answer *is* the page — and every other call 403s, so
 * nothing here is reachable while submissions are closed.
 *
 * When one specific person needs to reach one specific article (a re-upload
 * session, say), the contributor-link page at /upload/:token is the narrower
 * tool and remains unchanged.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  FileArchive,
  Image as ImageIcon,
  Instagram,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type AssetType = "image" | "instagram-image" | "html-zip";

interface UploadableArticle {
  id: number;
  title: string;
  status: string;
}

type SlotStatus = "idle" | "uploading" | "done" | "error";

interface Slot {
  file: File | null;
  status: SlotStatus;
  message?: string;
}

const ASSET_ORDER: AssetType[] = ["image", "instagram-image", "html-zip"];

const ASSET_META: Record<
  AssetType,
  { title: string; hint: string; accept: string; icon: typeof ImageIcon }
> = {
  image: {
    title: "Cover image",
    hint: "JPEG, PNG, GIF, WebP or HEIC",
    accept: "image/*",
    icon: ImageIcon,
  },
  "instagram-image": {
    title: "Instagram image",
    hint: "Square works best",
    accept: "image/*",
    icon: Instagram,
  },
  "html-zip": {
    title: "Article content",
    hint: "A .zip containing your HTML and its images",
    accept: ".zip,application/zip",
    icon: FileArchive,
  },
};

const EMPTY_SLOTS: Record<AssetType, Slot> = {
  image: { file: null, status: "idle" },
  "instagram-image": { file: null, status: "idle" },
  "html-zip": { file: null, status: "idle" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PublicUploadPage() {
  const { toast } = useToast();
  const [selectedArticleId, setSelectedArticleId] = useState<string>("");
  const [slots, setSlots] = useState<Record<AssetType, Slot>>(EMPTY_SLOTS);
  const [isUploading, setIsUploading] = useState(false);

  const { data: status, isLoading: loadingStatus } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/public/article-upload-status"],
    retry: false,
  });

  const { data: articles, isLoading: loadingArticles } = useQuery<UploadableArticle[]>({
    queryKey: ["/api/articles/uploadable"],
    enabled: Boolean(status?.enabled),
    retry: false,
  });

  const selectedArticle = articles?.find((a) => a.id.toString() === selectedArticleId);
  const attached = ASSET_ORDER.filter((type) => slots[type].file);

  const setSlot = (type: AssetType, next: Partial<Slot>) =>
    setSlots((current) => ({ ...current, [type]: { ...current[type], ...next } }));

  const chooseFile = (type: AssetType, file: File | null) =>
    setSlot(type, { file, status: "idle", message: undefined });

  /** Uploads each attached file, one request per asset, reporting per slot. */
  const submit = async () => {
    if (!selectedArticleId) {
      toast({
        title: "Pick your article",
        description: "Choose which article you're submitting for.",
        variant: "destructive",
      });
      return;
    }

    const pending = attached.filter((type) => slots[type].status !== "done");
    if (!pending.length) return;

    setIsUploading(true);

    for (const type of pending) {
      const file = slots[type].file;
      if (!file) continue;

      setSlot(type, { status: "uploading", message: undefined });

      try {
        const body = new FormData();
        body.append("file", file);
        body.append("articleId", selectedArticleId);

        const response = await fetch(`/api/public-upload/${type}`, {
          method: "POST",
          body,
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.message || "Upload failed");

        setSlot(type, { status: "done", message: payload?.message });
      } catch (error) {
        setSlot(type, {
          status: "error",
          message: error instanceof Error ? error.message : "Upload failed",
        });
      }
    }

    setIsUploading(false);
  };

  // Everything landed, and at least one file was sent.
  const allDone =
    attached.length > 0 && attached.every((type) => slots[type].status === "done");

  if (loadingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-white to-purple-50">
        <Loader2 className="h-8 w-8 animate-spin text-pink-600" />
      </div>
    );
  }

  if (!status?.enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-white to-purple-50 p-4">
        <Card className="max-w-md w-full text-center p-8 bg-white/90 backdrop-blur-sm border-0 shadow-xl rounded-3xl">
          <div className="mx-auto h-16 w-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Submissions closed</h1>
          <p className="text-gray-600">
            Article uploads are currently disabled. Please contact your editor if you believe
            this is an error.
          </p>
        </Card>
      </div>
    );
  }

  if (allDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-white to-purple-50 p-4">
        <Card className="max-w-md w-full bg-white/90 backdrop-blur-sm border-0 shadow-2xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-600 text-white pb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="p-4 bg-white/20 rounded-full">
                <CheckCircle className="h-12 w-12" />
              </div>
            </div>
            <CardTitle className="text-2xl text-center font-bold">Thank you!</CardTitle>
            <CardDescription className="text-green-100 text-center text-lg">
              Your files for “{selectedArticle?.title}” have been submitted.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8 text-center">
            <p className="text-gray-600 text-sm mb-6">
              Your editor will review them before anything goes live.
            </p>
            <Button
              onClick={() => {
                setSlots(EMPTY_SLOTS);
                setSelectedArticleId("");
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-12 px-8"
            >
              Submit for another article
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 flex flex-col">
      <header className="bg-white/80 backdrop-blur-md shadow-lg py-8 px-4 border-b border-pink-200/50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-to-b from-pink-300 to-pink-600 rounded-2xl shadow-lg">
              <Upload className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 text-center mb-2">Submit your article</h1>
          <p className="text-gray-600 text-center text-lg">
            Choose your article, attach your files, and send them in.
          </p>
        </div>
      </header>

      <main className="flex-1 py-12">
        <div className="max-w-2xl mx-auto px-4 space-y-6">
          <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl rounded-3xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-pink-400 to-pink-600 text-white pb-6">
              <CardTitle className="text-xl font-bold">Select your article</CardTitle>
              <CardDescription className="text-pink-100">
                Only articles still open for submissions are listed.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <Select
                value={selectedArticleId}
                onValueChange={setSelectedArticleId}
                disabled={loadingArticles}
              >
                <SelectTrigger className="h-12 text-lg border-2 border-gray-200 hover:border-pink-300 transition-colors rounded-xl bg-white">
                  <SelectValue
                    placeholder={loadingArticles ? "Loading articles..." : "Choose an article..."}
                  />
                </SelectTrigger>
                <SelectContent>
                  {articles?.map((article) => (
                    <SelectItem
                      key={article.id}
                      value={article.id.toString()}
                      className="text-lg py-3 cursor-pointer"
                    >
                      {article.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {articles && articles.length === 0 && (
                <p className="mt-3 text-sm text-gray-500">
                  There are no articles open for submissions right now.
                </p>
              )}
            </CardContent>
          </Card>

          {selectedArticleId && (
            <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl rounded-3xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
              <CardHeader className="bg-gradient-to-r from-pink-400 to-pink-600 text-white pb-6">
                <CardTitle className="text-xl font-bold">Attach your files</CardTitle>
                <CardDescription className="text-pink-100">
                  Send whichever you have — you don't need all three.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {ASSET_ORDER.map((type) => {
                  const meta = ASSET_META[type];
                  const slot = slots[type];
                  const Icon = meta.icon;
                  const inputId = `file-${type}`;

                  return (
                    <div
                      key={type}
                      className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50/80 p-4"
                    >
                      <Icon className="h-6 w-6 shrink-0 text-pink-500" />

                      <div className="min-w-0 flex-1">
                        <Label className="text-base font-medium text-gray-800">{meta.title}</Label>
                        <p className="truncate text-xs text-gray-500">
                          {slot.file ? `${slot.file.name} · ${formatBytes(slot.file.size)}` : meta.hint}
                        </p>
                        {slot.message && (
                          <p
                            className={`mt-1 text-xs ${
                              slot.status === "error" ? "text-red-600" : "text-emerald-600"
                            }`}
                          >
                            {slot.message}
                          </p>
                        )}
                      </div>

                      {slot.status === "uploading" && (
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                      )}
                      {slot.status === "done" && (
                        <CheckCircle className="h-5 w-5 text-emerald-600" />
                      )}

                      <input
                        id={inputId}
                        type="file"
                        className="hidden"
                        accept={meta.accept}
                        onChange={(event) => {
                          chooseFile(type, event.target.files?.[0] ?? null);
                          // Reset so re-selecting the same file still fires onChange.
                          event.target.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isUploading || slot.status === "done"}
                        onClick={() => document.getElementById(inputId)?.click()}
                        className="border-pink-200 text-pink-700 hover:bg-pink-50 hover:text-pink-800 rounded-xl shrink-0"
                      >
                        {slot.file ? "Change" : "Choose"}
                      </Button>
                    </div>
                  );
                })}

                <Button
                  onClick={submit}
                  disabled={isUploading || attached.length === 0}
                  className="w-full h-14 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-semibold text-lg rounded-2xl shadow-lg hover:shadow-xl transition-all"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="mr-3 h-5 w-5" />
                      {attached.length === 0
                        ? "Attach a file to continue"
                        : `Submit ${attached.length} file${attached.length === 1 ? "" : "s"}`}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <footer className="bg-white/80 backdrop-blur-md border-t border-pink-200/50 py-6 text-center text-gray-500">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <p className="text-sm font-medium">Secure Submission Portal</p>
          </div>
          <p className="text-xs">Uploads are logged and monitored. Abuse will result in access revocation.</p>
        </div>
      </footer>
    </div>
  );
}
