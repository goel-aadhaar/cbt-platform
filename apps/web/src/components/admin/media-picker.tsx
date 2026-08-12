"use client";

import { useEffect, useRef, useState } from "react";

import {
  formatBytes,
  listMedia,
  mediaSrc,
  uploadMedia,
  type MediaItem,
} from "@/lib/media";

/**
 * Attach images to a question (§2.7).
 *
 * Shows the tenant's library and an upload control, and reports the SELECTED
 * KEYS back — questions reference media by key, never by URL, so moving the
 * bucket or putting a CDN in front never invalidates a question.
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
  const fileRef = useRef<HTMLInputElement>(null);

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

  function toggle(key: string) {
    onChange(
      selected.includes(key)
        ? selected.filter((k) => k !== key)
        : [...selected, key],
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase text-admin-muted">
          Images &amp; diagrams
        </span>
        <span className="text-xs text-admin-muted">
          {selected.length} attached
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
        <p
          role="alert"
          className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
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
      </div>

      {items === null ? (
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
          No images yet. Upload one to attach it to this question.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {items.map((m) => {
            const on = selected.includes(m.key);
            return (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                onClick={() => toggle(m.key)}
                title={`${m.fileName} · ${formatBytes(m.size)}${m.altText ? ` · ${m.altText}` : ""}`}
                aria-pressed={on}
                className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                  on
                    ? "border-admin ring-2 ring-admin/30"
                    : "border-admin-line hover:border-admin/50"
                } disabled:opacity-50`}
              >
                {/* Library thumbnails are tenant images of unknown dimensions;
                    a plain img keeps this simple and avoids remote-loader config. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaSrc(m.url)}
                  alt={m.altText ?? m.fileName}
                  className="size-full object-cover"
                />
                {on && (
                  <span className="absolute right-1 top-1 rounded-full bg-admin px-1.5 py-0.5 text-[10px] font-bold text-white">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
