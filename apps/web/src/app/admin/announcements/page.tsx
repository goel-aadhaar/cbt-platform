"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { PlusIcon } from "@/components/admin/icons";
import {
  CATEGORY_LOOK,
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  unpublishAnnouncement,
  updateAnnouncement,
  type AnnouncementCategory,
  type StaffAnnouncement,
} from "@/lib/announcements";
import { listBatches, type BatchRow } from "@/lib/admin";

import { useBatchPaths } from "@/components/admin/academic-cascade";

const CATEGORIES: AnnouncementCategory[] = [
  "GENERAL",
  "EXAM",
  "RESULT",
  "SCHEDULE",
  "MAINTENANCE",
];

/** Staff authoring for the student notice board. */
export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<StaffAnnouncement[] | null>(null);
  // The notice currently open for editing; null means the composer is
  // creating a new one.
  const [editing, setEditing] = useState<StaffAnnouncement | null>(null);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const reload = useCallback(async () => {
    try {
      setItems(await listAnnouncements());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load announcements");
      setItems([]);
    }
  }, []);

  // Initial load uses the promise callbacks directly — calling `reload` from
  // the effect body reads as a synchronous setState to React 19's lint rule.
  useEffect(() => {
    let cancelled = false;
    listAnnouncements()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Could not load announcements",
        );
        setItems([]);
      });
    listBatches()
      .then((b) => {
        if (!cancelled) setBatches(b);
      })
      .catch(() => {
        // Targeting a batch is optional; institute-wide still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "That action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell title="Announcements">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-admin-ink">
              Updates &amp; Announcements
            </h2>
            <p className="mt-1 text-sm text-admin-muted">
              Drafts stay hidden until you publish. Students only see notices
              aimed at them.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setComposing((c) => !c);
            }}
            className="flex items-center gap-2 rounded-full bg-admin px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95"
          >
            <PlusIcon className="size-4" />
            {composing ? "Close" : "New announcement"}
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {composing && (
          <Composer
            key={editing?.id ?? "new"}
            batches={batches}
            editing={editing}
            onDone={async () => {
              setComposing(false);
              setEditing(null);
              await reload();
            }}
            onError={setError}
          />
        )}

        {items === null ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl border border-admin-line/60 bg-admin-line/10"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-admin-line bg-white p-12 text-center text-sm text-admin-muted">
            No announcements yet. Create one to post it to the student portal.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((a) => (
              <li
                key={a.id}
                className="rounded-2xl border border-admin-line/60 bg-white p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${CATEGORY_LOOK[a.category].className}`}
                  >
                    {CATEGORY_LOOK[a.category].label}
                  </span>
                  {a.pinned && (
                    <span className="rounded-full bg-admin/10 px-2.5 py-1 text-[11px] font-bold uppercase text-admin">
                      Pinned
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                      a.publishedAt
                        ? "bg-admin-mint/60 text-admin"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {a.publishedAt ? "Published" : "Draft"}
                  </span>
                  <span className="text-xs text-admin-muted">
                    {a.audience === "BATCH"
                      ? `Batch: ${a.batch?.name ?? "unknown"}`
                      : "All students"}
                  </span>
                </div>

                <p className="mt-2 text-base font-bold text-admin-ink">
                  {a.title}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-admin-muted">
                  {a.body}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy === a.id}
                    onClick={() =>
                      void act(a.id, () =>
                        a.publishedAt
                          ? unpublishAnnouncement(a.id)
                          : publishAnnouncement(a.id),
                      )
                    }
                    className="rounded-lg border border-admin-line px-4 py-1.5 text-xs font-bold uppercase text-admin-ink hover:bg-admin-bg disabled:opacity-50"
                  >
                    {busy === a.id
                      ? "Working…"
                      : a.publishedAt
                        ? "Unpublish"
                        : "Publish"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(a);
                      setComposing(true);
                    }}
                    className="rounded-lg border border-admin-line px-4 py-1.5 text-xs font-bold uppercase text-admin-ink hover:bg-admin-bg"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy === a.id}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete "${a.title}"? This cannot be undone.`,
                        )
                      ) {
                        void act(a.id, () => deleteAnnouncement(a.id));
                      }
                    }}
                    className="rounded-lg border border-red-200 px-4 py-1.5 text-xs font-bold uppercase text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}

/**
 * Authoring form for a notice, used for both new ones and edits.
 *
 * `PATCH /announcements/:id` was fully implemented server-side but had no
 * client function and no control, so a published notice with a typo could only
 * be deleted and retyped — losing its publication time and its place in the
 * students' list. `expiresAt` was likewise supported and absent here.
 *
 * The parent remounts this via `key`, so the seeded state below is read once
 * per notice rather than needing an effect to resync.
 */
function Composer({
  batches,
  editing,
  onDone,
  onError,
}: {
  batches: BatchRow[];
  editing: StaffAnnouncement | null;
  onDone: () => void | Promise<void>;
  onError: (m: string) => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [category, setCategory] = useState<AnnouncementCategory>(
    editing?.category ?? "GENERAL",
  );
  const [batchId, setBatchId] = useState(editing?.batchId ?? "");
  const { path: batchPath } = useBatchPaths(true);
  const [pinned, setPinned] = useState(editing?.pinned ?? false);
  // <input type="datetime-local"> wants `YYYY-MM-DDTHH:mm`, not an ISO string.
  const [expiresAt, setExpiresAt] = useState(
    editing?.expiresAt ? editing.expiresAt.slice(0, 16) : "",
  );
  const [saving, setSaving] = useState(false);

  async function save(publish: boolean) {
    if (saving) return;
    if (title.trim().length < 3 || body.trim() === "") {
      onError("A title of at least 3 characters and a body are required.");
      return;
    }
    setSaving(true);
    try {
      const shared = {
        title: title.trim(),
        body: body.trim(),
        category,
        pinned,
        // An empty audience select means institute-wide, which is an explicit
        // clear on an edit rather than "leave the old batch alone".
        ...(batchId
          ? { audience: "BATCH" as const, batchId }
          : { audience: "ALL_STUDENTS" as const, batchId: null }),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      };
      if (editing) {
        await updateAnnouncement(editing.id, shared);
      } else {
        await createAnnouncement({
          ...shared,
          batchId: shared.batchId ?? undefined,
          expiresAt: shared.expiresAt ?? undefined,
          publish,
        });
      }
      await onDone();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Could not save that");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-admin-line/60 bg-white p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="text-xs font-bold uppercase text-admin-muted">
            Title
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-admin-line px-3 py-2 text-sm outline-none focus:border-admin"
            placeholder="Exam hall changed for Monday"
          />
        </label>

        <label className="md:col-span-2">
          <span className="text-xs font-bold uppercase text-admin-muted">
            Message
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-admin-line px-3 py-2 text-sm outline-none focus:border-admin"
            placeholder="Report to Block C instead of Block A from Monday onwards."
          />
        </label>

        <label>
          <span className="text-xs font-bold uppercase text-admin-muted">
            Category
          </span>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as AnnouncementCategory)
            }
            className="mt-1 w-full rounded-lg border border-admin-line px-3 py-2 text-sm outline-none focus:border-admin"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LOOK[c].label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="text-xs font-bold uppercase text-admin-muted">
            Audience
          </span>
          <select
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-admin-line px-3 py-2 text-sm outline-none focus:border-admin"
          >
            <option value="">All students</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {batchPath(b)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="text-xs font-bold uppercase text-admin-muted">
            Stop showing after
          </span>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-admin-line px-3 py-2 text-sm outline-none focus:border-admin"
          />
          <span className="mt-1 block text-xs text-admin-muted">
            Leave blank to keep it up indefinitely.
          </span>
        </label>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-admin-ink">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(e) => setPinned(e.target.checked)}
          className="size-4 accent-admin"
        />
        Pin to the top of the students&apos; list
      </label>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(true)}
          className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Publish now"}
        </button>
        {/* Editing never re-publishes: a notice keeps whatever visibility it
            already had, so there is no second button to offer. */}
        {!editing && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(false)}
            className="rounded-lg border border-admin-line px-5 py-2.5 text-sm font-bold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
          >
            Save as draft
          </button>
        )}
      </div>
    </section>
  );
}
