"use client";

import { useCallback, useEffect, useState } from "react";

import {
  evaluateExam,
  fetchExam,
  listExamResults,
  listQuestionScoring,
  publishResults,
  setQuestionScoring,
  type ExamDetail,
  type ExamQuestionScoringRow,
  type QuestionScoring,
} from "@/lib/admin";

import { InfoIcon, MinusCircleIcon, PlusCircleIcon, XIcon } from "./icons";

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
  /**
   * Empty until the exam's real batch assignments arrive.
   *
   * This used to open on three invented rows — "Morning Batch A · 142 Students
   * · Processed 2h ago" and friends — swapped for the real ones a moment later.
   * On a screen whose one button releases marks to candidates, an administrator
   * should never be shown a roster that does not exist, however briefly, and
   * certainly not one carrying a student count. Empty also fails safe: the
   * publish button is disabled while nothing is selected.
   */
  const [batches, setBatches] = useState<Batch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Total evaluated results for this exam — real count, shown in the footer. */
  const [resultCount, setResultCount] = useState<number | null>(null);

  // Replace the placeholder rows with the exam's real batch assignments, and
  // the real number of students results would actually go to.
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
            meta: "Assigned batch",
            on: true,
          })),
        );
      })
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : "Could not load batches.",
        ),
      );
    listExamResults(examId)
      .then((res) => {
        if (!cancelled) setResultCount(res.total);
      })
      .catch(() => {
        // The footer count is informational — a failed fetch here shouldn't
        // block publishing, just falls back to not showing a number.
      });
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
            {batches.length === 0 && !error && (
              <p className="rounded-xl border border-dashed border-admin-line p-6 text-center text-sm text-admin-muted">
                Loading this exam&rsquo;s batches&hellip;
              </p>
            )}
            {batches.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-xl border border-admin-line/60 p-4"
              >
                <span
                  className={`flex size-9 items-center justify-center rounded-full text-sm font-bold ${b.dark ? "bg-admin text-white" : "bg-admin-mint/40 text-admin"}`}
                >
                  {/* The id is a uuid — an initial is what belongs in a
                      36px circle. */}
                  {b.name.charAt(0).toUpperCase()}
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
              {examTitle ?? "Mid-Term Examination"}
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
            {resultCount === null ? (
              "Loading evaluated results…"
            ) : (
              <>
                Releasing{" "}
                <span className="font-semibold text-admin-ink">
                  {resultCount} evaluated result{resultCount === 1 ? "" : "s"}
                </span>{" "}
                across {batches.filter((b) => b.on).length} of {batches.length}{" "}
                batch{batches.length === 1 ? "" : "es"}
              </>
            )}
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

export function RecalculateResultsModal({
  open,
  onClose,
  examId,
  examTitle,
  onRecalculated,
}: {
  open: boolean;
  onClose: () => void;
  /** Without an exam there is nothing to recalculate. */
  examId?: string;
  examTitle?: string;
  onRecalculated?: (evaluated: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ExamQuestionScoringRow[]>([]);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState("");
  const [overrideBusy, setOverrideBusy] = useState<string | null>(null);

  const loadScoring = useCallback(() => {
    if (!examId) return;
    listQuestionScoring(examId)
      .then((res) => {
        setItems(res.items);
        setItemsError(null);
      })
      .catch((e: unknown) =>
        setItemsError(
          e instanceof Error ? e.message : "Could not load questions.",
        ),
      );
  }, [examId]);

  useEffect(() => {
    if (!open || !examId) return;
    loadScoring();
    // Clears the picked question when this closes or targets a different
    // exam, without setting state synchronously in the effect body itself.
    return () => setSelectedQuestion("");
  }, [open, examId, loadScoring]);

  async function recalc() {
    if (!examId) return;
    setBusy(true);
    setError(null);
    try {
      // Re-running evaluate re-scores every submitted attempt, which is what
      // "recalculate" means here. Per-question bonus/drop rules are set below,
      // via PATCH .../questions/:qid/scoring, which itself already
      // recalculates — this button is for a plain re-score with no changes.
      const res = await evaluateExam(examId);
      onRecalculated?.(res.evaluated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recalculation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function override(questionId: string, scoring: QuestionScoring) {
    if (!examId) return;
    setOverrideBusy(questionId);
    setItemsError(null);
    try {
      const res = await setQuestionScoring(examId, questionId, scoring);
      loadScoring();
      if (res.recalculated) onRecalculated?.(res.recalculated.evaluated);
    } catch (e) {
      setItemsError(
        e instanceof Error ? e.message : "Could not update this question.",
      );
    } finally {
      setOverrideBusy(null);
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
              {examTitle
                ? `Adjust scoring parameters for ${examTitle}.`
                : "Select an exam from the results table to recalculate."}
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
          {itemsError && (
            <p role="alert" className="mb-4 text-sm text-danger">
              {itemsError}
            </p>
          )}

          {/* Apply a bonus or drop to a question */}
          <section className="rounded-xl border border-admin-line/60 p-5">
            <h3 className="flex items-center gap-2 font-bold text-admin-ink">
              <PlusCircleIcon className="size-5 text-admin" /> Bonus or Drop a
              Question
            </h3>
            <p className="mt-1 text-xs text-admin-muted">
              Bonus awards every candidate full marks for the question; Drop
              removes it from scoring and from the maximum. Both recalculate
              every result immediately.
            </p>
            <div className="mt-4 flex gap-3">
              <div className="flex-1">
                <select
                  value={selectedQuestion}
                  onChange={(e) => setSelectedQuestion(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select a question…</option>
                  {items.map((q) => (
                    <option key={q.questionId} value={q.questionId}>
                      Q{q.order}
                      {q.section ? ` (${q.section})` : ""} —{" "}
                      {q.statement.slice(0, 60)}
                      {q.statement.length > 60 ? "…" : ""}
                      {q.scoring !== "NORMAL" ? ` [${q.scoring}]` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button
                disabled={!selectedQuestion || overrideBusy !== null}
                onClick={() => void override(selectedQuestion, "BONUS")}
                className="flex items-center gap-2 rounded-lg bg-admin-mint/40 px-4 py-2 text-sm font-semibold text-admin disabled:cursor-not-allowed disabled:opacity-40"
              >
                <PlusCircleIcon className="size-4" />
                {overrideBusy === selectedQuestion ? "Applying…" : "Bonus"}
              </button>
              <button
                disabled={!selectedQuestion || overrideBusy !== null}
                onClick={() => void override(selectedQuestion, "DROPPED")}
                className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-soft/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MinusCircleIcon className="size-4" />
                {overrideBusy === selectedQuestion ? "Applying…" : "Drop"}
              </button>
            </div>
          </section>

          {/* Current overrides */}
          <h3 className="mt-6 flex items-center gap-2 font-bold text-admin-ink">
            Per-Question Scoring
            <span className="flex items-center gap-1 rounded bg-admin-surface px-2 py-1 font-mono text-[11px] font-normal text-admin-muted">
              <InfoIcon className="size-3.5" /> {items.length} question
              {items.length === 1 ? "" : "s"}
            </span>
          </h3>
          <div className="mt-3 overflow-hidden rounded-xl border border-admin-line/60">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-admin-bg/50 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                  <th className="px-4 py-2.5">Question</th>
                  <th className="px-4 py-2.5">Hit Rate</th>
                  <th className="px-4 py-2.5">Scoring</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line/50">
                {items.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-admin-muted"
                    >
                      No approved questions on this exam yet.
                    </td>
                  </tr>
                )}
                {items.map((q) => (
                  <tr key={q.questionId}>
                    <td className="px-4 py-3 font-mono text-xs text-admin-muted">
                      Q{q.order}
                      {q.section ? ` · ${q.section}` : ""}
                    </td>
                    <td className="px-4 py-3 text-admin-muted">
                      {q.hitRate === null
                        ? "—"
                        : `${Math.round(q.hitRate)}% (${q.correct}/${q.attempted})`}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          q.scoring === "NORMAL"
                            ? "bg-admin-surface text-admin-muted"
                            : q.scoring === "BONUS"
                              ? "bg-admin-mint/50 text-admin"
                              : q.scoring === "DROPPED"
                                ? "bg-danger-soft text-danger"
                                : "bg-warn/15 text-warn"
                        }`}
                      >
                        {q.scoring}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {q.scoring !== "NORMAL" && (
                        <button
                          disabled={overrideBusy !== null}
                          onClick={() => void override(q.questionId, "NORMAL")}
                          className="text-xs font-semibold text-admin-2 hover:underline disabled:opacity-40"
                        >
                          Reset to normal
                        </button>
                      )}
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
