"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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
import { useCountdown } from "@/hooks/use-countdown";
import { useProctoring } from "@/hooks/use-proctoring";
import {
  buildExamQuestions,
  EXAM_META,
  formatDuration,
  type QuestionStatus,
  type Subject,
} from "@/lib/exam-data";

export default function ExamPage() {
  const [started, setStarted] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) return <SubmittedScreen />;
  if (!started) return <StartGate onStart={() => setStarted(true)} />;
  return <ExamRunner onSubmit={() => setSubmitted(true)} />;
}

/* ------------------------------------------------------------------ */
/* Pre-exam gate — requests fullscreen from a real user gesture.       */
/* ------------------------------------------------------------------ */
function StartGate({ onStart }: { onStart: () => void }) {
  async function handleStart() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen may be blocked; proceed anyway — proctoring will nudge.
    }
    onStart();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="w-full max-w-lg border border-line bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-brand">{EXAM_META.examName}</h1>
        <p className="mt-1 text-sm text-muted">
          {EXAM_META.paper} · Candidate {EXAM_META.candidateName} (
          {EXAM_META.candidateId})
        </p>
        <ul className="mt-6 space-y-2 text-sm text-ink">
          <li>
            • The exam runs in full-screen mode and is time-bound (3 hours).
          </li>
          <li>
            • Switching tabs or leaving full-screen is recorded as a violation.
            After {EXAM_META.maxViolations} violations the exam auto-submits.
          </li>
          <li>• Do not refresh or close the browser during the exam.</li>
        </ul>
        <button
          type="button"
          onClick={handleStart}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded bg-brand px-6 py-3 text-sm font-bold uppercase text-white hover:opacity-95"
        >
          <MaximizeIcon className="size-4" />
          Start Exam in Full Screen
        </button>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Post-submit confirmation.                                           */
/* ------------------------------------------------------------------ */
function SubmittedScreen() {
  const router = useRouter();
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="w-full max-w-md border border-line bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-success">Exam Submitted</h1>
        <p className="mt-2 text-sm text-muted">
          Your responses have been recorded. You may now close this window.
        </p>
        <button
          type="button"
          onClick={() => router.replace("/dashboard")}
          className="mt-6 rounded bg-brand px-6 py-2.5 text-sm font-bold uppercase text-white hover:opacity-95"
        >
          Back to Dashboard
        </button>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* The running exam.                                                    */
/* ------------------------------------------------------------------ */
function ExamRunner({ onSubmit }: { onSubmit: () => void }) {
  const questions = useMemo(() => buildExamQuestions(), []);

  const [current, setCurrent] = useState(0);
  const [selection, setSelection] = useState<(number | null)[]>(() =>
    questions.map(() => null),
  );
  const [statuses, setStatuses] = useState<QuestionStatus[]>(() =>
    questions.map((_, i) => (i === 0 ? "not-answered" : "not-visited")),
  );

  const remainingSeconds = useCountdown(EXAM_META.durationSeconds, onSubmit);
  const proctoring = useProctoring({
    maxViolations: EXAM_META.maxViolations,
    enabled: true,
    onLimitReached: onSubmit,
  });

  const q = questions[current];
  const subject = q.subject;
  const picked = selection[current];

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

  function selectOption(i: number) {
    setSelection((prev) => prev.map((v, idx) => (idx === current ? i : v)));
  }

  function clearResponse() {
    setSelection((prev) => prev.map((v, idx) => (idx === current ? null : v)));
    setStatuses((prev) =>
      prev.map((s, i) =>
        i === current
          ? s === "answered" || s === "answered-marked"
            ? "not-answered"
            : s
          : s,
      ),
    );
  }

  /** Commit the current question's status, then advance. */
  function commitAndNext(mark: boolean) {
    setStatuses((prev) =>
      prev.map((s, i) => {
        if (i !== current) return s;
        const answered = selection[current] != null;
        if (mark) return answered ? "answered-marked" : "marked";
        return answered ? "answered" : "not-answered";
      }),
    );
    goNext();
  }

  function selectSubject(s: Subject) {
    const first = questions.findIndex((x) => x.subject === s);
    if (first >= 0) visit(first);
  }

  const timeLow = remainingSeconds <= 5 * 60;
  const localNumber =
    questions.slice(0, current).filter((x) => x.subject === subject).length + 1;

  return (
    <div className="flex h-screen flex-col bg-surface">
      {/* Header */}
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
              Warning {proctoring.violations}/{EXAM_META.maxViolations}{" "}
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
              onClick={onSubmit}
              className="rounded-[2px] bg-brand-indigo px-4 py-1.5 text-base uppercase text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex min-h-0 flex-1">
        {/* Left: question panel */}
        <section className="flex min-w-0 flex-1 flex-col border-r border-line bg-white">
          {/* Section header / marking scheme */}
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold text-ink">Section:</span>
              <span className="font-semibold text-brand">
                {subject} - Section A
              </span>
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

          {/* Scrollable question content */}
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

              {q.imageUrl && (
                <div className="mt-4 flex justify-center border border-line bg-surface-3 p-4">
                  <Image
                    src={q.imageUrl}
                    alt="Question figure"
                    width={520}
                    height={280}
                    className="h-auto max-w-full"
                  />
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2 py-4">
                {q.options.map((opt, i) => {
                  const isPicked = picked === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectOption(i)}
                      className={`flex items-center gap-3 border p-4 text-left transition-colors ${
                        isPicked
                          ? "border-2 border-brand bg-brand-soft/20"
                          : "border-line bg-white hover:bg-surface"
                      }`}
                    >
                      <span
                        className={`flex size-[18px] shrink-0 items-center justify-center rounded-full border ${
                          isPicked
                            ? "border-brand bg-brand"
                            : "border-subtle bg-surface"
                        }`}
                      >
                        {isPicked && (
                          <span className="size-1.5 rounded-full bg-white" />
                        )}
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
                })}
              </div>

              <div className="border-t border-line pt-4 text-xs font-semibold text-subtle">
                Question ID: {q.id}
              </div>
            </div>
          </div>

          {/* Action bar */}
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

        {/* Right: sidebar */}
        <div className="flex flex-col">
          <div className="min-h-0 flex-1 overflow-hidden">
            <ExamSidebar
              meta={EXAM_META}
              remaining={formatDuration(remainingSeconds)}
              timeLow={timeLow}
              subject={subject}
              onSubjectChange={selectSubject}
              questions={questions}
              statuses={statuses}
              currentIndex={current}
              onSelect={visit}
            />
          </div>
          <div className="w-[360px] shrink-0 border-l border-t border-line bg-surface-2 p-3">
            <button
              type="button"
              onClick={onSubmit}
              className="w-full bg-success px-6 py-3 text-base font-bold uppercase text-white hover:opacity-95"
            >
              Submit Exam
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
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

      {/* Proctoring warning modal */}
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
    </div>
  );
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
