import Link from "next/link";

import { Greeting } from "@/components/student/greeting";
import { LiveExamCard } from "@/components/student/live-exam-card";
import { StudentShell } from "@/components/student/student-shell";
import {
  ArrowRightIcon,
  BarChartIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  PencilIcon,
  TrophyIcon,
} from "@/components/student/icons";
import type { ComponentType, SVGProps } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

interface Stat {
  label: string;
  value: string;
  delta: string;
  deltaTone: "up" | "flat" | "down";
  pct: number; // filled fraction of the mini bar, 0–100
  icon: IconType;
  iconBg: string;
  iconColor: string;
  barColor: string;
}

const STATS: Stat[] = [
  {
    label: "Mock Tests",
    value: "24",
    delta: "2 this week",
    deltaTone: "up",
    pct: 70,
    icon: FileTextIcon,
    iconBg: "#f3e8ff",
    iconColor: "#a855f7",
    barColor: "#a855f7",
  },
  {
    label: "Highest %ile",
    value: "98.4",
    delta: "1.2%",
    deltaTone: "up",
    pct: 98,
    icon: TrophyIcon,
    iconBg: "#fef3c7",
    iconColor: "#f59e0b",
    barColor: "#f59e0b",
  },
  {
    label: "Avg. Score",
    value: "612",
    delta: "14 pts",
    deltaTone: "up",
    pct: 85,
    icon: BarChartIcon,
    iconBg: "#dbeafe",
    iconColor: "#3b82f6",
    barColor: "#3b82f6",
  },
  {
    label: "Study Hrs",
    value: "142",
    delta: "stable",
    deltaTone: "flat",
    pct: 60,
    icon: ClockIcon,
    iconBg: "#007b5e",
    iconColor: "#ffffff",
    barColor: "#006049",
  },
  {
    label: "Attendance",
    value: "95%",
    delta: "2%",
    deltaTone: "down",
    pct: 95,
    icon: CalendarIcon,
    iconBg: "#ccfbf1",
    iconColor: "#14b8a6",
    barColor: "#14b8a6",
  },
];

export default function StudentHomePage() {
  return (
    <StudentShell breadcrumb={["Home"]}>
      {/* Greeting */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Greeting />
        </div>
        <span className="flex items-center gap-2 rounded-full border border-[#fde68a] bg-[#fef3c7] px-3.5 py-1.5 text-sm font-bold text-[#92400e]">
          🔥 12-day streak!
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left column */}
        <div className="flex flex-col gap-5 xl:col-span-8">
          {/* Performance overview */}
          <section className="rounded-xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
            <h2 className="text-lg font-semibold text-admin-ink">
              Performance Overview
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {STATS.map((stat) => (
                <StatTile key={stat.label} stat={stat} />
              ))}
            </div>
          </section>

          {/* Hero actions */}
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
                Take previous year papers or custom topic-wise tests to improve
                your weak areas.
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
          <CountdownCard />
          <CalendarCard />
        </div>
      </div>
    </StudentShell>
  );
}

function StatTile({ stat }: { stat: Stat }) {
  const Icon = stat.icon;
  const deltaColor =
    stat.deltaTone === "down"
      ? "text-[#ba1a1a]"
      : stat.deltaTone === "flat"
        ? "text-admin-muted"
        : "text-admin";
  return (
    <div className="flex flex-col gap-1 overflow-hidden rounded-lg bg-admin-bg p-4">
      <span
        className="flex size-8 items-center justify-center rounded-full"
        style={{ backgroundColor: stat.iconBg, color: stat.iconColor }}
      >
        <Icon className="size-4" />
      </span>
      <p className="pt-2 text-sm text-admin-muted">{stat.label}</p>
      <p className="text-[28px] font-semibold leading-9 text-admin-ink">
        {stat.value}
      </p>
      <p className={`pb-1 text-xs font-medium ${deltaColor}`}>
        {stat.deltaTone === "up"
          ? "↑ "
          : stat.deltaTone === "down"
            ? "↓ "
            : "– "}
        {stat.delta}
      </p>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[#e1e3e4]">
        <div
          className="h-full rounded-full"
          style={{ width: `${stat.pct}%`, backgroundColor: stat.barColor }}
        />
      </div>
    </div>
  );
}

function CountdownCard() {
  const parts = [
    { value: "14", label: "DAYS" },
    { value: "08", label: "HRS" },
    { value: "45", label: "MINS" },
  ];
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
        <p className="text-sm font-bold text-white">NEET Grand Test - 05</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-white/80">
          <CalendarIcon className="size-3.5" />
          May 28, 2025
        </p>
      </div>
    </section>
  );
}

/* --- May 2025 calendar (static, matches design) --- */
const LEADING = [27, 28, 29, 30]; // trailing April days (greyed)
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const SUNDAYS = new Set([4, 11, 18, 25]);
const DOTS: Record<number, string> = {
  2: "#f59e0b",
  6: "#3b82f6",
  11: "#006049",
  21: "#3b82f6",
};
const TODAY = 14;
const TEST_DAY = 28;

function CalendarCard() {
  return (
    <section className="rounded-xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-admin-ink">May 2025</h3>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Previous month"
            className="flex size-8 items-center justify-center rounded text-admin-muted hover:bg-admin-bg"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            className="flex size-8 items-center justify-center rounded text-admin-muted hover:bg-admin-bg"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="py-1 text-xs font-medium text-admin-muted">
            {d}
          </span>
        ))}
        {LEADING.map((d) => (
          <span key={`lead-${d}`} className="py-2 text-sm text-admin-muted/30">
            {d}
          </span>
        ))}
        {DAYS.map((d) => {
          const isToday = d === TODAY;
          const isTest = d === TEST_DAY;
          const isSunday = SUNDAYS.has(d);
          return (
            <span
              key={d}
              className={`relative flex items-center justify-center rounded-full py-2 text-sm ${
                isToday
                  ? "bg-admin font-bold text-white shadow-sm"
                  : isTest
                    ? "rounded border border-admin bg-admin/10 font-bold text-admin"
                    : isSunday
                      ? "text-[#ba1a1a]"
                      : "text-admin-ink"
              }`}
            >
              {d}
              {DOTS[d] && !isToday && (
                <span
                  className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full"
                  style={{ backgroundColor: DOTS[d] }}
                />
              )}
            </span>
          );
        })}
      </div>

      <div className="mt-3 flex gap-3 border-t border-admin-line/20 pt-3">
        <Legend color="#006049" label="Live Class" />
        <Legend color="#3b82f6" label="Assignment" />
        <Legend color="#f59e0b" label="Deadline" />
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-admin-muted">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
