"use client";

import Link from "next/link";
import { useState } from "react";

import { StudentShell } from "@/components/student/student-shell";
import {
  ArrowRightIcon,
  AtomIcon,
  BarChartIcon,
  ClockIcon,
  FileTextIcon,
  FlaskIcon,
  LeafIcon,
  TrophyIcon,
} from "@/components/student/icons";
import { useMyAttempts } from "@/hooks/use-my-attempts";
import { usePracticeFacets } from "@/hooks/use-practice";
import type { SVGProps } from "react";

type Tab = "overall" | "subject" | "mock";

const TABS: { id: Tab; label: string }[] = [
  { id: "overall", label: "Overall" },
  { id: "subject", label: "Subject-wise" },
  { id: "mock", label: "Mock Tests" },
];

export default function StudentReportsPage() {
  const [tab, setTab] = useState<Tab>("overall");
  return (
    <StudentShell breadcrumb={["Reports"]}>
      {/* Tabs */}
      <div className="mb-6 flex gap-6 border-b border-admin-line/60">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 pb-3 text-sm font-semibold transition-colors ${
              tab === t.id
                ? "border-admin text-admin"
                : "border-transparent text-admin-muted hover:text-admin-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overall" && <OverallTab />}
      {tab === "subject" && <SubjectTab />}
      {tab === "mock" && <MockTab />}
    </StudentShell>
  );
}

/* ---------------- Overall (static design) ---------------- */

