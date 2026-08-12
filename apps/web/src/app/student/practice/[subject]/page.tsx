"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { StudentShell } from "@/components/student/student-shell";
import {
  ArrowRightIcon,
  BookOpenIcon,
  ChevronRightIcon,
} from "@/components/student/icons";
import { usePracticeFacets } from "@/hooks/use-practice";
import { subjectFromSlug } from "@/lib/practice";

/**
 * Chapter/topic picker for one subject. Everything comes from
 * GET /practice/facets, so a chapter only appears once a teacher has curated a
 * question into it.
 */
export default function PracticeSubjectPage() {
  const params = useParams<{ subject: string }>();
  const slug = params.subject ?? "";
  const { data, loading, error } = usePracticeFacets();

  const subject = subjectFromSlug(data, slug);
  const entry = data?.subjects.find((s) => s.subject === subject) ?? null;

  return (
    <StudentShell breadcrumb={["Practice Library", subject ?? "Subject"]}>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          {subject ?? (loading ? "Loading…" : "Subject")}
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          {entry
            ? `${entry.count} question${entry.count === 1 ? "" : "s"} across ${entry.chapters.length} chapter${entry.chapters.length === 1 ? "" : "s"}. Pick a chapter, or drill the whole subject.`
            : "Choose a chapter to start practising."}
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
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-admin-line/40 bg-admin-line/10"
            />
          ))}
        </div>
      ) : !entry ? (
        <NotCurated slug={slug} />
      ) : (
        <>
          {/* Whole-subject drill */}
          <Link
            href={`/student/practice/${slug}/start`}
            className="mb-6 flex items-center justify-between rounded-2xl bg-admin p-6 text-white transition-opacity hover:opacity-95"
          >
            <span>
              <span className="block text-lg font-bold">
                Practice all of {entry.subject}
              </span>
              <span className="mt-0.5 block text-sm text-white/80">
                A mixed set drawn from every chapter
              </span>
            </span>
            <ArrowRightIcon className="size-5 shrink-0" />
          </Link>

          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-admin-muted">
            Chapters
          </h2>
          <ul className="space-y-3">
            {entry.chapters.map((c) => (
              <li key={c.chapter}>
                <Link
                  href={`/student/practice/${slug}/start?chapter=${encodeURIComponent(c.chapter)}`}
                  className="flex items-center justify-between rounded-xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
                >
                  <span className="min-w-0">
                    <span className="block text-base font-bold text-admin-ink">
                      {c.chapter}
                    </span>
                    {c.topics.length > 0 && (
                      <span className="mt-1 block truncate text-xs text-admin-muted">
                        {c.topics.join(" · ")}
                      </span>
                    )}
                  </span>
                  <ChevronRightIcon className="size-5 shrink-0 text-admin-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </StudentShell>
  );
}

function NotCurated({ slug }: { slug: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-admin-line bg-white p-12 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-admin/10 text-admin">
        <BookOpenIcon className="size-6" />
      </span>
      <p className="mt-4 text-base font-bold text-admin-ink">
        Nothing to practise here yet
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-admin-muted">
        No questions have been added to the practice library for{" "}
        <span className="font-semibold">{slug.replace(/-/g, " ")}</span>.
      </p>
      <Link
        href="/student/practice"
        className="mt-5 inline-flex rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
      >
        Back to Practice Library
      </Link>
    </div>
  );
}
