"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { PlusIcon } from "@/components/admin/icons";
import { Panel, StatusPill } from "@/components/staff/charts";
import {
  createExamCategory,
  deleteExamCategory,
  listExamCategories,
  updateExamCategory,
  type ExamCategory,
} from "@/lib/exam-categories";

/**
 * The institute's catalogue of examination types (§2.3).
 *
 * Administrators define what kinds of paper exist; teachers pick one when
 * authoring, and on approval the paper is named "<Category> - <n>". That makes
 * this page the thing that decides what candidates see an exam called.
 */
export default function ExamCategoriesPage() {
  const [items, setItems] = useState<ExamCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await listExamCategories();
        if (!cancelled) setItems(res.items);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load categories");
        setItems([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(c: ExamCategory) {
    setBusy(c.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateExamCategory(c.id, { isActive: !c.isActive });
      setItems((prev) =>
        (prev ?? []).map((x) => (x.id === c.id ? { ...x, ...updated } : x)),
      );
      setNotice(
        updated.isActive
          ? `${updated.name} is offered again.`
          : `${updated.name} retired — existing papers keep it, new ones cannot use it.`,
      );
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Could not update the category",
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove(c: ExamCategory) {
    setBusy(c.id);
    setError(null);
    setNotice(null);
    try {
      await deleteExamCategory(c.id);
      setItems((prev) => (prev ?? []).filter((x) => x.id !== c.id));
      setNotice(`${c.name} deleted.`);
    } catch (e: unknown) {
      // The API refuses once papers reference it, and explains why.
      setError(
        e instanceof Error ? e.message : "Could not delete the category",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell title="Exam Categories">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-admin-muted">
          Teachers choose a category when they author a paper. On approval the
          paper is named after it and numbered — the second Physics Practice
          Test becomes{" "}
          <span className="font-semibold">Physics Practice Test - 2</span>.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-full bg-admin px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
        >
          <PlusIcon className="size-4" />
          New category
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-xl border border-admin/30 bg-admin/5 px-4 py-3 text-sm font-semibold text-admin">
          {notice}
        </p>
      )}

      <Panel
        title={items ? `${items.length} categories` : "Categories"}
        subtitle="Retiring a category keeps it on the papers already run under it"
      >
        {items === null ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl bg-admin-line/15"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-admin-line p-10 text-center">
            <p className="text-sm text-admin-muted">
              No categories yet. Teachers cannot author a paper until one
              exists.
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-3 rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:opacity-95"
            >
              Create the first one
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((c) => (
              <li
                key={c.id}
                className={`flex flex-wrap items-start justify-between gap-4 rounded-xl border border-admin-line/60 p-4 ${
                  busy === c.id ? "opacity-50" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-admin-ink">{c.name}</p>
                    <StatusPill tone={c.isActive ? "good" : "muted"}>
                      {c.isActive ? "Offered" : "Retired"}
                    </StatusPill>
                  </div>
                  {c.description && (
                    <p className="mt-1 text-sm text-admin-muted">
                      {c.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-admin-muted">
                    {c.examCount} paper{c.examCount === 1 ? "" : "s"} · next one
                    will be{" "}
                    <span className="font-semibold text-admin">
                      {c.nextName}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busy === c.id}
                    onClick={() => void toggle(c)}
                    className="rounded-lg border border-admin-line px-3 py-1.5 text-xs font-bold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
                  >
                    {c.isActive ? "Retire" : "Offer again"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === c.id}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete "${c.name}"? This cannot be undone.`,
                        )
                      ) {
                        void remove(c);
                      }
                    }}
                    className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger/5 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {creating && (
        <CreateCategoryModal
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setItems((prev) =>
              [...(prev ?? []), c].sort((a, b) => a.name.localeCompare(b.name)),
            );
            setNotice(
              `${c.name} created. Teachers can author papers under it now.`,
            );
            setCreating(false);
          }}
        />
      )}
    </AdminShell>
  );
}

function CreateCategoryModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: ExamCategory) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onCreated(
        await createExamCategory({
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not create the category",
      );
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-admin-ink">New exam category</h2>
        <p className="mt-1 text-sm text-admin-muted">
          Papers authored under it will be named{" "}
          <span className="font-semibold">
            {name.trim() ? `${name.trim()} - 1` : "<name> - 1"}
          </span>{" "}
          onwards.
        </p>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase text-admin-muted">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="Physics Practice Test"
              className="rounded-lg border border-admin-line px-3 py-2.5 text-sm outline-none focus:border-admin"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase text-admin-muted">
              Description (optional)
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Chapter-wise practice papers for Class 12 Physics."
              className="rounded-lg border border-admin-line px-3 py-2.5 text-sm outline-none focus:border-admin"
            />
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-admin-line px-4 py-2 text-sm font-bold text-admin-ink hover:bg-admin-bg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || name.trim().length < 2}
              className="rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create category"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
