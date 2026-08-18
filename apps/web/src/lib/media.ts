/**
 * Media client (§2.7) — mirrors `apps/api/src/modules/media`.
 *
 * Questions reference media BY KEY. The API returns a ready-to-use `url` per
 * item: a CDN/S3 URL when a bucket is configured, otherwise its own streaming
 * route. Callers should use `url` and never build one from the key themselves.
 */

import { apiFetch, ApiError } from "./api";
import { getToken } from "./auth";

export interface MediaItem {
  id: string;
  key: string;
  fileName: string;
  mimeType: string;
  size: number;
  altText: string | null;
  createdAt: string;
  uploadedBy: { name: string };
  /** Absolute (CDN) or API-relative — see `mediaSrc`. */
  url: string;
}

function token(): string {
  const t = getToken();
  if (!t) throw new ApiError(401, { message: "Not authenticated" });
  return t;
}

const apiBase = () =>
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

/**
 * Resolve a media `url` into something an <img> can load.
 *
 * The API returns a relative path when it streams the bytes itself; that has to
 * be joined onto the API origin, not the web app's.
 */
export function mediaSrc(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${apiBase()}${url}`;
}

/** GET /media — the tenant's image library. */
export function listMedia(): Promise<{
  items: MediaItem[];
  storage: string;
}> {
  return apiFetch("/media", { token: token() });
}

/**
 * POST /media — multipart upload.
 *
 * Uses fetch directly: apiFetch JSON-encodes its body, and a FormData upload
 * must not have Content-Type set manually (the boundary is generated).
 */
export async function uploadMedia(
  file: File,
  altText?: string,
): Promise<MediaItem> {
  const form = new FormData();
  form.append("file", file);
  if (altText) form.append("altText", altText);

  const res = await fetch(`${apiBase()}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}` },
    body: form,
  });

  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      const m = body.message;
      if (Array.isArray(m)) message = m.join(". ");
      else if (typeof m === "string" && m.trim()) message = m;
    } catch {
      /* keep the status-based message */
    }
    throw new Error(message);
  }
  return (await res.json()) as MediaItem;
}

/**
 * DELETE /media/:id — permanently removes the library item. Refused with a
 * 409 (ApiError with a human-readable message) while a question still has it
 * attached, unless `confirm` is set.
 */
export function deleteMedia(
  id: string,
  confirm = false,
): Promise<{ deleted: boolean }> {
  return apiFetch(`/media/${id}${confirm ? "?confirm=true" : ""}`, {
    method: "DELETE",
    token: token(),
  });
}

/** Human-readable file size for the library listing. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
