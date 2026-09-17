"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthedImage } from "@/components/authed-image";
import { StudentShell } from "@/components/student/student-shell";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@/components/student/icons";
import { ProgressBar } from "@/components/student/practice-bits";
import {
  Explanation,
  IntegerInput,
  OptionRow,
} from "@/components/student/practice-question";
import {
  answerInSession,
  completePracticeSession,
  startPracticeSession,
  type PracticeAnswer,
  type PracticeCheckResult,
  type PracticeQuestion,
  type PracticeSummary,
} from "@/lib/practice";

/**
 * DPP attempt runner (§ Product Structure).
 *
 * Flexible by design: no timer, no tab-switch tracking, no fullscreen
 * enforcement, no CBT-style restriction of any kind — the server-side
 * session behind this has none either. A student answers at their own pace;
 * each answer is checked and its explanation revealed immediately.
 *
 * Unlike the old ad-hoc practice runner, there is no "choose a set size"
 * step: a DPP is a fixed paper the teacher already built, so opening it
 * goes straight from the list to the first question.
 */
export default function DppAttemptPage() {
  const params = useParams<{ id: string }>();
  const dppId = params.id;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<PracticeSummary | null>(null);

  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, PracticeCheckResult>>(
    {},
  );
  const [picked, setPicked] = useState<PracticeAnswer | null>(null);
  const [integer, setInteger] = useState("");
  const [checking, setChecking] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const startedAt = useRef<number>(0);
  const openedRef = useRef(false);

  /* Open the session once. The ref guards React's double-invoke in dev, which
     would otherwise create two sessions and halve the recorded progress. */
  useEffect(() => {
    if (openedRef.current || !dppId) return;
    openedRef.current = true;
    startPracticeSession(dppId)
      .then(({ session, items }) => {
        setSessionId(session.id);
        setQuestions(items);
        startedAt.current = Date.now();
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not open this DPP"),
      );
  }, [dppId]);

  const q = questions?.[index] ?? null;
  const result = q ? (results[q.id] ?? null) : null;
  const answered = result !== null;
  const answeredCount = Object.keys(results).length;
  const score = Object.values(results).filter((r) => r.correct).length;

  const finish = useCallback(async () => {
    if (!sessionId || finishing) return;
    setFinishing(true);
    try {
      const s = await completePracticeSession(
        sessionId,
        startedAt.current === 0
          ? 0
          : Math.round((Date.now() - startedAt.current) / 1000),
      );
      setSummary(s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save your results");
    } finally {
      setFinishing(false);
    }
  }, [sessionId, finishing]);

  async function submit() {
    if (!q || !sessionId || answered || checking) return;
    const answer: PracticeAnswer | null =
      q.type === "INTEGER" ? (integer === "" ? null : Number(integer)) : picked;
    if (answer === null || (Array.isArray(answer) && answer.length === 0))
      return;

    setChecking(true);
    try {
      const r = await answerInSession(sessionId, q.id, answer);
      setResults((prev) => ({ ...prev, [q.id]: r }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not check that answer");
    } finally {
      setChecking(false);
    }
  }

  function next() {
    if (questions && index >= questions.length - 1) {
      void finish();
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
    setInteger("");
  }

  if (summary) {
    return (
      <StudentShell breadcrumb={["DPP", "Complete"]}>
        <div className="mx-auto max-w-lg rounded-2xl border border-admin-line/40 bg-white p-8 text-center shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
          <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircleIcon className="size-8" />
          </span>
          <h1 className="mt-4 text-2xl font-bold text-admin-ink">
            DPP Complete
          </h1>
          <p className="mt-1 text-sm text-admin-muted">
            {summary.correct} of {summary.answered} correct
            {summary.answered < summary.total
              ? ` (${summary.total - summary.answered} left unanswered)`
              : ""}
          </p>
          <p className="mt-3 text-4xl font-bold text-admin">
            {summary.accuracy}%
          </p>
          {summary.personalAverage !== null && (
            <p className="mt-2 text-sm text-admin-muted">
              {summary.deltaVsAverage !== null && summary.deltaVsAverage >= 0
                ? `${summary.deltaVsAverage} points above`
                : `${Math.abs(summary.deltaVsAverage ?? 0)} points below`}{" "}
              your average on this DPP ({summary.personalAverage}%)
            </p>
          )}
          <Link
            href="/student/dpp"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-admin px-6 py-3 text-sm font-bold text-white hover:opacity-95"
          >
            Back to DPP <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </StudentShell>
    );
  }

  if (error) {
    return (
      <StudentShell breadcrumb={["DPP"]}>
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
        <Link
          href="/student/dpp"
          className="mt-4 inline-flex rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
        >
          Back to DPP
        </Link>
      </StudentShell>
    );
  }

  if (!questions || !q) {
    return (
      <StudentShell breadcrumb={["DPP"]}>
        <div className="h-64 animate-pulse rounded-2xl bg-admin-line/10" />
      </StudentShell>
    );
  }

  const isLast = index === questions.length - 1;

  return (
    <StudentShell breadcrumb={["DPP", `Question ${index + 1}`]}>
      <header className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-[-0.4px] text-admin-ink">
            Question {index + 1} of {questions.length}
          </h1>
          <span className="rounded-lg bg-admin/6 px-3 py-1.5 text-sm font-bold text-admin">
            Score {score}/{answeredCount}
          </span>
        </div>
        <ProgressBar
          value={((index + (answered ? 1 : 0)) / questions.length) * 100}
          className="mt-3"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {answered && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                result.correct
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {result.correct ? (
                <CheckCircleIcon className="size-3.5" />
              ) : (
                <XCircleIcon className="size-3.5" />
              )}
              {result.correct ? "Correct" : "Incorrect"}
            </span>
          )}
          <span className="rounded-full bg-admin-line/20 px-2.5 py-1 text-xs font-semibold text-admin-muted">
            {q.difficulty.charAt(0) + q.difficulty.slice(1).toLowerCase()}
          </span>
          <span className="text-xs text-admin-muted">
            {q.topic ?? q.chapter}
          </span>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
          <p className="text-base leading-relaxed text-admin-ink">
            {q.statement}
          </p>

          {/* Diagrams (§2.7) — same treatment as the exam screen. */}
          {(q.media ?? []).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {(q.media ?? []).map((m) => (
                <AuthedImage
                  key={m.key}
                  url={m.url}
                  alt="Question diagram"
                  className="max-h-72 max-w-full rounded-lg border border-admin-line/60 bg-white object-contain"
                />
              ))}
            </div>
          )}

          <div className="mt-5 space-y-3">
            {q.type === "INTEGER" ? (
              <IntegerInput
                value={integer}
                onChange={setInteger}
                disabled={answered}
                result={result}
              />
            ) : (
              (q.options ?? []).map((o) => (
                <OptionRow
                  key={o.key}
                  option={o}
                  type={q.type}
                  picked={picked}
                  result={result}
                  disabled={answered}
                  onPick={setPicked}
                />
              ))
            )}
          </div>

          <div className="mt-6">
            {!answered ? (
              <button
                type="button"
                onClick={() => void submit()}
                disabled={checking}
                className="w-full rounded-lg bg-admin px-6 py-3 text-base font-bold text-white hover:opacity-95 disabled:cursor-wait disabled:opacity-50"
              >
                {checking ? "Checking…" : "Check Answer"}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                disabled={finishing}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-admin px-6 py-3 text-base font-bold text-white hover:opacity-95 disabled:cursor-wait disabled:opacity-50"
              >
                {finishing
                  ? "Saving…"
                  : isLast
                    ? "Finish DPP"
                    : "Next Question"}
                {!finishing && <ArrowRightIcon className="size-4" />}
              </button>
            )}
          </div>
        </section>

        <Explanation result={result} />
      </div>
    </StudentShell>
  );
}
