"use client";

import { useCallback, useEffect, useState } from "react";

import {
  listQuestionScoring,
  setQuestionScoring,
  type ExamQuestionScoringRow,
  type QuestionScoring,
} from "@/lib/admin";

import { LoadingSpinner } from "@/components/loading-spinner";

import { ManualGradingDrawer } from "./manual-grading-drawer";

/**
 * Answer-key corrections (§2.9).
 *
 * After an exam, a disputed question can be marked BONUS (full marks to
 * everyone), DROPPED (removed from scoring and from the maximum) or MANUAL
 * (awarded per candidate). The server recalculates scores, ranks and
 * percentiles itself and leaves publication alone — a correction updates what
 * students already see rather than withdrawing it.
 *
 * The hit rate is the decision aid: a near-zero rate on a question most
 * candidates attempted usually means the key is wrong, not that the cohort is.
 */

const OPTIONS: { value: QuestionScoring; label: string; hint: string }[] = [
  { value: "NORMAL", label: "Normal", hint: "Score against the answer key" },
  {
    value: "BONUS",
    label: "Bonus",
    hint: "Award full marks to every candidate",
  },
  {
    value: "DROPPED",
    label: "Dropped",
    hint: "Remove from scoring and from the maximum",
  },
  {
    value: "MANUAL",
    label: "Manual",
    hint: "Award marks per candidate by hand",
  },
];

const TONE: Record<QuestionScoring, string> = {
  NORMAL: "bg-admin-line/30 text-admin-muted",
  BONUS: "bg-emerald-50 text-emerald-700",
  DROPPED: "bg-red-50 text-red-700",
  MANUAL: "bg-amber-50 text-amber-700",
};

export function AnswerKeyPanel({
  examId,
  onChanged,
}: {
  examId: string;
  /** Fired after a correction so the caller can refresh its result rows. */
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<ExamQuestionScoringRow[] | null>(null);
  const [candidates, setCandidates] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** The question being graded by hand, if any. */
  const [grading, setGrading] = useState<ExamQuestionScoringRow | null>(null);

  const load = useCallback(async () => {
    const data = await listQuestionScoring(examId);
    setRows(data.items);
    setCandidates(data.candidates);
  }, [examId]);

  useEffect(() => {
    let cancelled = false;
    listQuestionScoring(examId)
      .then((data) => {
        if (cancelled) return;
        setRows(data.items);
        setCandidates(data.candidates);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Could not load the answer key",
        );
        setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [examId]);

  async function apply(row: ExamQuestionScoringRow, next: QuestionScoring) {
    if (busy) return;
    setBusy(row.questionId);
    setError(null);
    setNotice(null);
    try {
      const res = await setQuestionScoring(examId, row.questionId, next);
      setNotice(
        next === "MANUAL"
          ? // Say the consequence out loud. Manual takes the question out of
            // auto-scoring, so leaving it here scores everyone zero on it.
            `Q${row.order + 1} is now graded by hand. Until you award marks, every candidate scores 0 on it — use Grade to enter them.`
          : res.recalculated
            ? `Q${row.order + 1} set to ${next.toLowerCase()} — ${res.recalculated.evaluated} result(s) recalculated, max now ${res.recalculated.maxScore}.`
            : `Q${row.order + 1} set to ${next.toLowerCase()}. It will apply when the exam is evaluated.`,
      );
      await load();
      onChanged?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "That correction failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-admin-ink">Answer key corrections</h3>
        <span className="text-xs text-admin-muted">
          {candidates} candidate{candidates === 1 ? "" : "s"} · scores, ranks
          and percentiles update automatically
        </span>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 rounded-lg border border-admin-line bg-admin-bg px-3 py-2 text-sm text-admin-ink">
          {notice}
        </p>
      )}

      {rows === null ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg bg-admin-line/20"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-admin-line/60 bg-admin-bg p-4 text-sm text-admin-muted">
          This exam has no questions attached.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-admin-line/60">
          {rows.map((r) => (
            <div
              key={r.questionId}
              className="flex flex-wrap items-center gap-3 border-b border-admin-line/40 p-3 last:border-b-0"
            >
              <span className="w-8 shrink-0 text-sm font-bold text-admin-ink">
                {/* `order` is zero-based; candidates see 1-based numbering. */}
                Q{r.order + 1}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-admin-ink">
                  {r.statement}
                </span>
                <span className="mt-0.5 block text-xs text-admin-muted">
                  {r.section ? `${r.section} · ` : ""}
                  {r.marks} marks ·{" "}
                  {r.hitRate === null ? (
                    "not attempted"
                  ) : (
                    <span
                      className={
                        r.hitRate <= 10 ? "font-semibold text-red-700" : ""
                      }
                    >
                      {r.hitRate}% correct of {r.attempted} attempted
                    </span>
                  )}
                </span>
              </span>

              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${TONE[r.scoring]}`}
              >
                {r.scoring}
              </span>

              {r.scoring === "MANUAL" && (
                <button
                  type="button"
                  onClick={() => setGrading(r)}
                  className="shrink-0 rounded-lg bg-admin px-3 py-1.5 text-xs font-bold text-white hover:opacity-95"
                >
                  Grade
                </button>
              )}

              {/*
                A correction re-scores the whole paper, so every row's select is
                locked while one is applied — but until now nothing said WHICH
                row was doing it, and the panel just greyed out. This names it.
              */}
              {busy === r.questionId && (
                <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-admin">
                  <LoadingSpinner size={12} label="" />
                  Applying…
                </span>
              )}

              <select
                value={r.scoring}
                disabled={busy !== null}
                aria-busy={busy === r.questionId || undefined}
                onChange={(e) =>
                  void apply(r, e.target.value as QuestionScoring)
                }
                title={
                  OPTIONS.find((o) => o.value === r.scoring)?.hint ?? undefined
                }
                className="shrink-0 rounded-lg border border-admin-line px-2 py-1.5 text-xs font-semibold text-admin-ink outline-none focus:border-admin disabled:opacity-50"
              >
                {OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} title={o.hint}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {grading && (
        <ManualGradingDrawer
          examId={examId}
          questionId={grading.questionId}
          questionNumber={grading.order + 1}
          onClose={() => setGrading(null)}
          onGraded={(message) => {
            setNotice(message);
            void load();
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}
