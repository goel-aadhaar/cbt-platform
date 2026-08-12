"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { StudentShell } from "@/components/student/student-shell";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  LightbulbIcon,
  TimerIcon,
  XCircleIcon,
} from "@/components/student/icons";
import { ProgressBar } from "@/components/student/practice-bits";
import { mediaSrc } from "@/lib/media";
import { usePracticeFacets } from "@/hooks/use-practice";
import {
  answerInSession,
  completePracticeSession,
  startPracticeSession,
  subjectFromSlug,
  chapterFromSlug,
  type PracticeAnswer,
  type PracticeCheckResult,
  type PracticeQuestion,
  type PracticeSummary,
} from "@/lib/practice";

import { PracticeSuccess } from "./success";

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
  const params = useParams<{ subject: string; chapter: string }>();
  const search = useSearchParams();
  const subjectSlug = params.subject ?? "";
  const chapterSlug = params.chapter ?? "";

  const { data: facets } = usePracticeFacets();
  const subjectName = subjectFromSlug(facets, subjectSlug);
  const subject =
    facets?.subjects.find((s) => s.subject === subjectName) ?? null;
  const chapter = chapterFromSlug(subject, chapterSlug);

  const topic = search.get("topic");
  const size = Number(search.get("size") ?? 25);
  const timed = search.get("timed") === "1";
  const limitMinutes = Number(search.get("minutes") ?? 0);

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
  // Stamped when the session actually opens — reading the clock during render
  // would be impure.
  const startedAt = useRef<number>(0);
  const openedRef = useRef(false);

  /* Open the session once. The ref guards React's double-invoke in dev, which
     would otherwise create two sessions and halve the recorded progress. */
  useEffect(() => {
    if (openedRef.current || subjectName === null) return;
    openedRef.current = true;
    startPracticeSession({
      subject: subjectName,
      chapter: chapter?.chapter,
      topic: topic ?? undefined,
      size,
      timed,
    })
      .then(({ session, items }) => {
        setSessionId(session.id);
        setQuestions(items);
        startedAt.current = Date.now();
      })
      .catch((e: unknown) =>
        setError(
          e instanceof Error ? e.message : "Could not start this practice set",
        ),
      );
  }, [subjectName, chapter?.chapter, topic, size, timed]);

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

  /*
   * Timed mode: a soft deadline that ends the set.
   *
   * The deadline is anchored to a real timestamp rather than decremented, so a
   * backgrounded tab still expires on time. `finish` is reached through a ref
   * because calling it straight from the effect body would be a setState in an
   * effect; from inside the interval callback it is a normal event.
   */
  const [secondsLeft, setSecondsLeft] = useState(limitMinutes * 60);
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  useEffect(() => {
    if (!timed || limitMinutes <= 0 || !sessionId) return;
    const deadline = Date.now() + limitMinutes * 60_000;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(id);
        void finishRef.current();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [timed, limitMinutes, sessionId]);

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

  // Empty segments would render as a stray "/" and collide as React keys.
  const crumbs = [
    "Practice Library",
    subjectName,
    chapter?.chapter,
    "Set",
  ].filter((c): c is string => Boolean(c));

  if (summary) {
    return (
      <StudentShell breadcrumb={[...crumbs.slice(0, -1), "Complete"]}>
        <PracticeSuccess
          summary={summary}
          subjectSlug={subjectSlug}
          chapterSlug={chapterSlug}
        />
      </StudentShell>
    );
  }

  if (error) {
    return (
      <StudentShell breadcrumb={crumbs}>
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
        <Link
          href={`/student/practice/${subjectSlug}/${chapterSlug}`}
          className="mt-4 inline-flex rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
        >
          Back to topics
        </Link>
      </StudentShell>
    );
  }

  if (!questions || !q) {
    return (
      <StudentShell breadcrumb={crumbs}>
        <div className="h-64 animate-pulse rounded-2xl bg-admin-line/10" />
      </StudentShell>
    );
  }

  const isLast = index === questions.length - 1;

  return (
    <StudentShell breadcrumb={crumbs}>
      <header className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-[-0.4px] text-admin-ink">
            Question {index + 1} of {questions.length}
          </h1>
          <div className="flex items-center gap-2">
            {timed && limitMinutes > 0 && (
              <span
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${
                  secondsLeft <= 60
                    ? "bg-red-50 text-red-700"
                    : "bg-admin-bg text-admin-ink"
                }`}
              >
                <TimerIcon className="size-3.5" />
                {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:
                {String(secondsLeft % 60).padStart(2, "0")}
              </span>
            )}
            <span className="rounded-lg bg-admin/6 px-3 py-1.5 text-sm font-bold text-admin">
              Score {score}/{answeredCount}
            </span>
          </div>
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
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={m.key}
                  src={mediaSrc(m.url)}
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
                    ? "Finish Practice"
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
