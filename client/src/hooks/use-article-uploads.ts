import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiUpload } from "@/lib/queryClient";
import type { MutationCallbacks } from "@/hooks/use-article-mutations";

/** Airtable attachment fields an image can be routed to. */
export type AirtableImageField = "MainImage" | "instaPhoto";

/** Asset kinds accepted by `/api/articles/:id/assets/:assetType`. */
export type ArticleAssetType = "image" | "instagram-image" | "html-zip";

export interface ImageUploadVariables {
  articleId: number;
  file: File;
  field: AirtableImageField;
}

/**
 * The image endpoints answer with whatever the backend that handled the file
 * produced, so nothing here is guaranteed to be present.
 */
export interface ImageUploadResponse {
  imgbb?: unknown;
  imgbbUrl?: unknown;
  imgbbLink?: unknown;
  airtable?: unknown;
  attachment?: unknown;
  link?: unknown;
  [key: string]: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNestedUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.url === "string") return record.url;
  if (typeof record.link === "string") return record.link;
  return null;
}

/**
 * Pulls the uploaded image URL out of a response. The known shapes are tried in
 * priority order, then any remaining http string or `{url|link}` object, because
 * ImgBB, Airtable and the local uploader each answer differently.
 */
export function extractUploadedImageUrl(data: ImageUploadResponse | null | undefined): string | null {
  if (!data || typeof data !== "object") return null;

  const known =
    asNestedUrl(data.imgbb) ??
    asString(data.imgbbUrl) ??
    asString(data.imgbbLink) ??
    asNestedUrl(data.airtable) ??
    asNestedUrl(data.attachment) ??
    asString(data.link);
  if (known) return known;

  for (const value of Object.values(data)) {
    if (typeof value === "string" && value.startsWith("http")) return value;
    const nested = asNestedUrl(value);
    if (nested) return nested;
  }

  return null;
}

async function uploadImage(url: string, file: File): Promise<ImageUploadResponse> {
  const body = new FormData();
  body.append("image", file);
  const response = await apiUpload(url, body);
  return (await response.json()) as ImageUploadResponse;
}

/** Uploads through ImgBB, which then writes the resulting URL into Airtable. */
export function useImgbbImageUpload(
  callbacks?: MutationCallbacks<ImageUploadResponse, ImageUploadVariables>,
) {
  return useMutation<ImageUploadResponse, Error, ImageUploadVariables>({
    mutationFn: ({ articleId, file, field }) =>
      uploadImage(`/api/imgbb/upload-to-airtable/${articleId}/${field}`, file),
    onSuccess: callbacks?.onSuccess,
    onError: callbacks?.onError,
    onMutate: callbacks?.onMutate,
  });
}

/** Uploads the file straight into the Airtable attachment field. */
export function useAirtableImageUpload(
  callbacks?: MutationCallbacks<ImageUploadResponse, ImageUploadVariables>,
) {
  return useMutation<ImageUploadResponse, Error, ImageUploadVariables>({
    mutationFn: ({ articleId, file, field }) =>
      uploadImage(`/api/airtable/upload-image/${articleId}/${field}`, file),
    onSuccess: callbacks?.onSuccess,
    onError: callbacks?.onError,
    onMutate: callbacks?.onMutate,
  });
}

export interface AssetUploadVariables {
  articleId: number;
  type: ArticleAssetType;
  file: File;
}

export interface AssetUploadResponse {
  message?: string;
  imageUrl?: string;
  html?: string;
}

/**
 * Editor-side twin of the contributor upload page: same asset endpoint, but on
 * the authenticated route. The body may be empty or non-JSON, so parsing is
 * tolerant.
 */
export function useArticleAssetUpload(
  callbacks?: MutationCallbacks<AssetUploadResponse, AssetUploadVariables>,
) {
  return useMutation<AssetUploadResponse, Error, AssetUploadVariables>({
    mutationFn: async ({ articleId, type, file }) => {
      const body = new FormData();
      body.append("file", file);

      const response = await apiUpload(`/api/articles/${articleId}/assets/${type}`, body);
      const text = await response.text();
      if (!text) return {};
      try {
        return JSON.parse(text) as AssetUploadResponse;
      } catch {
        return {};
      }
    },
    onSuccess: callbacks?.onSuccess,
    onError: callbacks?.onError,
    onMutate: callbacks?.onMutate,
  });
}

/**
 * Whether images should be routed through ImgBB. Only fetched while `active` so
 * a closed dialog does not poll.
 *
 * Asks whether the key is configured rather than reading a settings record: the
 * key lives in the server's `IMGBB_API_KEY` and is never sent to the browser.
 * `/api/imgbb/status` is used rather than `/api/integration-status` because the
 * latter runs live probes against third parties — a slow one would leave this
 * `false` long enough for an upload to take the direct-to-Airtable path.
 */
export function useImgbbEnabled(active: boolean): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    fetch("/api/imgbb/status", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((status: { configured?: boolean } | null) => {
        if (cancelled) return;
        setEnabled(Boolean(status?.configured));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  return enabled;
}
