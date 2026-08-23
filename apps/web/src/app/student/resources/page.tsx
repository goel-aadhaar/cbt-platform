"use client";

import { useEffect, useMemo, useState } from "react";

import { DownloadIcon, FileTextIcon } from "@/components/student/icons";
import { StudentShell } from "@/components/student/student-shell";
import { downloadAttachment, formatBytes } from "@/lib/media";
import { listResources, type ResourceItem } from "@/lib/resources";

/**
 * Study material shared with this candidate's batch (§2.12).
 *
 * Grouped by subject rather than listed by date: someone here is looking for
 * "the Physics notes", not "what was posted on Tuesday". There is no batch
 * filter and no way to ask for one — the server answers from the session, so
 * this page can only ever show what belongs to them.
 */
export default function StudentResourcesPage() {
  const [items, setItems] = useState<ResourceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSubject, setOpenSubject] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listResources()
      .then((r) => {
        if (cancelled) return;
        setItems(r);
        // Open the first shelf, so the page never lands on a wall of closed
        // headings with nothing visible.
        setOpenSubject(r[0]?.subject.name ?? null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Could not load your resources.",
        );
        setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const bySubject = useMemo(() => {
    const map = new Map<string, ResourceItem[]>();
    for (const r of items ?? []) {
      const list = map.get(r.subject.name) ?? [];
      list.push(r);
      map.set(r.subject.name, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  return (
    <StudentShell breadcrumb={["Resources"]}>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          Resources
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          Notes and material your teachers have shared with your batch.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {items === null ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl bg-admin-line/15"
            />
          ))}
        </div>
      ) : bySubject.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-admin-line p-10 text-center text-sm text-admin-muted">
          Nothing has been shared with your batch yet. Anything your teachers
          upload will appear here, grouped by subject.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {bySubject.map(([subject, list]) => {
            const open = openSubject === subject;
            return (
              <section
                key={subject}
                className="overflow-hidden rounded-2xl border border-admin-line/60 bg-white"
              >
                <button
                  type="button"
                  onClick={() => setOpenSubject(open ? null : subject)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-admin-bg/50"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full bg-admin-mint/40 text-admin">
                      <FileTextIcon className="size-4" />
                    </span>
                    <span className="font-bold text-admin-ink">{subject}</span>
                  </span>
                  <span className="text-xs font-semibold text-admin-muted">
                    {list.length} file{list.length === 1 ? "" : "s"}
                  </span>
                </button>

                {open && (
                  <ul className="border-t border-admin-line/50">
                    {list.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center gap-3 border-b border-admin-line/40 px-5 py-4 last:border-b-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-admin-ink">
                            {r.title}
                          </p>
                          {r.description && (
                            <p className="mt-0.5 text-sm text-admin-muted">
                              {r.description}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-admin-subtle">
                            Shared by {r.createdBy.name}
                            {r.file ? ` · ${formatBytes(r.file.size)}` : ""}
                          </p>
                        </div>
                        <DownloadButton item={r} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </StudentShell>
  );
}

/**
 * One download.
 *
 * `GET /media/file/:key` needs an Authorization header, so a plain `<a download>`
 * cannot fetch it — the bytes come through `downloadAttachment`, which is the
 * same authenticated-download path the result exports use. A failure is shown
 * on the button that was clicked, not as a page banner: with several files on
 * screen, a banner does not say which one failed.
 */
function DownloadButton({ item }: { item: ResourceItem }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!item.file) {
    return (
      <span
        title="The file has been removed from the library"
        className="rounded-lg border border-admin-line px-3 py-2 text-xs font-semibold text-admin-subtle"
      >
        Unavailable
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        setFailed(false);
        downloadAttachment(item.mediaKey, item.file?.fileName)
          .catch(() => setFailed(true))
          .finally(() => setBusy(false));
      }}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-60 ${
        failed
          ? "border-danger/40 bg-danger/5 text-danger"
          : "border-admin-line bg-white text-admin-ink hover:border-admin/50 hover:bg-admin/5"
      }`}
    >
      <DownloadIcon className="size-3.5" />
      {busy ? "Downloading…" : failed ? "Try again" : "Download"}
    </button>
  );
}
