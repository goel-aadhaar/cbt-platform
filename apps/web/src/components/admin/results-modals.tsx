"use client";

import { useEffect, useState } from "react";

import {
  evaluateExam,
  fetchExam,
  publishResults,
  type ExamDetail,
} from "@/lib/admin";

import {
  ChevronDownIcon,
  InfoIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  XIcon,
} from "./icons";

function Backdrop({ onClose }: { onClose: () => void }) {
  return (
    <button
      aria-label="Close"
      onClick={onClose}
      className="absolute inset-0 bg-admin-ink/40"
    />
  );
}

/* ------------------------------ Publish ------------------------------ */

interface Batch {
  id: string;
  name: string;
  meta: string;
  on: boolean;
  dark?: boolean;
}

const INITIAL_BATCHES: Batch[] = [
  {
    id: "A",
    name: "Morning Batch A",
    meta: "142 Students • Processed 2h ago",
    on: true,
  },
  {
    id: "B",
    name: "Evening Batch B",
    meta: "98 Students • Processed 4h ago",
    on: false,
  },
  {
    id: "S",
    name: "Special Intensive Batch",
    meta: "45 Students • Processed 1d ago",
    on: true,
    dark: true,
  },
];

export function PublishResultsModal({
  open,
  onClose,
  examId,
  examTitle,
  onPublished,
}: {
  open: boolean;
  onClose: () => void;
  /** Without an exam there is nothing to publish — the CTA stays disabled. */
  examId?: string;
  examTitle?: string;
  onPublished?: (count: number) => void;
}) {
  const [batches, setBatches] = useState<Batch[]>(INITIAL_BATCHES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Replace the placeholder rows with the exam's real batch assignments.
  useEffect(() => {
    if (!open || !examId) return;
    let cancelled = false;
    fetchExam(examId)
      .then((e: ExamDetail) => {
        if (cancelled) return;
        setBatches(
          e.batches.map((b) => ({
            id: b.batch.id,
            name: b.batch.name,
            meta: "Assigned to this exam",
            on: true,
          })),
        );
      })
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : "Could not load batches.",
        ),
      );
    return () => {
      cancelled = true;
    };
  }, [open, examId]);

  async function publish() {
    if (!examId) return;
    setBusy(true);
    setError(null);
    try {
      const chosen = batches.filter((b) => b.on);
      let count = 0;
      if (chosen.length === batches.length) {
        // All batches — one call without a batchId publishes the whole exam.
        count = (await publishResults(examId)).published;
      } else {
        for (const b of chosen)
          count += (await publishResults(examId, b.id)).published;
      }
      onPublished?.(count);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const toggle = (id: string) =>
    setBatches((bs) => bs.map((b) => (b.id === id ? { ...b, on: !b.on } : b)));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 [font-family:var(--font-hanken)]">
      <Backdrop onClose={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-admin-line/60 px-7 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-admin-ink">
                Publish Results
              </h2>
              <p className="mt-1 text-sm text-admin-muted">
                {examTitle
                  ? `Select the batches to release results for ${examTitle}.`
                  : "Select an exam from the results table to release its results."}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-admin-muted hover:text-admin-ink"
            >
              <XIcon className="size-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-7 py-6">
          <p className="text-xs font-bold uppercase tracking-wide text-admin-muted">
            Select Batches
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {batches.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-xl border border-admin-line/60 p-4"
              >
                <span
                  className={`flex size-9 items-center justify-center rounded-full text-sm font-bold ${b.dark ? "bg-admin text-white" : "bg-admin-mint/40 text-admin"}`}
                >
                  {b.id}
                </span>
                <div className="flex-1">
                  <p className="font-bold text-admin-ink">{b.name}</p>
                  <p className="text-xs text-admin-muted">{b.meta}</p>
                </div>
                <button
                  onClick={() => toggle(b.id)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${b.on ? "bg-admin" : "bg-admin-line"}`}
                >
                  <span
                    className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${b.on ? "left-[22px]" : "left-0.5"}`}
                  />
                </button>
              </div>
            ))}
          </div>

          <p className="mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-admin-muted">
            Student Portal Preview
          </p>
          <div className="mt-3 overflow-hidden rounded-xl bg-admin-bg p-5">
            <span className="rounded bg-admin-mint/50 px-2 py-0.5 text-[11px] font-bold uppercase text-admin">
              New Results Available
            </span>
            <p className="mt-2 text-lg font-bold text-admin-ink">
              Mid-Term Examination
            </p>
            <p className="text-sm text-admin-muted">
              Biology 101 • Dr. John Doe
            </p>
            <div className="mt-3 flex items-center gap-4 rounded-lg border border-admin-line/60 bg-white p-4">
              <Ring pct={85} />
              <div className="flex-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-admin-line/50">
                  <div className="h-full w-[85%] rounded-full bg-admin" />
                </div>
                <div className="mt-2 flex justify-between text-sm text-admin-muted">
                  <span>
                    Status:{" "}
                    <span className="font-semibold text-admin">Passed</span>
                  </span>
                  <span>Percentile: 92nd</span>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-admin-subtle">
              This is a simplified view of what students will see upon login.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-admin-line/60 px-7 py-4">
          <p className="text-sm text-admin-muted">
            Releasing results to{" "}
            <span className="font-semibold text-admin-ink">
              {batches
                .filter((b) => b.on)
                .reduce((n, b) => n + parseInt(b.meta), 0)}{" "}
              students
            </span>
          </p>
          <div className="flex items-center gap-3">
            {error && (
              <span role="alert" className="mr-2 text-sm text-danger">
                {error}
              </span>
            )}
            {!examId && (
              <span className="mr-2 text-sm text-admin-muted">
                Choose an exam from the results table to publish.
              </span>
            )}
            <button
              onClick={onClose}
              className="rounded-lg px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-admin-muted hover:text-admin-ink"
            >
              Cancel
            </button>
            <button
              onClick={publish}
              disabled={!examId || busy || batches.every((b) => !b.on)}
              title={
                examId
                  ? undefined
                  : "Open a specific exam from the results table first"
              }
              className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Publishing…" : "▷ Publish Now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 52 52" className="size-full -rotate-90">
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke="var(--color-admin-line)"
          strokeWidth="5"
        />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke="var(--color-admin)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-admin">
        {pct}%
      </span>
    </div>
  );
}

