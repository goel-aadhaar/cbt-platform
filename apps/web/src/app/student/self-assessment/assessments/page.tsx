"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StudentShell } from "@/components/student/student-shell";
import {
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
} from "@/components/student/icons";
import { useMyAttempts } from "@/hooks/use-my-attempts";
import {
  fetchExamSchedule,
  hasSatExam,
  type AvailableExam,
  type UpcomingExam,
} from "@/lib/student";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * My Assessments (§ Assessments), under Self Assessment. Same shape as
 * "Exams" (available now / upcoming / completed), but scoped to
 * `kind: "ASSESSMENT"` throughout and worded to match this workflow — a
 * student here was never waiting on anyone's approval to get in, so the
 * copy says so rather than reusing the Mock Test screen's language verbatim.
 */
export default function MyAssessmentsPage() {
  const [available, setAvailable] = useState<AvailableExam[] | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingExam[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const {
    items: attempts,
    loading: loadingHistory,
    error: historyError,
  } = useMyAttempts();

  useEffect(() => {
    let cancelled = false;
    fetchExamSchedule("ASSESSMENT")
      .then((res) => {
        if (cancelled) return;
        setAvailable(res.items);
        setUpcoming(res.upcoming);
        setScheduleError(null);
        setLoadingSchedule(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setScheduleError(
          e instanceof Error ? e.message : "Could not load assessments.",
        );
        setAvailable([]);
        setLoadingSchedule(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const completed = attempts
    .filter((a) => a.exam.kind === "ASSESSMENT")
    .filter(hasSatExam);

  return (
    <StudentShell breadcrumb={["Self Assessment", "My Assessments"]}>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          My Assessments
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          Set by your teachers, on their own schedule. You can enter the moment
          the window opens — no approval to wait on.
        </p>
      </header>

      {scheduleError && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {scheduleError}
        </p>
      )}

      {/* Available now */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-admin-ink">
          Available now
        </h2>
        {loadingSchedule ? (
          <div className="flex flex-col gap-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl bg-admin-line/10"
              />
            ))}
          </div>
        ) : (available ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed border-admin-line/60 bg-white p-6 text-center text-sm text-admin-muted">
            Nothing open right now. Check back once your teacher's window opens,
            or see what's coming up below.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(available ?? []).map((e) => {
              const inProgress = e.attempt?.status === "IN_PROGRESS";
              const done =
                e.attempt?.status === "SUBMITTED" ||
                e.attempt?.status === "AUTO_SUBMITTED";
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-admin/10 text-admin">
                      <CheckCircleIcon className="size-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-admin-ink">{e.title}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-admin-muted">
                        <ClockIcon className="size-3.5" />
                        {e.durationMinutes} min · window closes{" "}
                        {formatDateTime(e.endAt)}
                      </p>
                    </div>
                  </div>
                  {done ? (
                    <span className="rounded-full bg-admin-mint/50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-admin">
                      Submitted
                    </span>
                  ) : (
                    <Link
                      href={`/student/exam/instructions?examId=${e.id}&kind=ASSESSMENT`}
                      className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
                    >
                      {inProgress ? "Continue" : "Start"}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-admin-ink">
            Upcoming
          </h2>
          <ul className="flex flex-col gap-2">
            {upcoming.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-admin-line/40 bg-white px-5 py-4"
              >
                <div>
                  <p className="text-sm font-semibold text-admin-ink">
                    {e.title}
                  </p>
                  <p className="mt-0.5 text-xs text-admin-muted">
                    {e.durationMinutes} min · opens {formatDateTime(e.startAt)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-admin-surface px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-admin-muted">
                  Upcoming
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Completed */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-admin-ink">Completed</h2>
        {historyError && (
          <p className="mb-3 text-sm text-danger">{historyError}</p>
        )}
        <div className="overflow-hidden rounded-xl border border-admin-line/40 bg-white shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-admin-line/40 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
            <span>Assessment</span>
            <span className="text-right">Score</span>
            <span className="w-24 text-right">Result</span>
          </div>
          {loadingHistory ? (
            <div className="space-y-2 p-5">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-8 animate-pulse rounded bg-admin-line/10"
                />
              ))}
            </div>
          ) : completed.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-admin-muted">
              Nothing completed yet — assessments you've submitted will show up
              here as soon as the window closes.
            </p>
          ) : (
            completed.map((a) => (
              <Link
                key={a.id}
                href={`/student/results/${a.id}`}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-admin-line/20 px-5 py-4 last:border-b-0 hover:bg-admin/5"
              >
                <span className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-admin/10 text-admin">
                    <FileTextIcon className="size-4" />
                  </span>
                  <span className="text-sm font-medium text-admin-ink">
                    {a.exam.title}
                  </span>
                </span>
                <span className="text-right text-sm font-bold text-admin-ink">
                  {a.result ? (
                    <>
                      {a.result.totalScore}
                      <span className="font-normal text-admin-muted">
                        /{a.result.maxScore}
                      </span>
                    </>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                      Finalizing
                    </span>
                  )}
                </span>
                <span className="w-24 text-right text-xs font-semibold text-admin">
                  {a.result ? "View" : "—"}
                </span>
              </Link>
            ))
          )}
        </div>
      </section>
    </StudentShell>
  );
}
