"use client";

import { useCallback, useEffect, useState } from "react";

import { ActionButton } from "@/components/action-button";
import { TeacherShell } from "@/components/staff/teacher-shell";
import { ResourceBrowser } from "@/components/resources/resource-browser";
import { ShareResourceDrawer } from "@/components/resources/share-resource-drawer";
import { getMyBatches, listSubjects, type Subject } from "@/lib/admin";
import { removeResource, type ResourceItem } from "@/lib/resources";

/**
 * Study material a teacher shares (§2.12).
 *
 * Navigated Subject > Chapter > Resource, the same taxonomy the question bank
 * uses, because that is how someone looks for material — nobody wants a flat
 * list of every filename their institute has ever uploaded.
 *
 * The browsing itself is shared with the student portal; what differs is the
 * ability to share, edit and delete, which arrives as props.
 */
export default function TeacherResourcesPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ResourceItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  // For the share form: only the batches this teacher may publish to. The
  // server checks again — this list is convenience, not the control.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([listSubjects(), getMyBatches()]).then(([s, b]) => {
      if (cancelled) return;
      if (s.status === "fulfilled") setSubjects(s.value);
      if (b.status === "fulfilled") setBatches(b.value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  async function handleDelete(item: ResourceItem) {
    if (
      !window.confirm(
        `Delete “${item.title}”? Students will stop seeing it immediately. ` +
          `The file itself stays in your media library.`,
      )
    ) {
      return;
    }
    try {
      await removeResource(item.id);
      setNotice(`Deleted “${item.title}”.`);
      refresh();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Could not delete that.");
    }
  }

  return (
    <TeacherShell title="Resources">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.4px] text-admin-ink">
            Resources
          </h1>
          <p className="mt-1 text-sm text-admin-muted">
            Notes, papers and lecture videos, filed by subject and chapter.
          </p>
        </div>
        <ActionButton
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
        >
          + Share material
        </ActionButton>
      </div>

      {notice && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-admin-line bg-admin/[0.06] px-3 py-2 text-sm text-admin"
        >
          {notice}
        </p>
      )}

      <div className="rounded-2xl border border-admin-line/40 bg-white p-4 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
        <ResourceBrowser
          key={refreshKey}
          emptyMessage="Nothing shared yet. Use “Share material” to add notes or a lecture video for your batches."
          renderActions={(item) => (
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => {
                  setEditing(item);
                  setDrawerOpen(true);
                }}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(item)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10"
              >
                Delete
              </button>
            </div>
          )}
        />
      </div>

      <ShareResourceDrawer
        // A fresh key per open so the form mounts with the right values
        // instead of being reset by an effect after the fact.
        key={`${drawerOpen}-${editing?.id ?? "new"}`}
        open={drawerOpen}
        editing={editing}
        subjects={subjects}
        batches={batches}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          setNotice(editing ? "Material updated." : "Material shared.");
          refresh();
        }}
      />
    </TeacherShell>
  );
}