function OverallTab() {
  const stats = [
    {
      label: "Overall Accuracy",
      value: "78%",
      delta: "+3%",
      icon: CheckCircle,
    },
    {
      label: "Avg Percentile",
      value: "92nd",
      delta: "+1.5",
      icon: BarChartIcon,
    },
    {
      label: "Total Tests Taken",
      value: "42",
      note: "This Month",
      icon: FileTextIcon,
    },
    {
      label: "Total Study Hours",
      value: "128h",
      note: "This Month",
      icon: ClockIcon,
    },
  ];
  const sessions = [
    {
      subject: "Biology",
      chapter: "Genetics",
      date: "Oct 24",
      qs: 45,
      acc: 82,
      time: "45m",
      icon: LeafIcon,
      tint: "#ccfbf1",
      color: "#14b8a6",
    },
    {
      subject: "Physics",
      chapter: "Kinematics",
      date: "Oct 23",
      qs: 30,
      acc: 65,
      time: "60m",
      icon: AtomIcon,
      tint: "#dbeafe",
      color: "#3b82f6",
    },
    {
      subject: "Chemistry",
      chapter: "Organic Bonds",
      date: "Oct 21",
      qs: 50,
      acc: 90,
      time: "35m",
      icon: FlaskIcon,
      tint: "#fef3c7",
      color: "#f59e0b",
    },
  ];
  const streak = [40, 55, 70, 80, 90, 100, 100];
  const days = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="rounded-xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-admin-surface text-admin">
                <Icon className="size-4" />
              </span>
              <p className="mt-4 text-sm text-admin-muted">{s.label}</p>
              <p className="mt-1 text-3xl font-bold text-admin-ink">
                {s.value}
                {s.delta && (
                  <span className="ml-2 align-middle text-xs font-semibold text-admin">
                    ↗ {s.delta}
                  </span>
                )}
                {s.note && (
                  <span className="ml-2 align-middle text-xs font-normal text-admin-muted">
                    {s.note}
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.6fr]">
        <section className="rounded-xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-admin-ink">
                Practice Streak
              </h3>
              <p className="text-sm text-admin-muted">Consistency is key.</p>
            </div>
            <span className="flex size-9 items-center justify-center rounded-full bg-[#fef3c7] text-[#f59e0b]">
              🔥
            </span>
          </div>
          <p className="mt-4 text-3xl font-bold text-admin-ink">
            7{" "}
            <span className="text-base font-medium text-admin-muted">Days</span>
          </p>
          <div className="mt-6 flex items-end justify-between gap-2">
            {days.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="flex h-16 w-full items-end justify-center rounded-md bg-admin-bg"
                  title={`${streak[i]}%`}
                >
                  {i === days.length - 1 ? (
                    <span className="flex size-full items-center justify-center rounded-md bg-admin text-white">
                      ✓
                    </span>
                  ) : (
                    <div
                      className="w-full rounded-md bg-admin"
                      style={{
                        height: `${streak[i]}%`,
                        opacity: 0.25 + (streak[i] / 100) * 0.75,
                      }}
                    />
                  )}
                </div>
                <span className="text-xs text-admin-muted">{d}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col items-center gap-6 rounded-xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)] md:flex-row">
          <div className="flex h-32 w-full items-end justify-center gap-2 rounded-lg bg-admin-bg p-4 md:w-64">
            {[30, 50, 40, 65, 90].map((h, i) => (
              <div
                key={i}
                className="w-6 rounded bg-admin"
                style={{ height: `${h}%`, opacity: 0.3 + (h / 100) * 0.7 }}
              />
            ))}
          </div>
          <div className="flex-1">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-admin-ink">
              Advanced Weakness Analysis
              <span className="rounded-full bg-admin px-2 py-0.5 text-[10px] font-bold text-white">
                PRO
              </span>
            </h3>
            <p className="mt-1 max-w-xl text-sm text-admin-muted">
              Unlock deep insights into your practice patterns. Our AI
              identifies specific micro-topics where you consistently lose time
              or accuracy, helping you focus your revision exactly where it
              matters most.
            </p>
          </div>
          {/* Planned feature — the AI provider is a seam today, so the control is
            disabled rather than dead. Kept so the surface exists when it ships. */}
          <button
            type="button"
            disabled
            title="Coming soon — AI-powered insights are planned for a future release."
            className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-bold text-admin opacity-60"
          >
            Explore Insights <BarChartIcon className="size-4" />
          </button>
        </section>

        <section className="rounded-xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-admin-ink">
              Recent Practice Sessions
            </h3>
            <Link
              href="/student/practice"
              className="flex items-center gap-1 text-sm font-semibold text-admin hover:underline"
            >
              Practice Library <ArrowRightIcon className="size-4" />
            </Link>
          </div>
          <div className="grid grid-cols-[1.6fr_0.7fr_0.7fr_1fr_0.7fr] gap-3 border-b border-admin-line/40 pb-2 text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
            <span>Subject / Chapter</span>
            <span>Date</span>
            <span>Qs</span>
            <span>Accuracy %</span>
            <span>Time</span>
          </div>
          {sessions.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.subject}
                className="grid grid-cols-[1.6fr_0.7fr_0.7fr_1fr_0.7fr] items-center gap-3 border-b border-admin-line/20 py-3 text-sm last:border-b-0"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: s.tint, color: s.color }}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block font-semibold text-admin-ink">
                      {s.subject}
                    </span>
                    <span className="block text-xs text-admin-muted">
                      {s.chapter}
                    </span>
                  </span>
                </span>
                <span className="text-admin-muted">{s.date}</span>
                <span className="text-admin-ink">{s.qs}</span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-admin-ink">{s.acc}%</span>
                  <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-[#e1e3e4] xl:block">
                    <span
                      className="block h-full rounded-full bg-admin"
                      style={{ width: `${s.acc}%` }}
                    />
                  </span>
                </span>
                <span className="text-admin-muted">{s.time}</span>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

/* ---------------- Subject-wise (static design) ---------------- */

function SubjectTab() {
  const { data, loading, error } = usePracticeFacets();
  const [openSubject, setOpenSubject] = useState<string | null>(null);

  if (error) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {error}
      </p>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-2xl border border-admin-line/40 bg-admin-line/10"
          />
        ))}
      </div>
    );
  }

  const subjects = data?.subjects ?? [];
  if (subjects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-admin-line bg-white p-12 text-center">
        <p className="text-base font-bold text-admin-ink">
          No subject data yet
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-admin-muted">
          Subject accuracy is built from your practice sessions. Once you drill
          a few sets in the Practice Library, your breakdown appears here.
        </p>
        <Link
          href="/student/practice"
          className="mt-5 inline-flex rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
        >
          Go to Practice Library
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {subjects.map((s) => (
          <div
            key={s.subject}
            className="flex flex-col items-center rounded-2xl border border-admin-line/40 bg-white p-6 text-center shadow-[0_4px_10px_rgba(0,0,0,0.04)]"
          >
            <h3 className="text-lg font-bold text-admin-ink">{s.subject}</h3>
            <div className="my-4">
              <BigRing value={s.mastery} />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
              Mastery
            </p>
            <p className="mt-1 text-sm text-admin-muted">
              {s.practised} of {s.count} questions practised
            </p>
            <button
              type="button"
              onClick={() =>
                setOpenSubject((o) => (o === s.subject ? null : s.subject))
              }
              className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-admin hover:underline"
            >
              {openSubject === s.subject ? "Hide" : "View"} Chapter Breakdown
              <ArrowRightIcon className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {openSubject && (
        <section className="rounded-2xl border border-admin-line/40 bg-white shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
          <div className="border-b border-admin-line/40 px-6 py-4">
            <h3 className="text-lg font-semibold text-admin-ink">
              {openSubject} — chapter breakdown
            </h3>
            <p className="mt-0.5 text-xs text-admin-muted">
              Mastery is the share of a chapter&apos;s questions you have
              answered correctly at least once.
            </p>
          </div>
          {(
            subjects.find((s) => s.subject === openSubject)?.chapters ?? []
          ).map((c) => (
            <div
              key={c.chapter}
              className="flex items-center gap-4 border-b border-admin-line/20 px-6 py-4 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-admin-ink">
                  {c.chapter}
                </span>
                <span className="block text-xs text-admin-muted">
                  {c.practised}/{c.count} practised
                </span>
              </span>
              <span className="w-40 shrink-0">
                <div className="h-2 w-full overflow-hidden rounded-full bg-admin-line/30">
                  <div
                    className="h-full rounded-full bg-admin"
                    style={{ width: `${c.mastery}%` }}
                  />
                </div>
              </span>
              <span className="w-12 shrink-0 text-right text-sm font-bold text-admin-ink">
                {c.mastery}%
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
function MockTab() {
  // /me/attempts, not /me/history: history is published-only, so an exam that
  // has been sat but not yet published would otherwise vanish from the portal.
  const { items: attempts, loading, error } = useMyAttempts();

  const sat = attempts.filter((a) => a.resultState !== "IN_PROGRESS");
  const scored = sat.filter((a) => a.result !== null);

  const stats = scored.length
    ? [
        {
          label: "Best Score",
          value: Math.max(
            ...scored.map((x) => x.result!.totalScore),
          ).toString(),
          icon: TrophyIcon,
        },
        {
          label: "Most Recent",
          value: scored[0].result!.totalScore.toString(),
          icon: ClockIcon,
        },
        {
          label: "Average Score",
          value: Math.round(
            scored.reduce((s, x) => s + x.result!.totalScore, 0) /
              scored.length,
          ).toString(),
          icon: BarChartIcon,
        },
      ]
    : Array.from({ length: 3 }, (_, i) => ({
        label: ["Best Score", "Most Recent", "Average Score"][i],
        value: "—",
        icon: [TrophyIcon, ClockIcon, BarChartIcon][i],
      }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="rounded-xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]"
            >
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
                <Icon className="size-4 text-admin" />
                {s.label}
              </p>
              <p className="mt-3 text-4xl font-bold text-admin-ink">
                {s.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Live published-results table */}
      <section className="rounded-2xl border border-admin-line/40 bg-white shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between border-b border-admin-line/40 px-6 py-4">
          <h3 className="text-lg font-semibold text-admin-ink">Your Results</h3>
        </div>

        {loading && (
          <div className="space-y-3 p-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-admin-bg" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="px-6 py-8 text-center text-sm text-admin-muted">
            {error}
          </p>
        )}

        {!loading && !error && sat.length === 0 && (
          <p className="px-6 py-8 text-center text-sm text-admin-muted">
            You haven&apos;t completed any exams yet. Scores appear here once
            your institute publishes them.
          </p>
        )}

        {!loading && sat.length > 0 && (
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 border-b border-admin-line/40 px-6 py-3 text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
            <span>Exam</span>
            <span>Score</span>
            <span>Correct</span>
            <span>Percentile</span>
            <span>Date</span>
          </div>
        )}
        {!loading &&
          sat.map((a) => (
            <Link
              key={a.id}
              href={`/student/results/${a.id}`}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center gap-4 border-b border-admin-line/20 px-6 py-4 text-sm last:border-b-0 hover:bg-admin/5"
            >
              <span className="font-medium text-admin-ink">{a.exam.title}</span>
              {a.result ? (
                <>
                  <span className="font-bold text-admin-ink">
                    {a.result.totalScore}
                    <span className="font-normal text-admin-muted">
                      /{a.result.maxScore}
                    </span>
                  </span>
                  <span className="text-admin-muted">
                    {a.result.correctCount}/
                    {a.result.correctCount +
                      a.result.incorrectCount +
                      a.result.unattemptedCount}
                  </span>
                  <span className="text-admin-muted">
                    {a.result.percentile == null
                      ? "—"
                      : `${a.result.percentile}%`}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                      Pending
                    </span>
                  </span>
                  <span className="text-admin-muted">—</span>
                  <span className="text-admin-muted">—</span>
                </>
              )}
              <span className="text-admin-muted">
                {new Date(a.submittedAt ?? a.startedAt).toLocaleDateString()}
              </span>
            </Link>
          ))}
      </section>

      {/* Planned feature — national ranking and AI revision plans are future
          work, so this stays visible but inert rather than pretending to work. */}
      <section className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-admin p-6 text-white md:flex-row">
        <div>
          <h3 className="text-lg font-bold">Ready for deeper insights?</h3>
          <p className="mt-1 text-sm text-white/80">
            See how you rank nationally and get an AI-generated revision plan.
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Coming soon — national ranking and AI revision plans are planned for a future release."
          className="cursor-not-allowed rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-admin opacity-70"
        >
          Explore Advanced Analysis
        </button>
      </section>
    </div>
  );
}

/* ---------------- shared bits ---------------- */

function CheckCircle(p: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function BigRing({ value }: { value: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value / 100);
  return (
    <span className="relative flex size-28 items-center justify-center">
      <svg viewBox="0 0 100 100" className="size-28 -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#e1e3e4"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#006049"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-2xl font-bold text-admin-ink">
        {value}%
      </span>
    </span>
  );
}
