"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Greeting } from "@/components/student/greeting";
import { LiveExamCard } from "@/components/student/live-exam-card";
import { StudentShell } from "@/components/student/student-shell";
import {
  ArrowRightIcon,
  BarChartIcon,
  BookOpenIcon,
  CalendarIcon,
  ClockIcon,
  FileTextIcon,
  PencilIcon,
  TrophyIcon,
} from "@/components/student/icons";
import { useExamSchedule } from "@/hooks/use-exam-schedule";
import { useMyAttempts } from "@/hooks/use-my-attempts";
import { usePracticeFacets } from "@/hooks/use-practice";
import { hasSatExam, type MyAttempt, type UpcomingExam } from "@/lib/student";
import type { ComponentType, SVGProps } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

interface Stat {
  label: string;
  value: string;
  /** Real supporting detail — no invented week-on-week deltas. */
  sub: string;
  /** Filled fraction of the mini bar, 0–100. */
  pct: number;
  /** Show a shimmer in place of the figure until its source has loaded. */
  loading: boolean;
  icon: IconType;
  iconBg: string;
  iconColor: string;
  barColor: string;
}

export default function StudentHomePage() {
  const { items: attempts, loading: loadingAttempts } = useMyAttempts();
  const { live, upcoming, loading: loadingSchedule } = useExamSchedule();
  const { data: facets } = usePracticeFacets();

  const sat = attempts.filter(hasSatExam);
  const scored = sat.filter((a) => a.result !== null);
  const pending = sat.length - scored.length;

  const pctOf = (a: MyAttempt) =>
    a.result!.maxScore > 0
      ? (a.result!.totalScore / a.result!.maxScore) * 100
      : 0;

  const avgPct = scored.length
    ? Math.round(scored.reduce((s, a) => s + pctOf(a), 0) / scored.length)
    : null;

  const bestPercentile = scored.reduce<number | null>((top, a) => {
    const p = a.result!.percentile;
    if (p === null) return top;
    return top === null || p > top ? p : top;
  }, null);

  const stats: Stat[] = [
    {
      label: "Mock Tests",
      value: loadingAttempts ? "—" : String(sat.length),
      sub:
        pending > 0 ? `${pending} awaiting results` : "all results published",
      pct: sat.length > 0 ? Math.min(100, sat.length * 10) : 0,
      loading: loadingAttempts,
      icon: FileTextIcon,
      iconBg: "#ede9fe",
      iconColor: "#8b5cf6",
      barColor: "#8b5cf6",
    },
    {
      label: "Highest %ile",
      value: bestPercentile === null ? "—" : bestPercentile.toFixed(1),
      sub: bestPercentile === null ? "no published results" : "best so far",
      pct: bestPercentile ?? 0,
      loading: loadingAttempts,
      icon: TrophyIcon,
      iconBg: "#fef3c7",
      iconColor: "#f59e0b",
      barColor: "#f59e0b",
    },
    {
      label: "Avg. Score",
      value: avgPct === null ? "—" : `${avgPct}%`,
      sub:
        scored.length === 0
          ? "no published results"
          : `across ${scored.length} test${scored.length === 1 ? "" : "s"}`,
      pct: avgPct ?? 0,
      loading: loadingAttempts,
      icon: BarChartIcon,
      iconBg: "#dbeafe",
      iconColor: "#3b82f6",
      barColor: "#3b82f6",
    },
    {
      label: "Results Pending",
      value: loadingAttempts ? "—" : String(pending),
      sub: pending === 0 ? "nothing waiting" : "awaiting publication",
      pct: sat.length > 0 ? (pending / sat.length) * 100 : 0,
      loading: loadingAttempts,
      icon: ClockIcon,
      iconBg: "#d8efe8",
      iconColor: "#006049",
      barColor: "#006049",
    },
    {
      label: "Practice Qs",
      value: facets ? String(facets.total) : "—",
      sub: facets
        ? `across ${facets.subjects.length} subject${facets.subjects.length === 1 ? "" : "s"}`
        : "loading…",
      pct: facets ? Math.min(100, facets.total) : 0,
      loading: facets === null,
      icon: BookOpenIcon,
      iconBg: "#ccfbf1",
      iconColor: "#14b8a6",
      barColor: "#14b8a6",
    },
  ];

  return (
    <StudentShell breadcrumb={["Home"]}>
      <div className="mb-6">
        <Greeting />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left column */}
        <div className="flex flex-col gap-5 xl:col-span-8">
          <section className="rounded-xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
            <h2 className="text-lg font-semibold text-admin-ink">
              Performance Overview
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {stats.map((stat) => (
                <StatTile key={stat.label} stat={stat} />
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <LiveExamCard />

            <article className="flex flex-col rounded-xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
              <span className="flex size-12 items-center justify-center rounded-full bg-admin-surface text-admin-muted">
                <PencilIcon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-admin-ink">
                Practice Mock Test
              </h3>
              <p className="mt-1 text-sm text-admin-muted">
                {facets && facets.total > 0
                  ? `${facets.total} curated questions across ${facets.subjects.length} subject${facets.subjects.length === 1 ? "" : "s"}, at your own pace.`
                  : "Practise by subject, chapter or topic to strengthen weak areas."}
              </p>
              <Link
                href="/student/practice"
                className="mt-auto flex items-center justify-center gap-2 rounded-lg border-2 border-admin px-4 py-3 text-base font-bold text-admin hover:bg-admin/5"
              >
                Start Practice
                <ArrowRightIcon className="size-4" />
              </Link>
            </article>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5 xl:col-span-4">
          <CountdownCard
            next={upcoming[0] ?? null}
            liveNow={live.length > 0}
            loading={loadingSchedule}
          />
          <CalendarCard attempts={attempts} upcoming={upcoming} />
        </div>
      </div>
    </StudentShell>
  );
}

function StatTile({ stat }: { stat: Stat }) {
  const Icon = stat.icon;
  return (
    <div className="flex flex-col gap-1 overflow-hidden rounded-lg bg-admin-bg p-4">
      <span
        className="flex size-8 items-center justify-center rounded-full"
        style={{ backgroundColor: stat.iconBg, color: stat.iconColor }}
      >
        <Icon className="size-4" />
      </span>
      <p className="pt-2 text-sm text-admin-muted">{stat.label}</p>
      {stat.loading ? (
        <>
          <span className="my-1 h-7 w-14 animate-pulse rounded bg-admin-line/40" />
          <span className="mb-1.5 h-3 w-20 animate-pulse rounded bg-admin-line/30" />
        </>
      ) : (
        <>
          <p className="text-[28px] font-semibold leading-9 text-admin-ink">
            {stat.value}
          </p>
          <p className="pb-1 text-xs font-medium text-admin-muted">
            {stat.sub}
          </p>
        </>
      )}
      <div className="h-1 w-full overflow-hidden rounded-full bg-[#e1e3e4]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, stat.pct))}%`,
            backgroundColor: stat.barColor,
          }}
        />
      </div>
    </div>
  );
}