/* ---------------------------- Recalculate ---------------------------- */

const HISTORY = [
  {
    when: "Oct 24, 14:30",
    action: "Dropped Q92",
    reason: "Translation error in Hindi paper",
    by: "Dr. SK",
    initials: "SK",
  },
  {
    when: "Oct 24, 10:15",
    action: "Bonus +4 to Q12",
    reason: "Multiple correct options found",
    by: "Admin",
    initials: "AD",
  },
];

export function RecalculateResultsModal({
  open,
  onClose,
  examId,
  onRecalculated,
}: {
  open: boolean;
  onClose: () => void;
  /** Without an exam there is nothing to recalculate. */
  examId?: string;
  onRecalculated?: (evaluated: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recalc() {
    if (!examId) return;
    setBusy(true);
    setError(null);
    try {
      // Re-running evaluate re-scores every submitted attempt, which is what
      // "recalculate" means here. Per-question bonus/drop rules are a separate
      // endpoint (PATCH .../questions/:qid/scoring) not yet surfaced in this UI.
      const res = await evaluateExam(examId);
      onRecalculated?.(res.evaluated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recalculation failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 [font-family:var(--font-hanken)]">
      <Backdrop onClose={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-admin-line/60 px-7 py-5">
          <div>
            <h2 className="text-xl font-bold text-admin-ink">
              Recalculate Results
            </h2>
            <p className="mt-1 text-sm text-admin-muted">
              Adjust scoring parameters for Exam: NEET Mock Test 04
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-7 py-6">
          {/* Bonus Marks */}
          <section className="rounded-xl border border-admin-line/60 p-5">
            <h3 className="flex items-center gap-2 font-bold text-admin-ink">
              <PlusCircleIcon className="size-5 text-admin" /> Bonus Marks
            </h3>
            <div className="mt-4 grid grid-cols-[1.2fr_0.8fr_1.4fr] gap-3">
              <Field label="Question ID">
                <Select>Select Question</Select>
              </Field>
              <Field label="Marks to Add">
                <input defaultValue="4" className={inputCls} />
              </Field>
              <Field label="Reason">
                <input
                  placeholder="e.g., Ambiguous wording"
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="mt-3 flex justify-end">
              <button className="rounded-lg bg-admin-mint/40 px-4 py-2 text-sm font-semibold text-admin">
                + Add Rule
              </button>
            </div>
          </section>

          {/* Drop Questions */}
          <section className="mt-4 rounded-xl border border-admin-line/60 p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold text-admin-ink">
                <MinusCircleIcon className="size-5 text-danger" /> Drop
                Questions
              </h3>
              <span className="flex items-center gap-1 rounded bg-admin-surface px-2 py-1 font-mono text-[11px] text-admin-muted">
                <InfoIcon className="size-3.5" /> Auto-recalculates total score
              </span>
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-admin-muted">
              Select Question to Drop
            </p>
            <div className="mt-2 flex gap-3">
              <div className="flex-1">
                <Select>Select Question</Select>
              </div>
              <button className="rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg">
                Mark to Drop
              </button>
            </div>
          </section>

          {/* History */}
          <h3 className="mt-6 font-bold text-admin-ink">
            Recent Recalculations
          </h3>
          <div className="mt-3 overflow-hidden rounded-xl border border-admin-line/60">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-admin-bg/50 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                  <th className="px-4 py-2.5">Date &amp; Time</th>
                  <th className="px-4 py-2.5">Action &amp; Reason</th>
                  <th className="px-4 py-2.5">Performed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line/50">
                {HISTORY.map((h, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-mono text-xs text-admin-muted">
                      {h.when}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-admin-ink">{h.action}</p>
                      <p className="text-xs text-admin-subtle">{h.reason}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-full bg-admin text-[10px] font-bold text-white">
                          {h.initials}
                        </span>
                        {h.by}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-admin-line/60 px-7 py-4">
          {error && (
            <span role="alert" className="mr-auto text-sm text-danger">
              {error}
            </span>
          )}
          {!examId && (
            <span className="mr-auto text-sm text-admin-muted">
              Choose an exam from the results table to recalculate.
            </span>
          )}
          <button
            onClick={onClose}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-admin-muted hover:text-admin-ink"
          >
            Cancel
          </button>
          <button
            onClick={recalc}
            disabled={!examId || busy}
            title={
              examId
                ? undefined
                : "Open a specific exam from the results table first"
            }
            className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Recalculating…" : "Apply Recalculation"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm text-admin-ink outline-none placeholder:text-admin-subtle focus:border-admin";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-admin-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({ children }: { children: React.ReactNode }) {
  return (
    <button className="flex w-full items-center justify-between rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm text-admin-ink hover:bg-admin-bg">
      {children}
      <ChevronDownIcon className="size-4 text-admin-muted" />
    </button>
  );
}
