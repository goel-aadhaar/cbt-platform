"use client";

import { useEffect, useState } from "react";

import {
  assignBatch,
  fetchExam,
  listBatches,
  publishExam,
  scheduleExam,
  unassignBatch,
  type BatchRow,
} from "@/lib/admin";

import { XIcon } from "./icons";

/**
 * Assign batches + pick a window for an APPROVED exam ("Schedule Exam"), or
 * change either for one already PUBLISHED-but-not-yet-live ("Reschedule") —
 * §2.3's replacement for the old "Start Now" shortcut, which skipped both.
 *
 * `examStatus` picks the one behavioral difference: a fresh schedule
 * publishes the exam (APPROVED → PUBLISHED via `publishExam`); a reschedule
 * just updates an already-PUBLISHED exam's window/batches in place.
 */
export function ExamScheduleModal({
  open,
  onClose,
  examId,
  examTitle,
  examStatus,
  onScheduled,
}: {
  open: boolean;
  onClose: () => void;
  examId?: string;
  examTitle?: string;
  examStatus?: "APPROVED" | "PUBLISHED";
  onScheduled?: () => void;
}) {
  // A fresh mount per exam (parent keys this modal by examId) is what makes
  // `true` the right initial value here — no synchronizing reset needed in
  // the effect below, which would otherwise call setState synchronously in
  // the effect body.
  const [allBatches, setAllBatches] = useState<BatchRow[] | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [initialIds, setInitialIds] = useState<string[]>([]);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !examId) return;
    let cancelled = false;
    Promise.all([fetchExam(examId), listBatches()])
      .then(([exam, batches]) => {
        if (cancelled) return;
        setAllBatches(batches);
        const assigned = exam.batches.map((b) => b.batch.id);
        setCheckedIds(assigned);
        setInitialIds(assigned);
        setStartAt(exam.startAt ? toDatetimeLocal(exam.startAt) : "");
        setEndAt(exam.endAt ? toDatetimeLocal(exam.endAt) : "");
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load the exam.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, examId]);

  function toggle(id: string) {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const valid =
    checkedIds.length > 0 &&
    Boolean(startAt) &&
    Boolean(endAt) &&
    new Date(endAt) > new Date(startAt);

  async function submit() {
    if (!examId || !valid) return;
    setSaving(true);
    setError(null);
    try {
      const toAdd = checkedIds.filter((id) => !initialIds.includes(id));
      const toRemove = initialIds.filter((id) => !checkedIds.includes(id));
      for (const id of toAdd) await assignBatch(examId, id);
      for (const id of toRemove) await unassignBatch(examId, id);

      await scheduleExam(examId, {
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
      });

      if (examStatus === "APPROVED") await publishExam(examId);

      onScheduled?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the schedule.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 [font-family:var(--font-hanken)]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0"
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-admin-line/60 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-admin-ink">
              {examStatus === "APPROVED" ? "Schedule Exam" : "Reschedule Exam"}
            </h2>
            {examTitle && (
              <p className="mt-0.5 text-sm text-admin-muted">{examTitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-6 py-5">
          {loading ? (
            <p className="text-sm text-admin-muted">Loading…</p>
          ) : (
            <div className="flex flex-col gap-5">
              <Field label="Assign batches" required>
                <div className="flex flex-col gap-2 rounded-xl border border-admin-line/60 p-3">
                  {(allBatches ?? []).map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-3 text-sm text-admin-ink"
                    >
                      <input
                        type="checkbox"
                        checked={checkedIds.includes(b.id)}
                        onChange={() => toggle(b.id)}
                        className="size-4 accent-admin"
                      />
                      {b.name}
                    </label>
                  ))}
                  {(allBatches ?? []).length === 0 && (
                    <p className="text-sm text-admin-muted">
                      No batches found.
                    </p>
                  )}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Opens at" required>
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Closes at" required>
                  <input
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
              {error && (
                <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-admin-line/60 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-admin-muted hover:text-admin-ink"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!valid || saving || loading}
            className="rounded-lg bg-admin px-6 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving
              ? "Saving…"
              : examStatus === "APPROVED"
                ? "Schedule & Publish"
                : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm text-admin-ink outline-none focus:border-admin";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-admin-ink">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
    </label>
  );
}

/** ISO string → the local-time "YYYY-MM-DDTHH:mm" a datetime-local input wants. */
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
