"use client";

import { useEffect, useState } from "react";

import { XIcon } from "@/components/admin/icons";
import { downloadAttachment, formatBytes } from "@/lib/media";
import {
  youtubeEmbedUrl,
  youtubeWatchUrl,
  type ResourceItem,
} from "@/lib/resources";

/**
 * The pieces both portals render: a compact row per resource, and the preview
 * that opens from it.
 *
 * Shared rather than written twice — the teacher and student views show the
 * same object and differ only in which actions they offer, which arrives as
 * children. Two copies would drift the moment either was restyled.
 */

/** A file/video badge. Text, not colour alone — colour is not a label. */
export function TypeBadge({ item }: { item: ResourceItem }) {
  const isVideo = item.type === "YOUTUBE";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
        isVideo ? "bg-danger/10 text-danger" : "bg-admin/10 text-admin"
      }`}
    >
      {isVideo ? "Video" : fileLabel(item)}
    </span>
  );
}

function fileLabel(item: ResourceItem): string {
  const name = item.file?.fileName ?? "";
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  return (ext || "file").slice(0, 4).toUpperCase();
}

/**
 * One resource, as a dense row.
 *
 * A row rather than a card on purpose: a chapter can hold dozens of these, and
 * a grid of large cards turns "find the notes" into scrolling.
 */
export function ResourceRow({
  item,
  onOpen,
  actions,
}: {
  item: ResourceItem;
  onOpen: () => void;
  /** Teacher-only controls; students pass nothing. */
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-admin-line/40 px-4 py-3 last:border-0 hover:bg-admin-bg/50">
      <TypeBadge item={item} />
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-sm font-semibold text-admin-ink">
          {item.title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-admin-muted">
          {item.chapter?.name ?? "Unfiled"} · {item.createdBy.name} ·{" "}
          {new Date(item.createdAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })}
          {item.file ? ` · ${formatBytes(item.file.size)}` : ""}
        </span>
      </button>
      {/* Names the action rather than leaving the row silently clickable.
          aria-hidden because the row's own button is already the control —
          a screen reader should hear the title once, not a stray "Watch". */}
      <span
        aria-hidden
        className="hidden shrink-0 text-xs font-semibold text-admin sm:block"
      >
        {item.type === "YOUTUBE" ? "Watch →" : "Open →"}
      </span>
      {actions}
    </div>
  );
}

/**
 * Preview.
 *
 * A video is embedded from its stored id — never from a URL the teacher typed,
 * which is what makes an injected embed impossible rather than merely unlikely.
 * A file is downloaded through the authenticated media route, because
 * `GET /media/file/:key` needs an Authorization header an <a download> cannot
 * send.
 */
export function ResourcePreview({
  item,
  onClose,
}: {
  item: ResourceItem | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-auto rounded-2xl bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-admin-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-admin-ink">
              {item.title}
            </h2>
            <p className="mt-0.5 text-xs text-admin-muted">
              {item.subject.name} · {item.chapter?.name ?? "Unfiled"} · shared
              by {item.createdBy.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-admin-muted hover:bg-admin-bg"
          >
            <XIcon className="size-5" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          {item.type === "YOUTUBE" && item.youtubeVideoId ? (
            <>
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                <iframe
                  src={youtubeEmbedUrl(item.youtubeVideoId)}
                  title={item.title}
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="size-full"
                />
              </div>
              <a
                href={youtubeWatchUrl(item.youtubeVideoId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm font-semibold text-admin hover:underline"
              >
                Open on YouTube ↗
              </a>
            </>
          ) : item.file ? (
            <div className="rounded-xl border border-admin-line p-4">
              <p className="text-sm font-semibold text-admin-ink">
                {item.file.fileName}
              </p>
              <p className="mt-0.5 text-xs text-admin-muted">
                {item.file.mimeType} · {formatBytes(item.file.size)}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setFailed(null);
                  downloadAttachment(item.mediaKey!)
                    .catch((e: unknown) =>
                      setFailed(
                        e instanceof Error ? e.message : "Download failed",
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
                className="mt-3 rounded-lg bg-admin px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Opening…" : "Download / open"}
              </button>
              {failed && (
                <p role="alert" className="mt-2 text-sm text-danger">
                  {failed}
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-admin-line p-6 text-center text-sm text-admin-muted">
              The file for this resource is no longer in the library.
            </p>
          )}

          {item.description && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-admin-ink">
              {item.description}
            </p>
          )}

          {item.batches.length > 0 && (
            <p className="text-xs text-admin-muted">
              Shared with {item.batches.map((b) => b.name).join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
