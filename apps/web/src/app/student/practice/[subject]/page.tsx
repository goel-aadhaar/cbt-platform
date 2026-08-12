"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { StudentShell } from "@/components/student/student-shell";
import { ArrowRightIcon } from "@/components/student/icons";
import {
  completionLabel,
  EmptyPractice,
  PracticeBack,
  ProgressBar,
} from "@/components/student/practice-bits";
import { usePracticeFacets } from "@/hooks/use-practice";
import { subjectFromSlug, toSlug, type PracticeChapter } from "@/lib/practice";

/**
 * "<Subject> Chapters" (Figma 183:32914).
 *
 * Chapters, their question counts and the student's own progress all come from
 * GET /practice/facets — a chapter only appears once a teacher has curated a
 * question into it.
 */
export default function PracticeSubjectPage() {
  const params = useParams<{ subject: string }>();
  const slug = params.subject ?? "";
  const { data, loading, error } = usePracticeFacets();

  const subject = subjectFromSlug(data, slug);
  const entry = data?.subjects.find((s) => s.subject === subject) ?? null;

  return (
    <StudentShell
      breadcrumb={[
        { label: "Practice Library", href: "/student/practice" },
        subject ?? "Subject",
      ]}
    >
      <PracticeBack href="/student/practice" label="Practice Library" />

      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          {subject ? `${subject} Chapters` : loading ? "Loading…" : "Subject"}
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          Select a chapter below to continue your practice. Consistent progress
          builds mastery.
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
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-admin-line/40 bg-admin-line/10"
            />
          ))}
        </div>
      ) : !entry ? (
        <EmptyPractice
          title="Nothing to practise here yet"
          body={`No questions have been added to the practice library for ${slug.replace(/-/g, " ")}.`}
          actionHref="/student/practice"
          actionLabel="Back to Practice Library"
        />
      ) : (
        <ul className="space-y-4">
          {entry.chapters.map((c) => (
            <li key={c.chapter}>
              <ChapterRow subjectSlug={slug} chapter={c} />
            </li>
          ))}
        </ul>
      )}
    </StudentShell>
  );
}

function ChapterRow({
  subjectSlug,
  chapter,
}: {
  subjectSlug: string;
  chapter: PracticeChapter;
}) {
  const pct =
    chapter.count === 0 ? 0 : (chapter.practised / chapter.count) * 100;

  return (
    <Link
      href={`/student/practice/${subjectSlug}/${toSlug(chapter.chapter)}`}
      className="flex items-center gap-6 rounded-2xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
    >
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold text-admin-ink">{chapter.chapter}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-admin-muted">
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor">
              <path d="M4 4h7v16H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm9 0h7a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-7V4Z" />
            </svg>
            {chapter.count} Question{chapter.count === 1 ? "" : "s"}
          </span>
          <span aria-hidden>·</span>
          <span
            className={
              chapter.practised > 0
                ? "font-semibold text-admin"
                : "font-semibold text-admin-muted"
            }
          >
            {completionLabel(chapter.practised, chapter.count)}
          </span>
        </p>
      </div>

      <div className="hidden w-48 shrink-0 sm:block">
        <ProgressBar value={pct} />
        <p className="mt-1 text-right text-xs text-admin-muted">
          {chapter.practised}/{chapter.count}
        </p>
      </div>

      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-admin/10 text-admin">
        <ArrowRightIcon className="size-4" />
      </span>
    </Link>
  );
}
