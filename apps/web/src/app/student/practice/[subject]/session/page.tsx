"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";

import { StudentShell } from "@/components/student/student-shell";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  LightbulbIcon,
  XCircleIcon,
} from "@/components/student/icons";
import { usePracticeFacets, usePracticeQuestions } from "@/hooks/use-practice";
import {
  checkAnswer,
  subjectFromSlug,
  type PracticeAnswer,
  type PracticeCheckResult,
  type PracticeDifficulty,
  type PracticeQuestion,
} from "@/lib/practice";

export default function PracticeSessionPage() {
  return (
    <Suspense
      fallback={
        <StudentShell breadcrumb={["Practice Library"]}>
          <div className="h-64 animate-pulse rounded-2xl bg-admin-line/10" />
        </StudentShell>
      }
    >
      <PracticeSessionInner />
    </Suspense>
  );
}

function PracticeSessionInner() {
  const params = useParams<{ subject: string }>();
  const search = useSearchParams();
  const slug = params.subject ?? "";

  const { data: facets } = usePracticeFacets();
  const subject = subjectFromSlug(facets, slug);

  // Only fetch once the slug has resolved to a real subject name.
  const query = useMemo(
    () => ({
      subject: subject ?? undefined,
      chapter: search.get("chapter") ?? undefined,
      difficulty: (search.get("difficulty") as PracticeDifficulty) ?? undefined,
      limit: Number(search.get("limit") ?? 10),
    }),
    [subject, search],
  );
  const {
    data: questions,
    loading,
    error,
  } = usePracticeQuestions(query, subject !== null);

  const [index, setIndex] = useState(0);
  /** Per-question grading result, keyed by question id. */
  const [results, setResults] = useState<Record<string, PracticeCheckResult>>(
    {},
  );
  const [picked, setPicked] = useState<PracticeAnswer | null>(null);
  const [integer, setInteger] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const q = questions?.[index] ?? null;
  const result = q ? (results[q.id] ?? null) : null;
  const answered = result !== null;
  const total = questions?.length ?? 0;

  const submit = useCallback(async () => {
    if (!q || answered || checking) return;
    const answer: PracticeAnswer | null =
      q.type === "INTEGER" ? (integer === "" ? null : Number(integer)) : picked;
    if (answer === null || (Array.isArray(answer) && answer.length === 0))
      return;

    setChecking(true);
    setCheckError(null);
    try {
      const r = await checkAnswer(q.id, answer);
      setResults((prev) => ({ ...prev, [q.id]: r }));
    } catch (e: unknown) {
      setCheckError(
        e instanceof Error ? e.message : "Could not check that answer",
      );
    } finally {
      setChecking(false);
    }
  }, [q, answered, checking, integer, picked]);

  function next() {
    setIndex((i) => i + 1);
    setPicked(null);
    setInteger("");
    setCheckError(null);
  }

  const score = useMemo(
    () => Object.values(results).filter((r) => r.correct).length,
    [results],
  );

  if (error) {
    return (
      <StudentShell breadcrumb={["Practice Library", subject ?? "", "Set"]}>
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      </StudentShell>
    );
  }

  if (loading || !questions) {
    return (
      <StudentShell breadcrumb={["Practice Library", subject ?? "", "Set"]}>
        <div className="h-64 animate-pulse rounded-2xl bg-admin-line/10" />
      </StudentShell>
    );
  }

  if (questions.length === 0) {
    return (
      <StudentShell breadcrumb={["Practice Library", subject ?? "", "Set"]}>
        <div className="rounded-2xl border border-dashed border-admin-line bg-white p-12 text-center">
          <p className="text-base font-bold text-admin-ink">
            No questions match those filters
          </p>
          <p className="mt-1 text-sm text-admin-muted">
            Try a different chapter or difficulty.
          </p>
          <Link
            href={`/student/practice/${slug}`}
            className="mt-5 inline-flex rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
          >
            Back to chapters
          </Link>
        </div>
      </StudentShell>
    );
  }

  // Past the last question → summary.
  if (index >= questions.length) {
    return (
      <StudentShell
        breadcrumb={["Practice Library", subject ?? "", "Complete"]}
      >
        <SessionSummary slug={slug} score={score} total={total} />
      </StudentShell>
    );
  }

  const isLast = index === questions.length - 1;

  return (
    <StudentShell breadcrumb={["Practice Library", subject ?? "", "Set"]}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.4px] text-admin-ink">
            Question {index + 1} of {questions.length}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
              {q!.difficulty.charAt(0) + q!.difficulty.slice(1).toLowerCase()}
            </span>
            <span className="text-xs text-admin-muted">{q!.chapter}</span>
          </div>
        </div>
        <span className="rounded-lg bg-admin/6 px-3 py-1.5 text-sm font-bold text-admin">
          Score {score}/{Object.keys(results).length || 0}
        </span>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
          <p className="text-base leading-relaxed text-admin-ink">
            {q!.statement}
          </p>

          <div className="mt-5 space-y-3">
            {q!.type === "INTEGER" ? (
              <IntegerInput
                value={integer}
                onChange={setInteger}
                disabled={answered}
                result={result}
              />
            ) : (
              (q!.options ?? []).map((o) => (
                <OptionRow
                  key={o.key}
                  option={o}
                  type={q!.type}
                  picked={picked}
                  result={result}
                  disabled={answered}
                  onPick={setPicked}
                />
              ))
            )}
          </div>

          {checkError && (
            <p role="alert" className="mt-4 text-sm text-red-700">
              {checkError}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            {!answered ? (
              <button
                type="button"
                onClick={submit}
                disabled={checking}
                className="flex-1 rounded-lg bg-admin px-6 py-3 text-base font-bold text-white hover:opacity-95 disabled:opacity-50"
              >
                {checking ? "Checking…" : "Check Answer"}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-admin px-6 py-3 text-base font-bold text-white hover:opacity-95"
              >
                {isLast ? "Finish Practice" : "Next Question"}
                <ArrowRightIcon className="size-4" />
              </button>
            )}
          </div>
        </section>

        <Explanation result={result} />
      </div>
    </StudentShell>
  );
}

function OptionRow({
  option,
  type,
  picked,
  result,
  disabled,
  onPick,
}: {
  option: { key: string; text: string };
  type: PracticeQuestion["type"];
  picked: PracticeAnswer | null;
  result: PracticeCheckResult | null;
  disabled: boolean;
  onPick: (a: PracticeAnswer) => void;
}) {
  const selected =
    type === "MSQ"
      ? Array.isArray(picked) && picked.includes(option.key)
      : picked === option.key;

  const key = result?.correctAnswer;
  const isCorrectOption =
    result !== null &&
    (Array.isArray(key)
      ? key.includes(option.key)
      : String(key) === option.key);
  const isWrongPick = result !== null && selected && !isCorrectOption;

  function toggle() {
    if (disabled) return;
    if (type === "MSQ") {
      const cur = Array.isArray(picked) ? picked : [];
      onPick(
        cur.includes(option.key)
          ? cur.filter((k) => k !== option.key)
          : [...cur, option.key].sort(),
      );
    } else {
      onPick(option.key);
    }
  }

  let tone = "border-admin-line/60 bg-white";
  if (result !== null && isCorrectOption)
    tone = "border-emerald-600 bg-emerald-50";
  else if (isWrongPick) tone = "border-red-500 bg-red-50";
  else if (selected) tone = "border-admin bg-admin/5";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={selected}
      className={`relative flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors ${tone} ${
        disabled ? "cursor-default" : "hover:border-admin"
      }`}
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          result !== null && isCorrectOption
            ? "bg-emerald-600 text-white"
            : isWrongPick
              ? "bg-red-500 text-white"
              : selected
                ? "bg-admin text-white"
                : "bg-admin-line/30 text-admin-muted"
        }`}
      >
        {option.key}
      </span>
      <span className="min-w-0 flex-1 text-sm text-admin-ink">
        {option.text}
      </span>
      {result !== null && isCorrectOption && (
        <span className="shrink-0 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
          Correct
        </span>
      )}
      {isWrongPick && (
        <span className="shrink-0 rounded bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
          Your answer
        </span>
      )}
    </button>
  );
}

function IntegerInput({
  value,
  onChange,
  disabled,
  result,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  result: PracticeCheckResult | null;
}) {
  return (
    <div>
      <label
        htmlFor="practice-integer"
        className="mb-1.5 block text-sm font-semibold text-admin-ink"
      >
        Your answer
      </label>
      <input
        id="practice-integer"
        type="number"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border-2 px-4 py-3 text-base text-admin-ink outline-none ${
          result === null
            ? "border-admin-line/60 focus:border-admin"
            : result.correct
              ? "border-emerald-600 bg-emerald-50"
              : "border-red-500 bg-red-50"
        }`}
        placeholder="Type a number"
      />
      {result !== null && !result.correct && (
        <p className="mt-2 text-sm font-semibold text-emerald-700">
          Correct answer: {String(result.correctAnswer)}
        </p>
      )}
    </div>
  );
}

