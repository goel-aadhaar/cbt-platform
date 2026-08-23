"use client";

import { useEffect, useRef, useState } from "react";

import { ActionButton } from "@/components/action-button";
import { AuthedImage } from "@/components/authed-image";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ApiError } from "@/lib/api";
import {
  deleteMedia,
  formatBytes,
  listMedia,
  uploadMedia,
  type MediaItem,
} from "@/lib/media";

/**
 * Attach images to a question (§2.7).
 *
 * Reports the SELECTED KEYS back — questions reference media by key, never by
 * URL, so moving the bucket or putting a CDN in front never invalidates a
 * question.
 *
 * ## What this shows by default, and why it changed
 *
 * It used to open straight onto the institute's entire image library. That is
 * a shared pool, so the diagram uploaded for one question appeared in the
 * editor of every other question — attached ones ringed and ticked, the rest
 * merely available. Read quickly, and read by someone who has just uploaded a
 * figure, that is indistinguishable from the image having been attached
 * everywhere, and it was reported as exactly that.
 *
 * So the default view is now only what is on THIS question, which is almost
 * always nothing or one figure. Reuse is still supported — a diagram genuinely
 * does get shared between parts of the same problem — but it is now something
 * you ask for by opening the library, rather than the first thing you see.
 *
 * Library items can also be permanently deleted from here, inside the library
 * view where that belongs. The backend refuses (409) while a question still
 * has the image attached; re-sending with confirm asks it to delete anyway.
 */
export function MediaPicker({
  selected,
  onChange,
  disabled = false,
}: {
  /** Currently attached media keys. */
  selected: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [storage, setStorage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * The attached images, in the order the question carries them.
   *
   * Resolved against the library where possible, so the real filename and alt
   * text are available for the tooltip. A key with no library row still
   * renders: the bytes are addressed by key, and showing a broken thumbnail is
   * more honest than silently dropping an image the question claims to have.
   */
  const attached = selected.map(
    (key) =>
      (items ?? []).find((m) => m.key === key) ?? {
        id: key,
        key,
        url: `/media/file/${encodeURIComponent(key)}`,
        fileName: key.split("/").pop() ?? key,
        size: 0,
        altText: null,
      },
  );

  useEffect(() => {
    let cancelled = false;
    listMedia()
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setStorage(res.storage);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load the library");
        setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const created = await uploadMedia(file);
      setItems((prev) => [created, ...(prev ?? [])]);
      // Attach it straight away — uploading from here means you want it.
      onChange([...selected, created.key]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(item: MediaItem, confirm: boolean) {
    setDeletingId(item.id);
    setError(null);
    try {
      await deleteMedia(item.id, confirm);
      setItems((prev) => (prev ?? []).filter((m) => m.id !== item.id));
      onChange(selected.filter((k) => k !== item.key));
      setConfirmDeleteId(null);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        setConfirmDeleteId(item.id);
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "Could not delete the image");
      }
    } finally {
      setDeletingId(null);
    }
  }

  function toggle(key: string) {
    onChange(
      selected.includes(key)
        ? selected.filter((k) => k !== key)
        : [...selected, key],
    );
  }

  return (
    // Named as a group so the upload control, this question's images and the
    // library read as one region rather than three loose controls in the form.
    <div role="group" aria-label="Images and diagrams">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase text-admin-muted">
          Images &amp; diagrams
        </span>
        <span className="text-xs text-admin-muted">
          {selected.length === 0
            ? "No image on this question"
            : `${selected.length} attached`}
          {storage === "local-filesystem" && (
            <span
              className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700"
              title="Files are on the API's own disk and will not survive a redeploy. Set AWS_S3_BUCKET for durable storage."
            >
              local storage
            </span>
          )}
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          <p>{error}</p>
          {confirmDeleteId && (
            <div className="mt-2 flex gap-3">
              <ActionButton
                loading={deletingId === confirmDeleteId}
                loadingText="Deleting…"
                onClick={() => {
                  const item = (items ?? []).find(
                    (m) => m.id === confirmDeleteId,
                  );
                  if (item) void handleDelete(item, true);
                }}
                className="flex items-center gap-1.5 font-bold uppercase text-red-700 hover:underline disabled:no-underline disabled:opacity-70"
              >
                Delete anyway
              </ActionButton>
              <button
                type="button"
                // Nothing to cancel once the delete is under way, and leaving
                // it live invites a click that cannot take effect.
                disabled={deletingId === confirmDeleteId}
                onClick={() => {
                  setConfirmDeleteId(null);
                  setError(null);
                }}
                className="font-semibold text-admin-muted hover:text-admin-ink disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          disabled={disabled || uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
          }}
          className="block w-full text-xs text-admin-muted file:mr-3 file:rounded-lg file:border file:border-admin-line file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-admin-ink hover:file:bg-admin-bg disabled:opacity-50"
        />
        {uploading && (
          <span className="shrink-0 text-xs font-semibold text-admin">
            Uploading…
          </span>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setLibraryOpen((o) => !o)}
          aria-expanded={libraryOpen}
          className="shrink-0 rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
        >
          {libraryOpen ? "Hide library" : "Choose from library"}
        </button>
      </div>

      {/* This question's own images. */}
      {attached.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {attached.map((m) => (
            <div key={m.key} className="group relative size-24">
              <AuthedImage
                url={m.url}
                alt={m.altText ?? m.fileName}
                className="size-full rounded-lg border-2 border-admin object-cover"
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggle(m.key)}
                aria-label={`Remove ${m.fileName} from this question`}
                title="Remove from this question"
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-admin-ink text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {!libraryOpen ? null : items === null ? (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-lg bg-admin-line/20"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-admin-line p-4 text-center text-xs text-admin-muted">
          Nothing in the library yet. Upload a file above to attach it to this
          question.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {items.map((m) => {
            const on = selected.includes(m.key);
            const busy = deletingId === m.id;
            return (
              <div key={m.id} className="group relative aspect-square">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(m.key)}
                  title={`${m.fileName} · ${formatBytes(m.size)}${m.altText ? ` · ${m.altText}` : ""}`}
                  aria-pressed={on}
                  className={`size-full overflow-hidden rounded-lg border-2 transition-colors ${
                    on
                      ? "border-admin ring-2 ring-admin/30"
                      : "border-admin-line hover:border-admin/50"
                  } disabled:opacity-50`}
                >
                  <AuthedImage
                    url={m.url}
                    alt={m.altText ?? m.fileName}
                    className="size-full object-cover"
                  />
                  {on && (
                    <span className="absolute right-1 top-1 rounded-full bg-admin px-1.5 py-0.5 text-[10px] font-bold text-white">
                      ✓
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => void handleDelete(m, false)}
                  aria-label={`Delete ${m.fileName}`}
                  title="Delete from the library"
                  className="absolute bottom-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white opacity-0 transition-opacity hover:bg-red-600 focus:opacity-100 disabled:opacity-50 group-hover:opacity-100"
                >
                  {busy ? (
                    <LoadingSpinner size={12} tone="current" label="Deleting" />
                  ) : (
                    "×"
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
