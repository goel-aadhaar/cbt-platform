import { apiFetch } from "./api";
import { getToken } from "./auth";

/**
 * Study material shared with a batch (§2.12).
 *
 * There is no `batchId` filter on the read calls, and that is deliberate: the
 * server decides what each caller may see from their own session — a student
 * gets their batch, a teacher gets the batches they teach, an admin gets the
 * institute. A client-supplied batch filter would look like the same thing and
 * would be a way to ask for someone else's shelf.
 */

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
  mediaKey: string;
  createdAt: string;
  subject: { id: string; name: string };
  batch: { id: string; name: string };
  createdBy: { id: string; name: string };
  /** Null if the underlying file has been removed from the library. */
  file: ResourceFile | null;
}

export interface ResourceShelf {
  id: string;
  name: string;
  count: number;
}

const auth = () => ({ token: getToken() ?? undefined });

/** GET /resources — everything the caller may see, newest first. */
export function listResources(subjectId?: string): Promise<ResourceItem[]> {
  const qs = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
  return apiFetch<ResourceItem[]>(`/resources${qs}`, auth());
}

/** GET /resources/shelves — subjects that actually hold something. */
export function listShelves(): Promise<ResourceShelf[]> {
  return apiFetch<ResourceShelf[]>("/resources/shelves", auth());
}

export function createResource(body: {
  title: string;
  description?: string;
  subjectId: string;
  batchId: string;
  mediaKey: string;
}): Promise<ResourceItem> {
  return apiFetch("/resources", { method: "POST", body, ...auth() });
}

/** DELETE /resources/:id — unshares it; the file stays in the library. */
export function removeResource(id: string): Promise<{ removed: string }> {
  return apiFetch(`/resources/${id}`, { method: "DELETE", ...auth() });
}
