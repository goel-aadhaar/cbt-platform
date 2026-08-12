"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { ArrowRightIcon, TimerIcon } from "@/components/student/icons";
import { useAvailableExams } from "@/hooks/use-available-exams";

const RULES: React.ReactNode[] = [
  <>
    Total duration of the examination is <strong>3 hours</strong> (180 minutes).
    The timer will begin immediately upon starting the exam.
  </>,
  <>
    Each correct answer carries <Chip>+4 marks</Chip>.
  </>,
  <>
    There is a negative marking of <Chip>-1 mark</Chip> for every incorrect
    answer. Unattempted questions will not affect your score.
  </>,
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
  const [agreed, setAgreed] = useState(false);
  const { items } = useAvailableExams();
  const examTitle = items.find((e) => e.id === examId)?.title ?? "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-admin-bg px-4 py-4 [font-family:var(--font-hanken)] text-admin-ink [@media(min-height:900px)]:py-10">
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-admin-line/40 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
        {/* Header */}
        <div className="border-b border-admin-line/40 px-8 py-5 text-center [@media(min-height:900px)]:py-8">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-[#3b82f6]/30 bg-[#dbeafe] text-[#1d4ed8]">
            <TimerIcon className="size-7" />
          </span>
          <h1 className="mx-auto mt-4 max-w-md text-3xl font-bold tracking-tight text-admin-ink">
            Instructions{examTitle ? `: ${examTitle}` : ""}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-admin-muted">
            Please read the following rules carefully before commencing your
            examination. Adherence to these guidelines is strictly monitored.
          </p>
        </div>

        {/* Rules */}
        <ol className="space-y-3 px-8 py-5 [@media(min-height:900px)]:space-y-5 [@media(min-height:900px)]:py-8">
          {RULES.map((rule, i) => (
            <li key={i} className="flex gap-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-admin-line text-sm font-semibold text-admin-muted">
                {i + 1}
              </span>
              <p className="text-sm leading-relaxed text-admin-ink">{rule}</p>
            </li>
          ))}
        </ol>

        {/* Footer */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-admin-line/40 px-8 py-6 sm:flex-row">
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
            onClick={() =>
              router.push(`/exam?examId=${encodeURIComponent(examId!)}`)
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-admin px-8 py-3.5 text-sm font-bold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start Exam
            <ArrowRightIcon className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-admin-bg px-1.5 py-0.5 text-[0.85em] font-semibold text-admin-ink [font-family:var(--font-courier-prime)]">
      {children}
    </span>
  );
}