/** Ticks once a second — the display goes down to seconds. */
function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function CountdownCard({
  next,
  liveNow,
  loading,
}: {
  next: UpcomingExam | null;
  liveNow: boolean;
  loading: boolean;
}) {
  const now = useNow();

  const parts = useMemo(() => {
    if (!next) return null;
    const ms = Math.max(0, Date.parse(next.startAt) - now);
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    return [
      {
        value: String(Math.floor(mins / 1440)).padStart(2, "0"),
        label: "DAYS",
      },
      {
        value: String(Math.floor((mins % 1440) / 60)).padStart(2, "0"),
        label: "HRS",
      },
      { value: String(mins % 60).padStart(2, "0"), label: "MINS" },
      { value: String(totalSecs % 60).padStart(2, "0"), label: "SECS" },
    ];
  }, [next, now]);

  // An exam that is open right now outranks anything scheduled later.
  if (liveNow) {
    return (
      <section className="rounded-xl bg-admin p-6 text-center text-white shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <p className="text-sm font-medium uppercase tracking-[0.7px] text-white/80">
          Exam Open Now
        </p>
        <p className="mt-3 text-lg font-bold">An exam is live for you</p>
        <p className="mt-1 text-sm text-white/80">
          Start it from the card on the left.
        </p>
      </section>
    );
  }

  if (loading || !next || !parts) {
    return (
      <section className="rounded-xl bg-admin p-6 text-center text-white shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <p className="text-sm font-medium uppercase tracking-[0.7px] text-white/80">
          Next Mock Test
        </p>
        <p className="mt-3 text-base font-semibold">
          {loading ? "Checking your schedule…" : "Nothing scheduled yet"}
        </p>
        {!loading && (
          <p className="mt-1 text-sm text-white/80">
            Your institute hasn&apos;t scheduled your next exam.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-xl bg-admin p-6 text-white shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-center text-sm font-medium uppercase tracking-[0.7px] text-white/80">
        Next Mock Test In
      </p>
      <div className="mt-4 flex items-start justify-center gap-4">
        {parts.map((part, i) => (
          <div key={part.label} className="flex items-start gap-4">
            {i > 0 && <span className="pt-3 text-2xl font-bold">:</span>}
            <div className="flex flex-col items-center">
              <div className="flex w-16 items-center justify-center rounded-lg border border-white/20 bg-white/10 py-3 text-2xl font-bold backdrop-blur-sm">
                {part.value}
              </div>
              <span className="mt-1 text-[10px] font-medium tracking-wide text-white/70 [font-family:var(--font-jetbrains,monospace)]">
                {part.label}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-lg bg-white/10 p-3">
        <p className="text-sm font-bold text-white">{next.title}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-white/80">
          <CalendarIcon className="size-3.5" />
          {new Date(next.startAt).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </section>
  );
}

/**
 * The current month, with a dot on every day that has something real on it:
 * an exam the student has already sat, or one scheduled ahead.
 */
function CalendarCard({
  attempts,
  upcoming,
}: {
  attempts: MyAttempt[];
  upcoming: UpcomingExam[];
}) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  // Cheap enough to run each render (a handful of dates), and hand-memoizing
  // it on values derived from `new Date()` is what the React Compiler rejects.
  const marks = new Map<number, "past" | "upcoming">();
  const dayInThisMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === year && d.getMonth() === month
      ? d.getDate()
      : null;
  };
  for (const a of attempts) {
    // Pending/approved/denied entry requests (§ exam entry approval) have no
    // date yet — nothing to mark on the calendar for them.
    const iso = a.submittedAt ?? a.startedAt;
    if (!iso) continue;
    const d = dayInThisMonth(iso);
    if (d !== null) marks.set(d, "past");
  }
  for (const u of upcoming) {
    const d = dayInThisMonth(u.startAt);
    if (d !== null) marks.set(d, "upcoming");
  }

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthLabel = today.toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <section className="rounded-xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
      <h3 className="text-lg font-semibold text-admin-ink">{monthLabel}</h3>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-admin-muted">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={`${d}-${i}`}>{d}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1 text-center text-sm">
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {days.map((d) => {
          const isToday = d === today.getDate();
          const mark = marks.get(d);
          return (
            <span
              key={d}
              className={`relative flex size-8 items-center justify-center rounded-full ${
                isToday
                  ? "bg-admin font-bold text-white"
                  : "text-admin-ink hover:bg-admin/5"
              }`}
            >
              {d}
              {mark && !isToday && (
                <span
                  aria-hidden
                  className={`absolute bottom-1 size-1 rounded-full ${
                    mark === "upcoming" ? "bg-[#f59e0b]" : "bg-admin"
                  }`}
                />
              )}
            </span>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 border-t border-admin-line/40 pt-3">
        <Legend color="#006049" label="Exam taken" />
        <Legend color="#f59e0b" label="Scheduled" />
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-admin-muted">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
