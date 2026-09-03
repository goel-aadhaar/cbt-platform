import { apiFetch } from "./api";
import { getToken } from "./auth";

/**
 * Study material, filed Subject > Chapter > Resource (§2.12).
 *
 * There is no `batchId` filter on the read calls, and that is deliberate: the
 * server decides what each caller may see from their own session — a student
 * gets their batch, a teacher gets the batches they teach, an admin gets the
 * institute. A client-supplied batch filter would look like the same thing and
 * would be a way to ask for someone else's shelf.
 *
 * Counts come from the server too, for the same reason and one more: counting
 * on the client would mean downloading the library to render "42 resources".
 */

export type ResourceType = "FILE" | "YOUTUBE";

export interface ResourceFile {
  key: string;
  fileName: string;
  size: number;
  mimeType: string;
}

export interface ResourceItem {
  id: string;
  title: string;
  description: string | null;
  type: ResourceType;
  mediaKey: string | null;
  /** The video id alone — the player is built from it, never from a URL. */
  youtubeVideoId: string | null;
  createdAt: string;
  subject: { id: string; name: string };
  /** Null for material filed before chapters existed. */
  chapter: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  /** Every batch it was shared with. */
  batches: { id: string; name: string }[];
  /** Null for a video, or if the underlying file has left the library. */
  file: ResourceFile | null;
}

/** A subject shelf, with counts of what is actually on it. */
export interface ResourceSubject {
  id: string;
  name: string;
  chapterCount: number;
  resourceCount: number;
}

/** A chapter within a shelf. `id` is null for the legacy "Unfiled" bucket. */
export interface ResourceChapter {
  id: string | null;
  name: string;
  resourceCount: number;
}

export interface ResourceQuery {
  subjectId?: string;
  chapterId?: string;
  type?: ResourceType;
  /** Free text over title, description, subject and chapter, matched server-side. */
  q?: string;
}

const auth = () => ({ token: getToken() ?? undefined });

/** GET /resources — everything the caller may see, newest first. */
export function listResources(
  query: ResourceQuery = {},
): Promise<ResourceItem[]> {
  const qs = new URLSearchParams();
  if (query.subjectId) qs.set("subjectId", query.subjectId);
  if (query.chapterId) qs.set("chapterId", query.chapterId);
  if (query.type) qs.set("type", query.type);
  if (query.q?.trim()) qs.set("q", query.q.trim());
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiFetch<ResourceItem[]>(`/resources${suffix}`, auth());
}

/** GET /resources/subjects — shelves that hold something, with counts. */
export function listResourceSubjects(): Promise<ResourceSubject[]> {
  return apiFetch<ResourceSubject[]>("/resources/subjects", auth());
}

/** GET /resources/subjects/:id/chapters — chapters holding material. */
export function listResourceChapters(
  subjectId: string,
): Promise<ResourceChapter[]> {
  return apiFetch<ResourceChapter[]>(
    `/resources/subjects/${subjectId}/chapters`,
    auth(),
  );
}

export interface CreateResourceInput {
  title: string;
  description?: string;
  type: ResourceType;
  subjectId: string;
  chapterId: string;
  batchIds: string[];
  /** For a FILE — the key returned by the media upload. */
  mediaKey?: string;
  /** For a YOUTUBE resource — any supported URL; normalised server-side. */
  youtubeUrl?: string;
}

export function createResource(
  body: CreateResourceInput,
): Promise<ResourceItem> {
  return apiFetch("/resources", { method: "POST", body, ...auth() });
}

export interface UpdateResourceInput {
  title?: string;
  description?: string;
  subjectId?: string;
  chapterId?: string;
  /** Omit to leave sharing alone; a list replaces it outright. */
  batchIds?: string[];
  mediaKey?: string;
  youtubeUrl?: string;
}

export function updateResource(
  id: string,
  body: UpdateResourceInput,
): Promise<ResourceItem> {
  return apiFetch(`/resources/${id}`, { method: "PATCH", body, ...auth() });
}

/** DELETE /resources/:id — unshares it; the file stays in the library. */
export function removeResource(id: string): Promise<{ removed: string }> {
  return apiFetch(`/resources/${id}`, { method: "DELETE", ...auth() });
}

/* ----------------------------- YouTube ----------------------------- */

/**
 * Built from the stored video id, never from anything a teacher typed — the
 * server only ever hands back an id, so there is no URL to trust here.
 */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** hqdefault exists for every video; maxresdefault 404s on older uploads. */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Mirrors the server's parser closely enough to preview a link before it is
 * submitted. The SERVER is the authority — this only decides whether to show a
 * thumbnail yet, so being slightly stricter here costs nothing.
 */
export function parseYoutubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  const ok = [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "www.youtu.be",
  ].includes(host);
  if (!ok) return null;

  const path = url.pathname.replace(/\/+$/, "");
  const valid = (v: string) => (/^[A-Za-z0-9_-]{11}$/.test(v) ? v : null);

  if (host.endsWith("youtu.be")) return valid(path.slice(1));
  if (path === "/watch") return valid(url.searchParams.get("v") ?? "");
  const seg = path.match(/^\/(?:shorts|embed|live|v)\/([^/]+)$/);
  return seg ? valid(seg[1]) : null;
}
