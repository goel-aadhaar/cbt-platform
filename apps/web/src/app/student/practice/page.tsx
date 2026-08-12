"use client";

import Link from "next/link";

import { StudentShell } from "@/components/student/student-shell";
import {
  AtomIcon,
  BookOpenIcon,
  FlaskIcon,
  LeafIcon,
  LightbulbIcon,
} from "@/components/student/icons";
import { usePracticeFacets } from "@/hooks/use-practice";
import { toSlug, type PracticeFacets } from "@/lib/practice";
import type { ComponentType, SVGProps } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Per-subject styling. Anything not listed still renders — it falls back to the
 * neutral palette, because subjects are whatever the teachers curated.
 */
const LOOK: Record<string, { icon: IconType; color: string; tint: string }> = {
  physics: { icon: AtomIcon, color: "#3b82f6", tint: "#dbeafe" },
  chemistry: { icon: FlaskIcon, color: "#f59e0b", tint: "#fef3c7" },
  biology: { icon: LeafIcon, color: "#8b5cf6", tint: "#ede9fe" },
};
const FALLBACK = { icon: BookOpenIcon, color: "#006049", tint: "#d8efe8" };

const lookFor = (subject: string) => LOOK[subject.toLowerCase()] ?? FALLBACK;

export default function PracticeLibraryPage() {
  const { data, loading, error } = usePracticeFacets();

  return (
    <StudentShell breadcrumb={["Practice Library"]}>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          What would you like to practice today?
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          {loading
            ? "Loading your practice library…"
            : data && data.total > 0
              ? `${data.total} question${data.total === 1 ? "" : "s"} curated by your teachers. Pick a subject to begin.`
              : "Select a subject to continue your preparation."}
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-42 animate-pulse rounded-2xl border border-admin-line/40 bg-admin-line/10"
            />
          ))}
        </div>
      ) : !data || data.subjects.length === 0 ? (
        <EmptyLibrary />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {data.subjects.map((s) => (
            <SubjectCard key={s.subject} entry={s} />
          ))}
        </div>
      )}

      {data && data.total > 0 && <DifficultyBanner facets={data} />}
    </StudentShell>
  );
}

function SubjectCard({ entry }: { entry: PracticeFacets["subjects"][number] }) {
  const { icon: Icon, color, tint } = lookFor(entry.subject);
  const chapters = entry.chapters.length;

  return (
    <Link
      href={`/student/practice/${toSlug(entry.subject)}`}
      className="group relative overflow-hidden rounded-2xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full opacity-40 blur-2xl"
        style={{ backgroundColor: tint }}
      />
      <div className="relative flex items-start justify-between">
        <span
          className="flex size-12 items-center justify-center rounded-xl"
          style={{ backgroundColor: tint, color }}
        >
          <Icon className="size-6" />
        </span>
        <span
          className="rounded-full px-3 py-1 text-xs font-bold"
          style={{ backgroundColor: tint, color }}
        >
          {chapters} chapter{chapters === 1 ? "" : "s"}
        </span>
      </div>
      <p className="relative mt-6 text-xl font-bold text-admin-ink">
        {entry.subject}
      </p>
      <p className="relative mt-1 flex items-center gap-1.5 text-xs text-admin-muted">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor">
          <path d="M4 4h7v16H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm9 0h7a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-7V4Z" />
        </svg>
        {entry.count} question{entry.count === 1 ? "" : "s"} available
      </p>
    </Link>
  );
}

function DifficultyBanner({ facets }: { facets: PracticeFacets }) {
  const order: ("EASY" | "MEDIUM" | "HARD")[] = ["EASY", "MEDIUM", "HARD"];
  const present = order.filter((d) => (facets.difficulties[d] ?? 0) > 0);
  if (present.length === 0) return null;

  return (
    <div className="mt-6 flex items-center gap-4 rounded-2xl bg-admin/6 p-6">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-admin/10 text-admin">
        <LightbulbIcon className="size-6" />
      </span>
      <div>
        <p className="text-base font-bold text-admin-ink">
          Mix up your difficulty
        </p>
        <p className="mt-0.5 text-sm text-admin-muted">
          Your library has{" "}
          {present
            .map((d) => `${facets.difficulties[d]} ${d.toLowerCase()}`)
            .join(", ")}{" "}
          question{facets.total === 1 ? "" : "s"}. Drilling a spread beats
          repeating what you already know.
        </p>
      </div>
    </div>
  );
}

function EmptyLibrary() {
  return (
    <div className="rounded-2xl border border-dashed border-admin-line bg-white p-12 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-admin/10 text-admin">
        <BookOpenIcon className="size-6" />
      </span>
      <p className="mt-4 text-base font-bold text-admin-ink">
        No practice questions yet
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-admin-muted">
        Your teachers add questions to the practice library from the question
        bank. Once they do, they&apos;ll show up here to drill.
      </p>
    </div>
  );
}
