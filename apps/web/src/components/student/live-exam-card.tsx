"use client";

import Link from "next/link";

import { useAvailableExams } from "@/hooks/use-available-exams";

import { ArrowRightIcon, ClockIcon, PlayIcon } from "./icons";

function timeRange(startAt: string, endAt: string): string {
  const t = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  return `Today, ${t(startAt)} - ${t(endAt)}`;
}

/**
 * "Join the Live Mock Test" hero card. Reads GET /attempts/available so the
 * CTA can deep-link straight into the instructions screen for the exam the
 * student is actually eligible to sit right now.
 */
export function LiveExamCard() {
  const { items, loading } = useAvailableExams();
  const live = items[0] ?? null;

  const href = live
    ? `/student/exam/instructions?examId=${live.id}`
    : "/student/exams/mock";

  const resumable = live?.attempt?.status === "IN_PROGRESS";
  const done = live?.attempt != null && live.attempt.status !== "IN_PROGRESS";

  return (
    <article className="flex flex-col rounded-xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
      <span className="flex size-12 items-center justify-center rounded-full bg-admin-2 text-white">
        <PlayIcon className="size-5" />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-admin-ink">
        {live ? "Join the Live Mock Test" : "No live exam right now"}
      </h3>
      <p className="mt-1 text-sm text-admin-muted">
        {loading
          ? "Checking for live exams…"
          : (live?.title ?? "Browse the schedule to see what's coming up.")}
      </p>
      {live && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-admin-muted">
          <ClockIcon className="size-3.5" />
          {timeRange(live.startAt, live.endAt)}
        </p>
      )}
      <Link
        href={href}
        className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-admin px-4 py-3 text-base font-bold text-white hover:opacity-95"
      >
        {done
          ? "View Summary"
          : resumable
            ? "Resume Test"
            : live
              ? "Start Mock Test"
              : "Browse Mock Tests"}
        <ArrowRightIcon className="size-4" />
      </Link>
    </article>
  );
}
