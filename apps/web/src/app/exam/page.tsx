"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { AuthGate } from "@/components/auth-gate";
import { ExamSidebar } from "@/components/exam/exam-sidebar";
import {
  CalculatorIcon,
  ChevronRightIcon,
  DocumentIcon,
  FlagIcon,
  GlobeIcon,
  InfoIcon,
  LockClosedIcon,
  MaximizeIcon,
} from "@/components/icons";
import { SubmitConfirmModal } from "@/components/exam/submit-confirm-modal";
import { useCountdown } from "@/hooks/use-countdown";
import { useProctoring } from "@/hooks/use-proctoring";
import { ApiError } from "@/lib/api";
import { getUserSnapshot, subscribeSession } from "@/lib/auth";
import {
  reportViolation,
  saveResponse,
  startAttempt,
  submitAttempt,
  type AttemptResponse,
  type AttemptState,
} from "@/lib/student";
import { formatDuration } from "@/lib/exam-data";

// keep the type alias around for the existing sidebar import
import type { QuestionStatus, Subject } from "@/lib/exam-data";

export default function ExamPage() {
  return (
    <AuthGate>
      <Suspense fallback={<ExamPageSkeleton />}>
        <ExamPageInner />
      </Suspense>
    </AuthGate>
  );
}

function ExamPageSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <span className="size-8 animate-pulse rounded-full bg-brand-indigo/40" />
    </div>
  );
}

function ExamPageInner() {
  const params = useSearchParams();
  const examId = params.get("examId");

  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Active start path: POST /attempts with the URL's examId.
  const startFn = useCallback(async () => {
    if (!examId) {
      setStartError("No exam specified. Return to the dashboard.");
      return;
    }
    setStartError(null);
    setStarting(true);
    try {
      const state = await startAttempt(examId);
      setAttempt(state);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 403
            ? "You're not assigned to a batch for this exam."
            : err.status === 404
              ? "Exam is not currently available."
              : err.message
          : "Could not start the exam. Try again.";
      setStartError(msg);
    } finally {
      setStarting(false);
    }
  }, [examId]);

  const handleSubmit = useCallback(async () => {
    if (!attempt) return;
    try {
      await submitAttempt(attempt.id);
    } catch {
      // Even if the server submit fails we still want to show the local
      // confirmation — the attempt row will be auto-submitted on expiry.
    } finally {
      setSubmitted(true);
    }
  }, [attempt]);

  if (submitted) return <SubmittedScreen attemptId={attempt?.id} />;
  if (!attempt)
    return (
      <StartGate onStart={startFn} starting={starting} error={startError} />
    );
  return <ExamRunner attempt={attempt} onSubmit={handleSubmit} />;
}

