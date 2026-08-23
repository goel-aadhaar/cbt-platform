"use client";

import { useRef, useState } from "react";

import { formatBytes, uploadMedia, type MediaItem } from "@/lib/media";

import { DownloadIcon, UploadIcon, XIcon } from "./icons";

/**
 * Attach files to a notice (§2.12).
 *
 * Deliberately not the question `MediaPicker`. That one opens on a shared
 * library because a diagram is often reused across questions; a notice
 * attachment almost never is — a timetable belongs to one notice — so offering
 * a library here would be the same "everything appears under everything"
 * confusion the question picker was just fixed for. Files are uploaded for this
 * notice and listed only here.
 *
 * Uploads go up as `DOCUMENT`, which is a different allow-list and a larger cap
 * than a question diagram gets: these are downloaded, not rendered.
 */
export function AttachmentPicker({
  selected,
  onChange,
  disabled = false,
}: {
  /** Media keys already attached. */
  selected: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  /**
   * Details for the files uploaded in this session.
   *
   * Keys alone would leave an editor showing a row of UUIDs for anything
   * attached before the page loaded, so what is known is shown and the rest
   * falls back to the key's own filename.
   */
  const [known, setKnown] = useState<Record<string, MediaItem>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const created = await uploadMedia(file, undefined, "DOCUMENT");
      setKnown((prev) => ({ ...prev, [created.key]: created }));
      onChange([...selected, created.key]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase text-admin-muted">
          Attachments
        </span>
        <span className="text-xs text-admin-muted">
          {selected.length === 0
            ? "None attached"
            : `${selected.length} file(s)`}
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
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg"
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

      {selected.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {selected.map((key) => {
            const item = known[key];
            return (
              <li
                key={key}
                className="flex items-center gap-2 rounded-lg border border-admin-line/60 bg-white px-3 py-2"
              >
                <UploadIcon className="size-4 shrink-0 text-admin-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-admin-ink">
                    {item?.fileName ?? key.split("/").pop() ?? key}
                  </span>
                  {item && (
                    <span className="block text-xs text-admin-subtle">
                      {formatBytes(item.size)}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(selected.filter((k) => k !== key))}
                  aria-label={`Remove ${item?.fileName ?? "attachment"}`}
                  title="Remove from this notice"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-admin-muted hover:bg-admin-bg hover:text-danger disabled:opacity-50"
                >
                  <XIcon className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-2 flex items-start gap-1.5 text-xs text-admin-subtle">
        <DownloadIcon className="mt-0.5 size-3 shrink-0" />
        Students can download these once the notice is published. PDF, Word,
        Excel, PowerPoint, TXT, CSV or an image, up to 25 MB each.
      </p>
    </div>
  );
}