function Explanation({ result }: { result: PracticeCheckResult | null }) {
  return (
    <aside className="rounded-2xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
      <h2 className="flex items-center gap-2 text-base font-bold text-admin-ink">
        <LightbulbIcon className="size-5 text-admin" />
        Detailed Explanation
      </h2>
      {result === null ? (
        <p className="mt-3 text-sm text-admin-muted">
          Commit an answer to reveal the worked explanation. Keys are held back
          until then — these questions also appear in live exams.
        </p>
      ) : (
        <>
          <p className="mt-3 rounded-lg bg-admin/6 px-3 py-2 text-sm font-semibold text-admin">
            Correct answer:{" "}
            {Array.isArray(result.correctAnswer)
              ? result.correctAnswer.join(", ")
              : String(result.correctAnswer)}
          </p>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-admin-ink">
            {result.explanation ??
              "No explanation was provided for this question."}
          </p>
        </>
      )}
    </aside>
  );
}

function SessionSummary({
  slug,
  score,
  total,
}: {
  slug: string;
  score: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-admin-line/40 bg-white p-10 text-center shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-admin/10 text-admin">
        <CheckCircleIcon className="size-8" />
      </span>
      <h1 className="mt-4 text-2xl font-bold text-admin-ink">
        Practice complete
      </h1>
      <p className="mt-1 text-sm text-admin-muted">
        You answered {score} of {total} correctly.
      </p>
      <p className="mt-6 text-5xl font-bold text-admin">{pct}%</p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={`/student/practice/${slug}/start`}
          className="rounded-lg bg-admin px-6 py-3 text-base font-bold text-white hover:opacity-95"
        >
          Practise again
        </Link>
        <Link
          href="/student/practice"
          className="text-sm font-semibold text-admin-muted hover:text-admin-ink"
        >
          Back to Practice Library
        </Link>
      </div>
    </div>
  );
}
