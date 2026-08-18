"use client";

import Link from "next/link";

import { StudentShell } from "@/components/student/student-shell";
import {
  ArrowRightIcon,
  BarChartIcon,
  CalendarIcon,
  ClockIcon,
  FlaskIcon,
  LockIcon,
  PlayIcon,
  TimerIcon,
  TrophyIcon,
} from "@/components/student/icons";
import { useExamSchedule } from "@/hooks/use-exam-schedule";
import type { AvailableExam, UpcomingExam } from "@/lib/student";
import type { ComponentType, SVGProps } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;
type Status = "live" | "upcoming" | "missed";

interface MockTest {
  status: Status;
  title: string;
  scope: string;
  icon: IconType;
  meta: { icon: IconType; text: string }[];
  cta: string;
  href?: string;
  disabled?: boolean;
}

function describeWindow(exam: AvailableExam): string {
  const start = new Date(exam.startAt);
  const end = new Date(exam.endAt);
  const fmt = (d: Date) =>
    d.toLocaleString([], {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });
  return `Window: ${fmt(start)} - ${fmt(end)}`;
}

function liveFromAvailable(exam: AvailableExam): MockTest {
  return {
    status: "live",
    title: exam.title,
    scope: "Full Syllabus",
    icon: FlaskIcon,
    meta: [
      { icon: ClockIcon, text: describeWindow(exam) },
      { icon: TimerIcon, text: `Duration: ${exam.durationMinutes} minutes` },
      { icon: TrophyIcon, text: "Live now" },
    ],
    cta: exam.attempt
      ? exam.attempt.status === "IN_PROGRESS"
        ? "Resume"
        : "View Summary"
      : "Join Now",
    href: `/student/exam/instructions?examId=${exam.id}`,
  };
}

function upcomingFromSchedule(exam: UpcomingExam): MockTest {
  const start = new Date(exam.startAt);
  return {
    status: "upcoming",
    title: exam.title,
    scope: "Full Syllabus",
    icon: TrophyIcon,
    meta: [
      {
        icon: CalendarIcon,
        text: `Opens: ${start.toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}`,
      },
      { icon: TimerIcon, text: `Duration: ${exam.durationMinutes} minutes` },
    ],
    cta: "Not yet open",
    disabled: true,
  };
}

const BADGE: Record<Status, { label: string; className: string }> = {
  live: {
    label: "● LIVE NOW",
    className: "bg-admin/10 text-admin",
  },
  upcoming: {
    label: "UPCOMING",
    className: "bg-admin-bg text-admin-muted",
  },
  missed: {
    label: "MISSED",
    className: "bg-[#ba1a1a]/10 text-[#ba1a1a]",
  },
};

export default function FullMockTestsPage() {
  const { live, upcoming, loading, error } = useExamSchedule();
  const liveCards = live.map(liveFromAvailable);
  const upcomingCards = upcoming.map(upcomingFromSchedule);
  const cards: MockTest[] = [...liveCards, ...upcomingCards];

  return (
    <StudentShell
      breadcrumb={[
        { label: "Exams", href: "/student/exams" },
        "Full Mock Tests",
      ]}
    >
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          Full Mock Tests
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          You&apos;ve got this. Review your upcoming schedule and join active
          tests when you&apos;re ready.
        </p>
        {error && (
          <p className="mt-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            Couldn&apos;t load live exams: {error}
          </p>
        )}
      </header>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-2xl border border-admin-line/40 bg-white"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((test, i) => (
            <TestCard key={`${test.title}-${i}`} test={test} />
          ))}
          {cards.length === 0 && (
            <div className="rounded-2xl border border-dashed border-admin-line bg-admin/[0.03] p-6 text-sm text-admin-muted md:col-span-2">
              No upcoming exams scheduled yet. Your institute will publish them
              here once they&apos;re ready.
            </div>
          )}
        </div>
      )}
    </StudentShell>
  );
}

function TestCard({ test }: { test: MockTest }) {
  const Icon = test.icon;
  const badge = BADGE[test.status];
  const cta = (
    <div
      className={`flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold ${
        test.status === "live"
          ? "bg-admin text-white hover:opacity-95"
          : test.status === "missed"
            ? "border border-admin-line text-admin-ink hover:bg-admin-bg"
            : "cursor-not-allowed bg-admin-bg text-admin-muted"
      }`}
    >
      {test.status === "live" ? (
        <PlayIcon className="size-4" />
      ) : test.status === "missed" ? (
        <BarChartIcon className="size-4" />
      ) : (
        <LockIcon className="size-4" />
      )}
      {test.cta}
      {test.status === "live" && <ArrowRightIcon className="size-4" />}
    </div>
  );

  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)] ${
        test.status === "live"
          ? "border-t-4 border-t-admin border-x-admin-line/40 border-b-admin-line/40"
          : "border-admin-line/40"
      }`}
    >
      {test.status === "live" && (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-8 size-40 rounded-full bg-admin/5 blur-2xl"
        />
      )}
      <div className="relative flex items-start justify-between">
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${badge.className}`}
        >
          {badge.label}
        </span>
        <span className="flex size-9 items-center justify-center rounded-full bg-admin-surface text-admin-muted">
          <Icon className="size-5" />
        </span>
      </div>

      <h2 className="relative mt-3 text-lg font-bold text-admin-ink">
        {test.title}
      </h2>
      <p className="relative text-sm text-admin-muted">{test.scope}</p>

      <div className="relative mt-4 space-y-2">
        {test.meta.map((m) => {
          const MetaIcon = m.icon;
          return (
            <p
              key={m.text}
              className="flex items-center gap-2 text-sm text-admin-muted"
            >
              <MetaIcon className="size-4 shrink-0 text-admin-muted" />
              {m.text}
            </p>
          );
        })}
      </div>

      <div className="relative mt-5">
        {test.href && !test.disabled ? (
          <Link href={test.href}>{cta}</Link>
        ) : (
          cta
        )}
      </div>
    </article>
  );
}
