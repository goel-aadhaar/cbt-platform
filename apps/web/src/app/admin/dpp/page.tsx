"use client";

import { useCallback, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { useBatchOptions } from "@/components/admin/academic-cascade";
import { CreateDppModal } from "@/components/admin/create-dpp-modal";
import { useAdminData } from "@/hooks/use-admin-data";
import { listBatches } from "@/lib/admin";
import { listDpps, removeDpp, type DppItem } from "@/lib/dpp";

/**
 * DPP management (§ Product Structure) — the institute-wide view. An admin
 * sees every DPP any teacher has shared, not just their own (DppService's
 * `visibilityWhere()` is unrestricted for ADMIN). Creation itself happens
 * from the Question Bank (filter → select → Create DPP); this is where an
 * admin audits what exists, fixes who it's shared with, or takes one down.
 */
export default function AdminDppPage() {
  const [editing, setEditing] = useState<DppItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const {
    data: dpps,
    loading,
    error,
    reload,
  } = useAdminData(() => listDpps(), []);
  const { data: allBatches } = useAdminData(() => listBatches(), []);
  const batchOptions = useBatchOptions(allBatches ?? []);

  const handleDelete = useCallback(
    async (d: DppItem) => {
      if (
        !window.confirm(
          `Delete "${d.title}"? Students will stop seeing it immediately.`,
        )
      ) {
        return;
      }
      try {
        await removeDpp(d.id);
        setNotice(`Deleted "${d.title}".`);
        reload();
      } catch (e: unknown) {
        setNotice(e instanceof Error ? e.message : "Could not delete that.");
      }
    },
    [reload],
  );

  return (
    <AdminShell title="DPP">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.4px] text-admin-ink">
            DPP
          </h1>
          <p className="mt-1 text-sm text-admin-muted">
            Every Daily Practice Paper shared across the institute. Create a new
            one from the{" "}
            <a
              href="/admin/questions"
              className="font-semibold text-admin hover:underline"
            >
              Question Bank
            </a>
            .
          </p>
        </div>
      </div>

      {notice && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-admin-line bg-admin/[0.06] px-3 py-2 text-sm text-admin"
        >
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl bg-admin-line/10"
            />
          ))}
        </div>
      ) : (dpps ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed border-admin-line bg-white p-10 text-center text-sm text-admin-muted">
          Nothing shared yet. Tick questions in the Question Bank and use
          &ldquo;Create DPP&rdquo; to share the first one.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(dpps ?? []).map((d) => (
            <li
              key={d.id}
              className="flex flex-col rounded-xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]"
            >
              <p className="font-semibold text-admin-ink">{d.title}</p>
              <p className="mt-1 text-xs text-admin-muted">
                {[d.subject?.name, d.chapter?.name]
                  .filter(Boolean)
                  .join(" · ") || "Unfiled"}{" "}
                · {d._count.questions} question
                {d._count.questions === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-xs text-admin-muted">
                Shared with{" "}
                {d.batches.map((b) => b.name).join(", ") || "nobody yet"}
              </p>
              <div className="mt-auto flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(d);
                    setEditOpen(true);
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
                >
                  Edit sharing
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(d)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateDppModal
        // A fresh key per open so the form mounts seeded from `editing`
        // instead of being reset by an effect after the fact.
        key={editOpen ? `open-${editing?.id ?? "new"}` : "closed"}
        open={editOpen}
        editing={editing}
        questionIds={[]}
        batches={batchOptions}
        onClose={() => setEditOpen(false)}
        onCreated={() => {
          setNotice("Saved.");
          reload();
        }}
      />
    </AdminShell>
  );
}
