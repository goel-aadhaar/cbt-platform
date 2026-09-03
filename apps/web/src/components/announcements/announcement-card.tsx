"use client";

import { useState } from "react";

import { DownloadIcon, StarIcon } from "@/components/student/icons";
import { downloadAttachment } from "@/lib/media";
import { CATEGORY_LOOK, type StudentAnnouncement } from "@/lib/announcements";

/**
 * One notice, as rendered in BOTH the candidate and teacher feeds (§2.9).
 *
 * Shared rather than copied: the two feeds show the same object and gained a
 * second reader only when teachers became recipients. A second copy would
 * drift the first time either was styled.
 *
 * The icons come from the student icon set because they are plain SVGs with
 * no portal-specific styling, not because this is student-only.
 */
export function AnnouncementCard({ item }: { item: StudentAnnouncement }) {
  const look = CATEGORY_LOOK[item.category] ?? CATEGORY_LOOK.GENERAL;
  return (
    <article
      className={`rounded-2xl border bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)] ${
        item.pinned ? "border-admin/40" : "border-admin-line/40"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {item.pinned && (
          <span className="inline-flex items-center gap-1 rounded-full bg-admin/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-admin">
            <StarIcon className="size-3" />
            Pinned
          </span>
        )}
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${look.className}`}
        >
          {look.label}
        </span>
        <span className="ml-auto text-xs text-admin-muted">
          {new Date(item.publishedAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>

      <h2 className="mt-3 text-lg font-bold text-admin-ink">{item.title}</h2>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-admin-ink">
        {item.body}
      </p>
      {item.attachmentKeys.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-admin-line/50 pt-3">
          {item.attachmentKeys.map((key) => (
            <AttachmentLink key={key} attachmentKey={key} />
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-admin-muted">
        Posted by {item.createdBy.name}
      </p>
    </article>
  );
}

/**
 * One downloadable file on a notice.
 *
 * A plain `<a download>` cannot work here: `GET /media/file/:key` requires an
 * Authorization header, so the bytes are fetched with the token and handed to
 * the browser — the same approach as the authenticated result exports.
 *
 * A failure is shown on the button itself rather than as a page-level banner.
 * The candidate clicked this file; telling them about it anywhere else makes
 * them work out which of several attachments failed.
 */
function AttachmentLink({ attachmentKey }: { attachmentKey: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const name = attachmentKey.split("/").pop() ?? "attachment";

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        setFailed(null);
        downloadAttachment(attachmentKey)
          .catch((e: unknown) =>
            setFailed(e instanceof Error ? e.message : "Download failed"),
          )
          .finally(() => setBusy(false));
      }}
      title={failed ?? `Download ${name}`}
      className={`flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
        failed
          ? "border-danger/40 bg-danger/5 text-danger"
          : "border-admin-line bg-white text-admin-ink hover:border-admin/50 hover:bg-admin/5"
      }`}
    >
      <DownloadIcon className="size-3.5 shrink-0" />
      <span className="truncate">
        {busy ? "Downloading…" : (failed ?? name)}
      </span>
    </button>
  );
}
