import Link from "next/link";

import { StudentShell } from "@/components/student/student-shell";
import {
  ArrowRightIcon,
  BookOpenIcon,
  ChevronRightIcon,
  FileTextIcon,
  FlaskIcon,
} from "@/components/student/icons";
import type { ComponentType, SVGProps } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

interface CompletedTest {
  name: string;
  score: string;
  outOf: string;
  date: string;
  icon: IconType;
  tint: string;
  color: string;
}

const COMPLETED: CompletedTest[] = [
  {
    name: "Aakash Full Mock Test 04",
    score: "610",
    outOf: "720",
    date: "Oct 24, 2023",
    icon: FlaskIcon,
    tint: "#f3e8ff",
    color: "#a855f7",
  },
  {
    name: "Physics Chapterwise: Mechanics",
    score: "145",
    outOf: "180",
    date: "Oct 21, 2023",
    icon: FileTextIcon,
    tint: "#dbeafe",
    color: "#3b82f6",
  },
  {
    name: "Minor Test Series 02 - Biology",
    score: "320",
    outOf: "360",
    date: "Oct 18, 2023",
    icon: FlaskIcon,
    tint: "#ccfbf1",
    color: "#14b8a6",
  },
];

export default function StudentExamsPage() {
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

      {/* Two hero cards */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <HeroCard
          icon={FileTextIcon}
          title="Full Mock Tests"
          description="Simulate the real exam — timed, full-syllabus tests based on latest patterns."
          stat="24 tests attempted · Highest: 98.45 percentile"
          ctaLabel="Browse Mock Tests"
          ctaHref="/student/exams/mock"
          variant="solid"
        />
        <HeroCard
          icon={BookOpenIcon}
          title="Practice Library"
          description="Practice by subject, chapter, or topic at your own pace to strengthen weak areas."
          stat="Last practiced: Organic Chemistry · 2 days ago"
          ctaLabel="Start Practicing"
          ctaHref="/student/practice"
          variant="muted"
        />
      </div>

      {/* Continue + recent */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.6fr]">
        {/* Continue where you left off */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-admin-ink">
            Continue Where You Left Off
          </h2>
          <div className="rounded-xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between">
              <span className="rounded bg-admin-surface px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-admin-muted">
                Practice Set
              </span>
              <FlaskIcon className="size-5 text-admin-muted" />
            </div>
            <p className="mt-3 text-base font-semibold text-admin-ink">
              NEET Biology — Genetics
            </p>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-admin-muted">Progress</span>
              <span className="font-semibold text-admin-ink">65%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#e1e3e4]">
              <div className="h-full w-[65%] rounded-full bg-admin" />
            </div>
            <Link
              href="/student/practice"
              className="mt-4 flex items-center justify-center rounded-lg border border-admin-line py-2.5 text-sm font-bold text-admin hover:bg-admin/5"
            >
              Resume Session
            </Link>
          </div>
        </section>

        {/* Recent completed tests */}
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
            {COMPLETED.map((t) => {
              const Icon = t.icon;
              return (
                <div
                  key={t.name}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-admin-line/20 px-5 py-4 last:border-b-0"
                >
                  <span className="flex items-center gap-3">
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: t.tint, color: t.color }}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="text-sm font-medium text-admin-ink">
                      {t.name}
                    </span>
                  </span>
                  <span className="text-right text-sm font-bold text-admin-ink">
                    {t.score}
                    <span className="font-normal text-admin-muted">
                      /{t.outOf}
                    </span>
                  </span>
                  <span className="w-28 text-sm text-admin-muted">
                    {t.date}
                  </span>
                </div>
              );
            })}
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
  return (
    <article className="relative overflow-hidden rounded-2xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
      {/* soft corner highlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-admin/5 blur-2xl"
      />
      <div className="relative flex items-start justify-between">
        <h2 className="text-xl font-bold text-admin">{title}</h2>
        <span className="flex size-11 items-center justify-center rounded-full bg-admin-surface text-admin">
          <Icon className="size-5" />
        </span>
      </div>
      <p className="relative mt-3 max-w-md text-sm text-admin-muted">
        {description}
      </p>
      <p className="relative mt-4 rounded-lg bg-admin-bg px-4 py-3 text-sm text-admin-ink [font-family:var(--font-courier-prime)]">
        {stat}
      </p>
      <Link
        href={ctaHref}
        className={`relative mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold ${
          variant === "solid"
            ? "bg-admin text-white hover:opacity-95"
            : "bg-admin/10 text-admin hover:bg-admin/15"
        }`}
      >
        {ctaLabel}
        <ArrowRightIcon className="size-4" />
      </Link>
    </article>
  );
}
