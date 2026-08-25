"use client";

import { useEffect, useState } from "react";

import { LoadingSpinner } from "@/components/loading-spinner";

import { listBatches, type BatchRow } from "@/lib/admin";
import {
  type StudentListItem,
  type UpdateStudentInput,
  updateStudent,
} from "@/lib/students";

import { UserIcon, XIcon } from "./icons";

/**
 * Edit drawer for a Student row — the operations-tool counterpart of
 * `StaffDetailsDrawer`, which has no students in it by design.
 *
 * Exposes name and batch assignment, the two fields the API declares on
 * `UpdateStudentDto`. Phone is intentionally absent: `Student` has no such
 * column (recovery contact lives on `User` for staff only); an email field
 * is absent because `User.email` is globally unique and editing it requires
 * a fresh invite, not a silent rename.
 *
 * Bulk re-batching many students at once is the sibling drawer
 * `BulkReassignDrawer` — every action from this drawer still round-trips
 * through the server's `getOwned` institute guard, so the same tenant
 * boundary applies.
 */
export function EditStudentDrawer({
  open,
  onClose,
  student,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  student: StudentListItem | null;
  onChanged?: () => void;
}) {
  const [name, setName] = useState(student?.name ?? "");
  const [allBatches, setAllBatches] = useState<BatchRow[]>([]);
  const [batchId, setBatchId] = useState<string>(student?.batch?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Local edit state is initialised from props on first mount; the parent
  // remounts the drawer with `key={student.id}` whenever a different row is
  // opened, so edits to student A are not still in flight when student B is
  // shown. No reset effect, by design — lint rule and React guidance both
  // forbid synchronously calling setState in an effect body, and a remount
  // gives the same correctness for free.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listBatches()
      .then((rows) => !cancelled && setAllBatches(rows))
      .catch(
        (e: unknown) =>
          !cancelled &&
          setError(e instanceof Error ? e.message : "Could not load batches."),
      );
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open || !student) return null;

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const dto: UpdateStudentInput = {};
      const trimmedName = name.trim();
      if (trimmedName.length >= 1 && trimmedName !== student!.name) {
        dto.name = trimmedName;
      }
      if (batchId && batchId !== student!.batch?.id) {
        dto.batchId = batchId;
      }
      if (Object.keys(dto).length === 0) {
        setNotice("Nothing changed.");
        return;
      }
      await updateStudent(student!.id, dto);
      setNotice("Saved.");
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-admin-line/60 bg-white px-3 py-2 text-sm outline-none focus:border-admin focus:ring-2 focus:ring-admin/20";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="flex-1"
      />
      <div className="flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-admin-line/60 px-8 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
              Students / Edit
            </p>
            <h2 className="mt-1 text-2xl font-bold text-admin-ink">
              {student.name}
            </h2>
            <p className="text-sm text-admin-muted">
              Roll {student.rollNumber} · {student.email}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full text-admin-muted hover:bg-admin-bg"
          >
            <XIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto bg-admin-bg px-8 py-6">
          {error && (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-4 rounded-lg border border-admin-success/30 bg-admin-success/5 p-3 text-sm text-admin-success">
              {notice}
            </div>
          )}

          <section className="rounded-xl border border-admin-line/60 bg-white p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-admin-ink">
              <UserIcon className="size-4 text-admin-muted" />
              Profile
            </h3>
            <div className="mt-4 flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-admin-muted">
                  Full Name
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                  disabled={busy}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-admin-muted">Email</span>
                <input
                  defaultValue={student.email}
                  disabled
                  className={`${inputCls} bg-admin-surface text-admin-muted`}
                />
                <span className="text-xs text-admin-subtle">
                  Email changes require a fresh invite — not editable here.
                </span>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-admin-muted">
                  Roll Number
                </span>
                <input
                  defaultValue={student.rollNumber}
                  disabled
                  className={`${inputCls} bg-admin-surface text-admin-muted`}
                />
                <span className="text-xs text-admin-subtle">
                  Server-generated at invite time. Cannot be edited.
                </span>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-admin-muted">Batch</span>
                <select
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  className={inputCls}
                  disabled={busy}
                >
                  <option value="" disabled>
                    {allBatches.length ? "Select a batch" : "Loading batches…"}
                  </option>
                  {allBatches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-admin-subtle">
                  Source batch is read from the database, not this form, so the
                  same call cannot silently re-relocate a student who has
                  already moved.
                </span>
              </label>
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-admin-line/60 bg-white px-8 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-admin-line/60 bg-white px-4 py-2 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:bg-admin/90 disabled:opacity-60"
          >
            {busy ? <LoadingSpinner size={14} /> : null}
            Save Changes
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Bulk-reassign the listed students (caller already chose them via the
 * roster's checkbox column) to a single target batch. Distinct from
 * EditStudentDrawer because the round-trip is one POST for many rows, not a
 * PATCH per row — the only thing the drawer form needs is a target picker.
 *
 * The cap (500) is enforced in the server; the drawer shows the chosen
 * student count and tells the operator how many will move, so a paste-bomb
 * of the entire institute is visible before send.
 */
export function BulkReassignDrawer({
  open,
  onClose,
  selectedStudents,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  selectedStudents: StudentListItem[];
  onChanged?: () => void;
}) {
  const [targetBatchId, setTargetBatchId] = useState<string>("");
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // The parent's onClose sets `reassignOpen: false`, which unmounts this
    // component (`if (!open) return null` below), so a remount with default
    // state already gives the reset effect we want — no setState in the body.
    listBatches()
      .then(setBatches)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load batches."),
      );
  }, [open]);

  if (!open) return null;

  const currentBatches = new Set(
    selectedStudents.map((s) => s.batch?.id ?? ""),
  );

  async function move() {
    if (!targetBatchId) {
      setError("Choose a destination batch.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // Imported lazily so server-side render doesn't drag the students
      // helper code in: keep the bundle's student path and admin path
      // separate.
      const { reassignStudentsBatch } = await import("@/lib/students");
      const res = await reassignStudentsBatch(
        selectedStudents.map((s) => s.id),
        targetBatchId,
      );
      setNotice(`Moved ${res.moved} student${res.moved === 1 ? "" : "s"}.`);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move students.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-admin-line/60 bg-white px-3 py-2 text-sm outline-none focus:border-admin focus:ring-2 focus:ring-admin/20";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="flex-1"
      />
      <div className="flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-admin-line/60 px-8 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
              Students / Bulk reassign
            </p>
            <h2 className="mt-1 text-2xl font-bold text-admin-ink">
              Move {selectedStudents.length} student
              {selectedStudents.length === 1 ? "" : "s"}
            </h2>
            <p className="text-sm text-admin-muted">
              From {currentBatches.size} batch
              {currentBatches.size === 1 ? "" : "es"} to a single destination.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full text-admin-muted hover:bg-admin-bg"
          >
            <XIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto bg-admin-bg px-8 py-6">
          {error && (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-4 rounded-lg border border-admin-success/30 bg-admin-success/5 p-3 text-sm text-admin-success">
              {notice}
            </div>
          )}

          <section className="rounded-xl border border-admin-line/60 bg-white p-5">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-admin-muted">
                Destination batch
              </span>
              <select
                value={targetBatchId}
                onChange={(e) => setTargetBatchId(e.target.value)}
                className={inputCls}
                disabled={busy}
              >
                <option value="" disabled>
                  {batches.length ? "Select a batch" : "Loading…"}
                </option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <span className="mt-2 text-xs text-admin-subtle">
                The destination batch has to be in your institute. If every
                selected student is already in it, the call succeeds and moves 0
                rows.
              </span>
            </label>
          </section>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-admin-line/60 bg-white px-8 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-admin-line/60 bg-white px-4 py-2 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void move()}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:bg-admin/90 disabled:opacity-60"
          >
            {busy ? <LoadingSpinner size={14} /> : null}
            Move students
          </button>
        </footer>
      </div>
    </div>
  );
}
