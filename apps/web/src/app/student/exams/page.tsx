"use client";

import Link from "next/link";

import { StudentShell } from "@/components/student/student-shell";
import {
  ArrowRightIcon,
  BookOpenIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
} from "@/components/student/icons";
import { useAvailableExams } from "@/hooks/use-available-exams";
import { useMyAttempts } from "@/hooks/use-my-attempts";
import { usePracticeFacets } from "@/hooks/use-practice";
import { hasSatExam, type MyAttempt } from "@/lib/student";
import type { ComponentType, SVGProps } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function StudentExamsPage() {
  const { items: available, loading: loadingExams } = useAvailableExams();
  const { items: attempts, loading: loadingHistory } = useMyAttempts();
  const { data: facets } = usePracticeFacets();

  const live = available.find((e) => e.attempt?.status !== "SUBMITTED") ?? null;
  const resumable = available.find((e) => e.attempt?.status === "IN_PROGRESS");

  // Everything the student has actually sat — published AND awaiting results.
  const sat = attempts.filter(hasSatExam);
  const published = sat.filter((a) => a.result !== null);
  const pendingCount = sat.length - published.length;

  const best = published.reduce<MyAttempt | null>(
    (top, a) =>
      top === null ||
      a.result!.totalScore / a.result!.maxScore >
        top.result!.totalScore / top.result!.maxScore
        ? a
        : top,
    null,
  );

  return (
    <StudentShell breadcrumb={["Exams"]}>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          Exams
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          Take a full mock test or sharpen specific topics. Your personalized
          practice environment.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <HeroCard
          icon={FileTextIcon}
          title="Full Mock Tests"
          description="Simulate the real exam — timed, full-syllabus tests based on latest patterns."
          stat={
            loadingHistory
              ? "Loading your results…"
              : sat.length === 0
                ? "No completed tests yet"
                : `${sat.length} test${sat.length === 1 ? "" : "s"} completed${
                    best
                      ? ` · Best: ${Math.round((best.result!.totalScore / best.result!.maxScore) * 100)}%`
                      : ""
                  }${pendingCount > 0 ? ` · ${pendingCount} awaiting results` : ""}`
          }
          ctaLabel="Browse Mock Tests"
          ctaHref="/student/exams/mock"
          variant="solid"
        />
        <HeroCard
          icon={BookOpenIcon}
          title="Practice Library"
          description="Practice by subject, chapter, or topic at your own pace to strengthen weak areas."
          stat={
            facets
              ? `${facets.total} question${facets.total === 1 ? "" : "s"} across ${facets.subjects.length} subject${facets.subjects.length === 1 ? "" : "s"}`
              : "Loading your library…"
          }
          ctaLabel="Start Practicing"
          ctaHref="/student/practice"
          variant="muted"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.6fr]">
        {/* Live / resumable exam */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-admin-ink">
            {resumable ? "Continue Where You Left Off" : "Available Now"}
          </h2>
          <div className="rounded-xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
            {loadingExams ? (
              <div className="h-32 animate-pulse rounded-lg bg-admin-line/10" />
            ) : live === null ? (
              <>
                <p className="text-base font-semibold text-admin-ink">
                  No live exam right now
                </p>
                <p className="mt-1 text-sm text-admin-muted">
                  When your institute starts an exam you&apos;re assigned to,
                  it&apos;ll appear here.
                </p>
                <Link
                  href="/student/practice"
                  className="mt-4 flex items-center justify-center rounded-lg border border-admin-line py-2.5 text-sm font-bold text-admin hover:bg-admin/5"
                >
                  Practise instead
                </Link>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <span className="rounded bg-admin-surface px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-admin-muted">
                    {live.attempt?.status === "IN_PROGRESS"
                      ? "In progress"
                      : "Live now"}
                  </span>
                  <FileTextIcon className="size-5 text-admin-muted" />
                </div>
                <p className="mt-3 text-base font-semibold text-admin-ink">
                  {live.title}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-admin-muted">
                  <ClockIcon className="size-3.5" />
                  {live.durationMinutes} minutes · closes{" "}
                  {new Date(live.endAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <Link
                  href={`/student/exam/instructions?examId=${live.id}`}
                  className="mt-4 flex items-center justify-center rounded-lg bg-admin py-2.5 text-sm font-bold text-white hover:opacity-95"
                >
                  {live.attempt?.status === "IN_PROGRESS"
                    ? "Resume Test"
                    : "Start Test"}
                </Link>
              </>
            )}
          </div>
        </section>

        {/* Real completed tests */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-admin-ink">
              Recent Completed Tests
            </h2>
            <Link
              href="/student/reports"
              className="flex items-center gap-0.5 text-sm font-semibold text-admin hover:underline"
            >
              View All <ChevronRightIcon className="size-4" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-admin-line/40 bg-white shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-admin-line/40 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
              <span>Test Name</span>
              <span className="text-right">Score</span>
              <span className="w-28">Date</span>
            </div>

            {loadingHistory ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-8 animate-pulse rounded bg-admin-line/10"
                  />
                ))}
              </div>
            ) : sat.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-admin-muted">
                Nothing here yet. Results appear once your institute publishes
                them.
              </p>
            ) : (
              sat.slice(0, 5).map((a) => (
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
                        Pending
                      </span>
                    )}
                  </span>
                  <span className="w-28 text-sm text-admin-muted">
                    {/* Non-null: `sat` excludes every status without a real
                        submittedAt/startedAt. */}
                    {formatDate(a.submittedAt ?? a.startedAt!)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </StudentShell>
  );
}

function HeroCard({
  icon: Icon,
  title,
  description,
  stat,
  ctaLabel,
  ctaHref,
  variant,
}: {
  icon: IconType;
  title: string;
  description: string;
  stat: string;
  ctaLabel: string;
  ctaHref: string;
  variant: "solid" | "muted";
}) {
  const solid = variant === "solid";
  return (
    <article
      className={`flex flex-col rounded-xl p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)] ${
        solid ? "bg-admin text-white" : "border border-admin-line/40 bg-white"
      }`}
    >
      <span
        className={`flex size-12 items-center justify-center rounded-full ${
          solid ? "bg-white/15 text-white" : "bg-admin/10 text-admin"
        }`}
      >
        <Icon className="size-6" />
      </span>
      <h3
        className={`mt-4 text-lg font-semibold ${solid ? "text-white" : "text-admin-ink"}`}
      >
        {title}
      </h3>
      <p
        className={`mt-1 text-sm ${solid ? "text-white/80" : "text-admin-muted"}`}
      >
        {description}
      </p>
      <p
        className={`mt-3 text-xs font-semibold ${solid ? "text-white/70" : "text-admin-muted"}`}
      >
        {stat}
      </p>
      <Link
        href={ctaHref}
        className={`mt-5 flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-bold ${
          solid
            ? "bg-white text-admin hover:bg-white/90"
            : "bg-admin text-white hover:opacity-95"
        }`}
      >
        {ctaLabel}
        <ArrowRightIcon className="size-4" />
      </Link>
    </article>
  );
}