/* ------------------------------------------------------------------ */
/* Pre-exam gate — requests fullscreen from a real user gesture.       */
/* ------------------------------------------------------------------ */
function StartGate({
  onStart,
  starting,
  error,
}: {
  onStart: () => void;
  starting: boolean;
  error: string | null;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="w-full max-w-lg border border-line bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-brand">DRSK Assessment</h1>
        <p className="mt-1 text-sm text-muted">
          Please read the instructions before starting.
        </p>
        <ul className="mt-6 space-y-2 text-sm text-ink">
          <li>• The exam runs in full-screen mode and is time-bound.</li>
          <li>
            • Switching tabs or leaving full-screen is recorded as a violation.
            After the allowed number of violations the exam auto-submits.
          </li>
          <li>• Do not refresh or close the browser during the exam.</li>
        </ul>
        {error && (
          <p
            role="alert"
            className="mt-4 border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded bg-brand px-6 py-3 text-sm font-bold uppercase text-white hover:opacity-95 disabled:opacity-60"
        >
          <MaximizeIcon className="size-4" />
          {starting ? "Starting…" : "Start Exam in Full Screen"}
        </button>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Post-submit confirmation.                                           */
/* ------------------------------------------------------------------ */
/** How long the confirmation stays up before the student is sent to the portal. */
const REDIRECT_SECONDS = 10;

function SubmittedScreen({ attemptId }: { attemptId: string | undefined }) {
  const router = useRouter();
  const [result, setResult] = useState<{
    score: number;
    max: number;
  } | null>(null);

  // `replace`, not `push` — the finished attempt must not be reachable via Back.
  const goHome = useCallback(() => router.replace("/student"), [router]);
  const secondsLeft = useCountdown(REDIRECT_SECONDS, goHome);

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    import("@/lib/student")
      .then(({ fetchAttemptResult }) => fetchAttemptResult(attemptId))
      .then((r) => {
        if (!cancelled) setResult({ score: r.totalScore, max: r.maxScore });
      })
      .catch(() => {
        // Result may still be processing — that's fine.
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="w-full max-w-md border border-line bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-success">Exam Submitted</h1>
        <p className="mt-2 text-sm text-muted">
          {result
            ? `Your responses have been recorded. Score: ${result.score}/${result.max}.`
            : "Your responses have been recorded. Results will be available once published."}
        </p>
        <button
          type="button"
          onClick={goHome}
          className="mt-6 rounded bg-brand px-6 py-2.5 text-sm font-bold uppercase text-white hover:opacity-95"
        >
          Back to Student Portal
        </button>
        <p aria-live="polite" className="mt-3 text-xs text-muted">
          Redirecting to your portal in {secondsLeft} second
          {secondsLeft === 1 ? "" : "s"}…
        </p>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* The running exam.                                                    */
/* ------------------------------------------------------------------ */
function ExamRunner({
  attempt,
  onSubmit,
}: {
  attempt: AttemptState;
  onSubmit: () => void;
}) {
  /**
   * Flatten the backend's section → question tree into a single array.
   *
   * `optionKeys` is the important bit: the backend scores an MCQ by comparing
   * the saved answer against `answerKey`, which is the option KEY ("A".."D") —
   * not the option text and not its index. We therefore keep the keys alongside
   * the display text and always persist the key.
   */
  const questions = useMemo(() => {
    const out: {
      id: string;
      subject: Subject;
      type: "MCQ" | "MSQ" | "INTEGER";
      stem: string;
      options: string[];
      optionKeys: string[];
      positiveMarks: number;
      negativeMarks: number;
      sectionName: string;
    }[] = [];
    for (const section of attempt.exam.sections) {
      for (const q of section.questions) {
        const raw = q.question.options ?? [];
        out.push({
          id: q.question.id,
          subject: section.name,
          type: q.question.type,
          stem: q.question.statement,
          options: raw.map((o) => o.text),
          optionKeys: raw.map((o) => o.key),
          positiveMarks: q.question.marks,
          negativeMarks: section.marksWrong,
          sectionName: section.name,
        });
      }
    }
    return out;
  }, [attempt]);

  /**
   * Tab labels = the paper's real sections, in order. A Biology-only paper gets
   * one tab (which the sidebar then hides) rather than two empty ones.
   */
  const subjects = useMemo(
    () => attempt.exam.sections.map((s) => s.name),
    [attempt],
  );

  /**
   * Answers are stored in the exact shape the backend scores against, so a
   * save is a straight passthrough:
   *   MCQ     → option key      "B"
   *   MSQ     → option key list ["A","C"]
   *   INTEGER → number          42
   */
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<(Answer | null)[]>(() =>
    questions.map((q) => {
      const r = attempt.responses.find((x) => x.questionId === q.id);
      return normalizeAnswer(q, r?.answer ?? null);
    }),
  );
  const [statuses, setStatuses] = useState<QuestionStatus[]>(() =>
    questions.map((q) => {
      const r = attempt.responses.find((x) => x.questionId === q.id);
      return mapStatus(r);
    }),
  );

  /**
   * A deliberate submit opens the confirmation modal first. The two FORCED
   * paths below (timer expiry, proctoring limit) call `onSubmit` directly —
   * there is nothing to confirm once the attempt is over.
   */
  const [confirmOpen, setConfirmOpen] = useState(false);

  const submitSummary = useMemo(() => {
    let answered = 0;
    let markedForReview = 0;
    for (const s of statuses) {
      if (s === "answered" || s === "answered-marked") answered += 1;
      if (s === "marked" || s === "answered-marked") markedForReview += 1;
    }
    // Anything not answered counts as unattempted, whether it was visited,
    // skipped or merely flagged — that is what actually gets evaluated.
    return {
      total: statuses.length,
      answered,
      notAnswered: statuses.length - answered,
      markedForReview,
    };
  }, [statuses]);

  const user = useSyncExternalStore(
    subscribeSession,
    getUserSnapshot,
    () => null,
  );

  const remainingSeconds = useCountdown(attempt.remainingSeconds, onSubmit);
  const proctoring = useProctoring({
    maxViolations: attempt.exam.maxViolations,
    enabled: true,
    onLimitReached: onSubmit,
  });

  /**
   * Mirror each client-side proctoring violation to the server. Fire-and-forget:
   * the server keeps its own count and is the source of truth for auto-submit,
   * so a dropped report degrades the audit trail, not the exam's integrity.
   */
  const attemptId = attempt.id;
  useEffect(() => {
    if (proctoring.violations === 0) return;
    void reportViolation(attemptId, {
      type: "FULLSCREEN_EXIT",
      detail: "Client-side proctoring event",
    }).catch(() => {});
  }, [proctoring.violations, attemptId]);

  const q = questions[current];
  const subject = q.subject;
  const picked = answers[current];

  function visit(index: number) {
    setCurrent(index);
    setStatuses((prev) =>
      prev.map((s, i) =>
        i === index && s === "not-visited" ? "not-answered" : s,
      ),
    );
  }

  function goNext() {
    if (current < questions.length - 1) visit(current + 1);
  }
  function goBack() {
    if (current > 0) visit(current - 1);
  }

  /**
   * Commit an answer for the current question and auto-save it. `value` is
   * already in the backend's scoring shape; `null` clears the response.
   */
  function commitAnswer(value: Answer | null) {
    setAnswers((prev) => prev.map((v, idx) => (idx === current ? value : v)));
    const answered = !isBlank(value);
    const wasMarked =
      statuses[current] === "marked" || statuses[current] === "answered-marked";
    setStatuses((prev) =>
      prev.map((s, idx) => {
        if (idx !== current) return s;
        const marked = s === "marked" || s === "answered-marked";
        if (marked) return answered ? "answered-marked" : "marked";
        return answered ? "answered" : "not-answered";
      }),
    );
    // Send BOTH halves of the response. Selecting an option and marking for
    // review fire separate saves that can be in flight together; a payload
    // carrying the complete state is idempotent, so whichever lands last
    // still leaves the row correct.
    void saveResponse(attemptId, questions[current].id, {
      answer: answered ? value : null,
      markedForReview: wasMarked,
    }).catch(() => {
      // Best-effort; the next interaction re-saves.
    });
  }

  /** MCQ — single option key replaces any previous choice. */
  function selectOption(i: number) {
    commitAnswer(q.optionKeys[i] ?? String(i));
  }

  /** MSQ — toggle an option key in/out of the selected set (order-independent). */
  function toggleOption(i: number) {
    const key = q.optionKeys[i] ?? String(i);
    const chosen = Array.isArray(picked) ? picked : [];
    const next = chosen.includes(key)
      ? chosen.filter((k) => k !== key)
      : [...chosen, key].sort();
    commitAnswer(next.length > 0 ? next : null);
  }

  /** INTEGER — free numeric entry. */
  function setIntegerAnswer(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") return commitAnswer(null);
    const n = Number(trimmed);
    commitAnswer(Number.isFinite(n) ? n : null);
  }

  function clearResponse() {
    commitAnswer(null);
  }

  function commitAndNext(mark: boolean) {
    setStatuses((prev) =>
      prev.map((s, i) => {
        if (i !== current) return s;
        const answered = !isBlank(answers[current]);
        if (mark) return answered ? "answered-marked" : "marked";
        return answered ? "answered" : "not-answered";
      }),
    );
    const question = questions[current];
    const value = answers[current];
    // Both halves again — see commitAnswer. Sending only `markedForReview`
    // here is what previously raced with the in-flight answer save.
    void saveResponse(attemptId, question.id, {
      answer: isBlank(value) ? null : value,
      markedForReview: mark,
    }).catch(() => {});
    goNext();
  }

  function selectSubject(s: Subject) {
    const first = questions.findIndex((x) => x.subject === s);
    if (first >= 0) visit(first);
  }

  const timeLow = remainingSeconds <= 5 * 60;
  const localNumber =
    questions.slice(0, current).filter((x) => x.subject === subject).length + 1;

  const meta = useMemo(
    () => ({
      candidateName: user?.name ?? "Candidate",
      candidatePhoto: "/exam/candidate-photo.jpg",
      examName: attempt.exam.title,
      // The attempt payload carries no paper/roll fields; show the signed-in
      // email and the section count instead of leaving the block blank.
      paper: `${attempt.exam.sections.length} sections`,
      candidateId: user?.email ?? "",
      durationSeconds: attempt.exam.durationMinutes * 60,
      maxViolations: attempt.exam.maxViolations,
    }),
    [attempt, user],
  );

  return (
    <div className="flex h-screen flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-surface px-6">
        <div className="flex items-center gap-4">
          <Image
            src="/brand/drsk-logo.png"
            alt="DRSK"
            width={39}
            height={39}
            className="size-[39px] object-contain"
          />
          <span className="text-xl font-bold tracking-[-0.5px] text-brand">
            DRSK ASSESSMENT PORTAL
          </span>
        </div>

        <div className="flex items-center gap-4">
          {proctoring.violations > 0 ? (
            <span className="flex items-center gap-2 rounded-[2px] bg-alert px-3 py-1 text-xs font-semibold uppercase text-white">
              <LockClosedIcon className="h-[12px] w-[9px]" />
              Warning {proctoring.violations}/{attempt.exam.maxViolations}{" "}
              Violation
            </span>
          ) : (
            <span className="flex items-center gap-2 rounded-[2px] bg-success/10 px-3 py-1 text-xs font-semibold uppercase text-success">
              <LockClosedIcon className="h-[12px] w-[9px]" />
              Session Secure
            </span>
          )}

          <nav className="flex items-center gap-2 border-l border-line pl-4 text-muted">
            <ToolLink
              icon={<CalculatorIcon className="size-4" />}
              label="Calculator"
            />
            <ToolLink
              icon={<InfoIcon className="size-4" />}
              label="Instructions"
            />
            <ToolLink
              icon={<DocumentIcon className="size-4" />}
              label="Question Paper"
            />
          </nav>

          <div className="flex items-center gap-2 border-l border-line pl-4">
            <button
              type="button"
              onClick={() => void proctoring.enterFullscreen()}
              aria-label="Toggle full screen"
              className="flex size-9 items-center justify-center rounded-[2px] bg-brand-indigo text-white"
            >
              <GlobeIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="rounded-[2px] bg-brand-indigo px-4 py-1.5 text-base uppercase text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col border-r border-line bg-white">
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold text-ink">Section:</span>
              <span className="font-semibold text-brand">{q.sectionName}</span>
            </div>
            <div className="flex gap-4">
              <MarkChip
                label="Marks for correct answer:"
                value={`+${q.positiveMarks}`}
                tone="pos"
              />
              <MarkChip
                label="Negative Marks:"
                value={`-${q.negativeMarks}`}
                tone="neg"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-8">
            <div className="mx-auto max-w-[896px]">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <h2 className="text-xl font-bold text-ink">
                  Question {localNumber}
                </h2>
                <button
                  type="button"
                  aria-label="Flag question"
                  className="text-subtle hover:text-warn"
                >
                  <FlagIcon className="h-[17px] w-[15px]" />
                </button>
              </div>

              <p className="mt-4 whitespace-pre-line text-[18px] leading-[29px] text-ink">
                {q.stem}
              </p>

              {q.type === "MSQ" && (
                <p className="mt-3 inline-block bg-info/10 px-2 py-1 text-xs font-semibold text-info">
                  Multiple answers may be correct — select all that apply.
                </p>
              )}

              <div className="mt-4 flex flex-col gap-2 py-4">
                {q.type === "INTEGER" ? (
                  <label className="flex max-w-xs flex-col gap-2">
                    <span className="text-sm font-semibold text-muted">
                      Enter your answer (numeric)
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={typeof picked === "number" ? String(picked) : ""}
                      onChange={(e) => setIntegerAnswer(e.target.value)}
                      placeholder="e.g. 42"
                      className="border border-subtle bg-white px-4 py-3 text-lg text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                    />
                  </label>
                ) : (
                  q.options.map((opt, i) => {
                    const key = q.optionKeys[i] ?? String(i);
                    const isMulti = q.type === "MSQ";
                    const isPicked = isMulti
                      ? Array.isArray(picked) && picked.includes(key)
                      : picked === key;
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={isPicked}
                        onClick={() =>
                          isMulti ? toggleOption(i) : selectOption(i)
                        }
                        className={`flex items-center gap-3 border p-4 text-left transition-colors ${
                          isPicked
                            ? "border-2 border-brand bg-brand-soft/20"
                            : "border-line bg-white hover:bg-surface"
                        }`}
                      >
                        <span
                          className={`flex size-[18px] shrink-0 items-center justify-center border ${
                            isMulti ? "rounded-[3px]" : "rounded-full"
                          } ${
                            isPicked
                              ? "border-brand bg-brand"
                              : "border-subtle bg-surface"
                          }`}
                        >
                          {isPicked &&
                            (isMulti ? (
                              <span className="text-[11px] font-bold leading-none text-white">
                                ✓
                              </span>
                            ) : (
                              <span className="size-1.5 rounded-full bg-white" />
                            ))}
                        </span>
                        <span
                          className={`text-base ${
                            isPicked
                              ? "font-semibold text-brand-indigo"
                              : "text-ink"
                          }`}
                        >
                          {opt}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="border-t border-line pt-4 text-xs font-semibold text-subtle">
                Question ID: {q.id}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-3 px-4 py-4">
            <button
              type="button"
              onClick={() => commitAndNext(false)}
              className="flex items-center gap-2 bg-success px-6 py-2 text-base uppercase text-white hover:opacity-95"
            >
              Save &amp; Next
              <ChevronRightIcon className="h-[7px] w-[4px]" />
            </button>
            <button
              type="button"
              onClick={clearResponse}
              className="border border-subtle bg-surface px-4 py-2 text-base uppercase text-ink hover:bg-fill"
            >
              Clear Response
            </button>
            <button
              type="button"
              onClick={() => commitAndNext(true)}
              className="bg-warn px-4 py-2 text-base uppercase text-white hover:opacity-95"
            >
              Save and Mark for Review
            </button>
            <button
              type="button"
              onClick={() => commitAndNext(true)}
              className="bg-info px-4 py-2 text-base uppercase text-white hover:opacity-95"
            >
              Mark for Review &amp; Next
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={goBack}
                disabled={current === 0}
                className="border border-subtle bg-surface px-5 py-2 text-base uppercase text-ink hover:bg-fill disabled:opacity-40"
              >
                Back
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={current === questions.length - 1}
                className="border border-subtle bg-surface px-5 py-2 text-base uppercase text-ink hover:bg-fill disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <div className="flex flex-col">
          <div className="min-h-0 flex-1 overflow-hidden">
            <ExamSidebar
              meta={meta}
              remaining={formatDuration(remainingSeconds)}
              timeLow={timeLow}
              subject={subject}
              onSubjectChange={selectSubject}
              subjects={subjects}
              questions={questions.map((x) => ({
                id: x.id,
                subject: x.subject,
                stem: x.stem,
                options: x.options,
                positiveMarks: x.positiveMarks,
                negativeMarks: x.negativeMarks,
              }))}
              statuses={statuses}
              currentIndex={current}
              onSelect={visit}
            />
          </div>
          <div className="w-[360px] shrink-0 border-l border-t border-line bg-surface-2 p-3">
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="w-full bg-success px-6 py-3 text-base font-bold uppercase text-white hover:opacity-95"
            >
              Submit Exam
            </button>
          </div>
        </div>
      </div>

      <footer className="flex h-10 shrink-0 items-center justify-between border-t border-line bg-fill px-6 text-xs text-muted">
        <span className="font-bold">
          © 2026 DRSK Assessment. Version 4.2.1-SECURE
        </span>
        <div className="flex gap-4 font-semibold">
          <span>Official Disclaimer</span>
          <span className="text-line">|</span>
          <span>Privacy Policy</span>
          <span className="text-line">|</span>
          <span>Support Contact</span>
        </div>
      </footer>

      {proctoring.warning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-md border-2 border-alert bg-white p-6 shadow-lg">
            <h3 className="flex items-center gap-2 text-lg font-bold text-alert">
              <LockClosedIcon className="h-5 w-4" />
              Proctoring Alert
            </h3>
            <p className="mt-2 text-sm text-ink">{proctoring.warning}</p>
            <button
              type="button"
              onClick={proctoring.dismissWarning}
              className="mt-6 w-full rounded bg-brand px-6 py-2.5 text-sm font-bold uppercase text-white hover:opacity-95"
            >
              Return to Exam
            </button>
          </div>
        </div>
      )}

      {confirmOpen && (
        <SubmitConfirmModal
          summary={submitSummary}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={onSubmit}
        />
      )}
    </div>
  );
}

/** An answer in the exact shape the backend scores against. */
type Answer = string | number | string[];

function isBlank(a: Answer | null): boolean {
  return a === null || (Array.isArray(a) && a.length === 0) || a === "";
}

/**
 * Coerce a persisted answer into the canonical shape for its question type.
 * Answers are stored as option KEYS ("A".."D") for MCQ/MSQ and as a number for
 * INTEGER; rows written by older builds may hold option text, which we map back
 * to its key so a resumed attempt still highlights correctly.
 */
function normalizeAnswer(
  q: {
    type: "MCQ" | "MSQ" | "INTEGER";
    options: string[];
    optionKeys: string[];
  },
  answer: string | number | string[] | null,
): Answer | null {
  if (answer === null || answer === undefined) return null;

  const toKey = (v: string | number): string | null => {
    const s = String(v);
    if (q.optionKeys.includes(s)) return s;
    const byText = q.options.indexOf(s);
    if (byText >= 0) return q.optionKeys[byText] ?? null;
    const asIndex = Number(s);
    if (Number.isInteger(asIndex) && q.optionKeys[asIndex])
      return q.optionKeys[asIndex];
    return null;
  };

  if (q.type === "INTEGER") {
    const n = Number(answer);
    return Number.isFinite(n) ? n : null;
  }
  if (q.type === "MSQ") {
    const list = Array.isArray(answer) ? answer : [answer];
    const keys = list
      .map(toKey)
      .filter((k): k is string => k !== null)
      .sort();
    return keys.length > 0 ? keys : null;
  }
  return Array.isArray(answer)
    ? (toKey(answer[0] ?? "") ?? null)
    : toKey(answer);
}

function mapStatus(r: AttemptResponse | undefined): QuestionStatus {
  if (!r) return "not-visited";
  switch (r.status) {
    case "ANSWERED":
      return "answered";
    case "MARKED":
      return "marked";
    case "ANSWERED_MARKED":
      return "answered-marked";
    case "NOT_ANSWERED":
      return "not-answered";
    default:
      return "not-visited";
  }
}

function ToolLink({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 rounded-[2px] px-2 py-1 text-base text-muted hover:bg-fill"
    >
      {icon}
      {label}
    </button>
  );
}

function MarkChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "pos" | "neg";
}) {
  return (
    <span className="border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted">
      {label}{" "}
      <span
        className={
          tone === "pos" ? "font-bold text-success" : "font-bold text-danger"
        }
      >
        {value}
      </span>
    </span>
  );
}
