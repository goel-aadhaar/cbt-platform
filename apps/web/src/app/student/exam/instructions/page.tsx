"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import {
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  TimerIcon,
  XCircleIcon,
} from "@/components/student/icons";
import { useAvailableExams } from "@/hooks/use-available-exams";
import { getEntry, requestEntry, type EntryRequest } from "@/lib/student";

/**
 * Genuinely exam-agnostic platform behavior (true for every exam on this
 * platform) — anything exam-SPECIFIC (marking scheme, allowed materials,
 * section rules) belongs in the teacher's own `instructions`, rendered below
 * these, not fabricated here. Previously this whole screen was hardcoded
 * placeholder text (a fake "3 hours" / "+4/-1 marks") that ignored the real
 * exam entirely — that generic content used to live in this same array.
 */
const PLATFORM_RULES: React.ReactNode[] = [
  <>
    You can navigate freely between sections and individual questions using the
    question palette provided in the side panel during the exam.
  </>,
  <>
    <strong>Warning:</strong> Do not refresh the page or attempt to open new
    tabs during the active examination session. Doing so may result in automatic
    submission or termination of your test.
  </>,
  <>
    The exam will auto-submit exactly when the timer hits zero. Any selected
    answers at that moment will be recorded automatically.
  </>,
];

/** How often the waiting screen checks whether an admin has decided yet. */
const POLL_MS = 4000;

type Phase =
  "idle" | "requesting" | "waiting" | "approved" | "denied" | "error";

export default function ExamInstructionsPage() {
  return (
    <Suspense fallback={null}>
      <ExamInstructionsInner />
    </Suspense>
  );
}

function ExamInstructionsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const examId = params.get("examId");
  // Which list to search for this exam (§ Assessments) — an assessment's id
  // only exists in the ASSESSMENT-scoped list, never the default Mock Test
  // one, so this has to travel with the link that brought the student here.
  const kind = params.get("kind") === "ASSESSMENT" ? "ASSESSMENT" : undefined;
  const [agreed, setAgreed] = useState(false);
  const { items } = useAvailableExams(kind);
  const exam = items.find((e) => e.id === examId);

  const [phase, setPhase] = useState<Phase>("idle");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [denialReason, setDenialReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  /**
   * Applies whatever the server just said about this attempt (§ exam entry
   * approval) — shared by the initial request and every poll tick after it.
   */
  const applyEntry = useCallback(
    (entry: EntryRequest) => {
      setAttemptId(entry.id);
      switch (entry.status) {
        case "PENDING_APPROVAL":
          setPhase("waiting");
          break;
        case "APPROVED":
          stopPolling();
          setPhase("approved");
          break;
        case "DENIED":
          stopPolling();
          setDenialReason(entry.denialReason);
          setPhase("denied");
          break;
        case "IN_PROGRESS":
          // Already running — a reconnect mid-exam. The clock started once;
          // straight back into it, no waiting room.
          stopPolling();
          router.replace(`/exam?attemptId=${entry.id}`);
          break;
        default:
          // SUBMITTED / AUTO_SUBMITTED / ABANDONED — nothing left to request.
          stopPolling();
          setError("This exam has already been completed.");
          setPhase("error");
      }
    },
    [router, stopPolling],
  );

  const startPolling = useCallback(
    (id: string) => {
      stopPolling();
      pollRef.current = setInterval(() => {
        getEntry(id)
          .then(applyEntry)
          .catch((e: unknown) => {
            stopPolling();
            setError(
              e instanceof Error
                ? e.message
                : "Could not check your approval status.",
            );
            setPhase("error");
          });
      }, POLL_MS);
    },
    [applyEntry, stopPolling],
  );

  const requestToEnter = useCallback(() => {
    if (!examId) return;
    setError(null);
    setPhase("requesting");
    requestEntry(examId)
      .then((entry) => {
        applyEntry(entry);
        if (entry.status === "PENDING_APPROVAL") startPolling(entry.id);
      })
      .catch((e: unknown) => {
        setError(
          e instanceof Error
            ? e.message
            : "Could not request entry into this exam.",
        );
        setPhase("error");
      });
  }, [examId, applyEntry, startPolling]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-admin-bg px-4 py-4 [font-family:var(--font-hanken)] text-admin-ink [@media(min-height:900px)]:py-10">
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-admin-line/40 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
        {/* Header */}
        <div className="border-b border-admin-line/40 px-8 py-5 text-center [@media(min-height:900px)]:py-8">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-[#3b82f6]/30 bg-[#dbeafe] text-[#1d4ed8]">
            <TimerIcon className="size-7" />
          </span>
          <h1 className="mx-auto mt-4 max-w-md text-3xl font-bold tracking-tight text-admin-ink">
            Instructions{exam?.title ? `: ${exam.title}` : ""}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-admin-muted">
            Please read the following rules carefully before commencing your
            examination. Adherence to these guidelines is strictly monitored.
          </p>
          {exam && (
            <p className="mx-auto mt-3 max-w-md text-sm font-semibold text-admin-ink">
              Duration: {exam.durationMinutes} minutes
            </p>
          )}
        </div>

        <div className="max-h-[55vh] overflow-auto px-8 py-5 [@media(min-height:900px)]:py-8">
          {/* The teacher's own instructions for this exam (§2.3) — sanitized
              server-side (apps/api/src/common/html/sanitize-html.ts), same
              render treatment as the in-exam "Instructions" button. */}
          <section className="mb-6">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-admin-muted">
              Exam Instructions
            </p>
            {exam?.instructions ? (
              <div
                className="whitespace-pre-line rounded-xl border border-admin-line/40 bg-admin-bg/40 p-4 text-sm leading-relaxed text-admin-ink [&_a]:text-admin [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-admin-line [&_blockquote]:pl-3 [&_blockquote]:text-admin-muted [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                dangerouslySetInnerHTML={{ __html: exam.instructions }}
              />
            ) : (
              <p className="rounded-xl border border-dashed border-admin-line/60 p-4 text-sm text-admin-muted">
                No special instructions were set for this exam.
              </p>
            )}
          </section>

          {/* Platform rules */}
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-admin-muted">
              Platform Rules
            </p>
            <ol className="space-y-3 [@media(min-height:900px)]:space-y-5">
              {PLATFORM_RULES.map((rule, i) => (
                <li key={i} className="flex gap-4">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-admin-line text-sm font-semibold text-admin-muted">
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-admin-ink">
                    {rule}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Footer — the entry-approval flow (§ exam entry approval) lives
            entirely in this strip: request → wait → approved/denied. */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-admin-line/40 px-8 py-6 sm:flex-row">
          {phase === "idle" ? (
            <>
              <label className="flex cursor-pointer items-center gap-3 text-sm text-admin-ink">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="size-5 accent-admin"
                />
                I have read and understood the instructions
              </label>
              <button
                type="button"
                disabled={!agreed || !examId}
                onClick={requestToEnter}
                className="flex items-center justify-center gap-2 rounded-xl bg-admin px-8 py-3.5 text-sm font-bold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Request to Enter Exam
                <ArrowRightIcon className="size-4" />
              </button>
            </>
          ) : (
            <EntryStatusPanel
              phase={phase}
              error={error}
              denialReason={denialReason}
              onProceed={() =>
                attemptId && router.push(`/exam?attemptId=${attemptId}`)
              }
              onRetry={requestToEnter}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** The right-hand strip once "Request to Enter Exam" has been clicked. */
function EntryStatusPanel({
  phase,
  error,
  denialReason,
  onProceed,
  onRetry,
}: {
  phase: Phase;
  error: string | null;
  denialReason: string | null;
  onProceed: () => void;
  onRetry: () => void;
}) {
  if (phase === "requesting" || phase === "waiting") {
    return (
      <div className="flex w-full items-center justify-center gap-3 rounded-xl bg-admin-bg/60 px-6 py-4">
        <ClockIcon className="size-5 shrink-0 animate-pulse text-admin" />
        <div>
          <p className="text-sm font-semibold text-admin-ink">
            {phase === "requesting"
              ? "Sending your request…"
              : "Waiting for admin approval…"}
          </p>
          <p className="text-xs text-admin-muted">
            You&apos;ll be able to start the moment an admin lets you in. No
            need to refresh this page.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "approved") {
    return (
      <div className="flex w-full flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-3">
          <CheckCircleIcon className="size-5 shrink-0 text-success" />
          <p className="text-sm font-semibold text-admin-ink">
            You&apos;re approved — the timer starts once you click Start Exam.
          </p>
        </div>
        <button
          type="button"
          onClick={onProceed}
          className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-admin px-8 py-3.5 text-sm font-bold text-white transition-opacity hover:opacity-95"
        >
          Start Exam
          <ArrowRightIcon className="size-4" />
        </button>
      </div>
    );
  }

  if (phase === "denied") {
    return (
      <div className="flex w-full flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-start gap-3">
          <XCircleIcon className="size-5 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-semibold text-admin-ink">
              Your entry request was declined.
            </p>
            {denialReason && (
              <p className="mt-0.5 text-xs text-admin-muted">{denialReason}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-admin-line px-6 py-3 text-sm font-bold text-admin hover:bg-admin/5"
        >
          Request Again
        </button>
      </div>
    );
  }

  // phase === "error"
  return (
    <div className="flex w-full flex-col items-center justify-between gap-4 sm:flex-row">
      <p className="text-sm font-semibold text-danger">
        {error ?? "Something went wrong. Please try again."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-admin-line px-6 py-3 text-sm font-bold text-admin hover:bg-admin/5"
      >
        Try Again
      </button>
    </div>
  );
}
