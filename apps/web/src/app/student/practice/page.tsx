import Link from "next/link";

import { StudentShell } from "@/components/student/student-shell";
import {
  AtomIcon,
  FlaskIcon,
  LeafIcon,
  LightbulbIcon,
} from "@/components/student/icons";
import type { ComponentType, SVGProps } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

interface Subject {
  slug: string;
  name: string;
  questions: string;
  progress: number;
  icon: IconType;
  color: string;
  tint: string;
}

const SUBJECTS: Subject[] = [
  {
    slug: "physics",
    name: "Physics",
    questions: "1,240 questions available",
    progress: 45,
    icon: AtomIcon,
    color: "#3b82f6",
    tint: "#dbeafe",
  },
  {
    slug: "chemistry",
    name: "Chemistry",
    questions: "980 questions available",
    progress: 30,
    icon: FlaskIcon,
    color: "#f59e0b",
    tint: "#fef3c7",
  },
  {
    slug: "biology",
    name: "Biology",
    questions: "1,520 questions available",
    progress: 60,
    icon: LeafIcon,
    color: "#a855f7",
    tint: "#f3e8ff",
  },
];

export default function StudentPracticePage() {
  return (
    <StudentShell breadcrumb={["Practice Library"]}>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          What would you like to practice today?
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          Select a subject to continue your preparation. You&apos;re doing
          great!
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {SUBJECTS.map((subject) => (
          <SubjectCard key={subject.slug} subject={subject} />
        ))}
      </div>

      {/* Consistency banner */}
      <div className="mt-6 flex items-center gap-4 rounded-2xl bg-admin/[0.06] p-6">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-admin/10 text-admin">
          <LightbulbIcon className="size-6" />
        </span>
        <div>
          <p className="text-base font-bold text-admin-ink">
            Consistency is key!
          </p>
          <p className="mt-0.5 text-sm text-admin-muted">
            You&apos;ve practiced for 4 days in a row. Keep up the momentum to
            reach your goals.
          </p>
        </div>
      </div>
    </StudentShell>
  );
}

function SubjectCard({ subject }: { subject: Subject }) {
  const Icon = subject.icon;
  return (
    <Link
      href={`/student/practice/${subject.slug}`}
      className="group relative overflow-hidden rounded-2xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
    >
      {/* corner tint */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full opacity-40 blur-2xl"
        style={{ backgroundColor: subject.tint }}
      />
      <div className="relative flex items-start justify-between">
        <span
          className="flex size-12 items-center justify-center rounded-xl"
          style={{ backgroundColor: subject.tint, color: subject.color }}
        >
          <Icon className="size-6" />
        </span>
        <ProgressRing value={subject.progress} color={subject.color} />
      </div>
      <p className="relative mt-6 text-xl font-bold text-admin-ink">
        {subject.name}
      </p>
      <p className="relative mt-1 flex items-center gap-1.5 text-xs text-admin-muted">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor">
          <path d="M4 4h7v16H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm9 0h7a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-7V4Z" />
        </svg>
        {subject.questions}
      </p>
    </Link>
  );
}

function ProgressRing({ value, color }: { value: number; color: string }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value / 100);
  return (
    <span className="relative flex size-12 items-center justify-center">
      <svg viewBox="0 0 48 48" className="size-12 -rotate-90">
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke="#e1e3e4"
          strokeWidth="4"
        />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-[11px] font-bold text-admin-ink">
        {value}%
      </span>
    </span>
  );
}
