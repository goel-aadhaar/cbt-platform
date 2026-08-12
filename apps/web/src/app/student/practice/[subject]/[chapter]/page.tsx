"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { StudentShell } from "@/components/student/student-shell";
import { TargetIcon, TrendingUpIcon } from "@/components/student/icons";
import {
  EmptyPractice,
  PracticeBack,
  ProgressBar,
} from "@/components/student/practice-bits";
import { usePracticeFacets } from "@/hooks/use-practice";
import {
  chapterFromSlug,
  subjectFromSlug,
  type PracticeTopic,
} from "@/lib/practice";

/**
 * "<Chapter> Topics" (Figma 183:33762).
 *
 * A chapter whose questions carry no topic tag skips straight to the set
 * chooser rather than showing an empty grid — topic is optional on a question.
 */
export default function PracticeChapterPage() {
  const params = useParams<{ subject: string; chapter: string }>();
  const subjectSlug = params.subject ?? "";
  const chapterSlug = params.chapter ?? "";
  const { data, loading, error } = usePracticeFacets();

  const subjectName = subjectFromSlug(data, subjectSlug);
  const subject = data?.subjects.find((s) => s.subject === subjectName) ?? null;
  const chapter = chapterFromSlug(subject, chapterSlug);

  const base = `/student/practice/${subjectSlug}/${chapterSlug}`;

  return (
    <StudentShell
      breadcrumb={[
        { label: "Practice Library", href: "/student/practice" },
        {
          label: subjectName ?? "Subject",
          href: `/student/practice/${subjectSlug}`,
        },
        chapter?.chapter ?? "Chapter",
      ]}
    >
      <PracticeBack
        href={`/student/practice/${subjectSlug}`}
        label={subjectName ? `${subjectName} Chapters` : "Back"}
      />

      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          {chapter
            ? `${chapter.chapter} Topics`
            : loading
              ? "Loading…"
              : "Topics"}
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          Select a topic below to focus your practice session. Consistent
          practice builds mastery and confidence.
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
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl border border-admin-line/40 bg-admin-line/10"
            />
          ))}
        </div>
      ) : !chapter ? (
        <EmptyPractice
          title="Chapter not found"
          body="It may no longer be in your practice library."
          actionHref={`/student/practice/${subjectSlug}`}
          actionLabel="Back to chapters"
        />
      ) : (
        <>
          {/* Whole-chapter drill always available, regardless of topics. */}
          <Link
            href={`${base}/set`}
            className="mb-6 flex items-center justify-between rounded-2xl bg-admin p-6 text-white transition-opacity hover:opacity-95"
          >
            <span>
              <span className="block text-lg font-bold">
                Practise all of {chapter.chapter}
              </span>
              <span className="mt-0.5 block text-sm text-white/80">
                {chapter.count} question{chapter.count === 1 ? "" : "s"} drawn
                from every topic
              </span>
            </span>
            <TargetIcon className="size-6 shrink-0" />
          </Link>

          {chapter.topics.length === 0 ? (
            <p className="rounded-xl border border-admin-line/40 bg-white p-6 text-sm text-admin-muted">
              This chapter&apos;s questions aren&apos;t split into topics yet —
              use the whole-chapter set above.
            </p>
          ) : (
            <>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-admin-muted">
                Topics
              </h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {chapter.topics.map((t) => (
                  <TopicCard key={t.topic} base={base} topic={t} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </StudentShell>
  );
}

function TopicCard({ base, topic }: { base: string; topic: PracticeTopic }) {
  return (
    <Link
      href={`${base}/set?topic=${encodeURIComponent(topic.topic)}`}
      className="flex flex-col rounded-2xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-admin/10 text-admin">
          <TrendingUpIcon className="size-5" />
        </span>
        <span className="rounded-full bg-admin-bg px-3 py-1 text-xs font-semibold text-admin-muted">
          {topic.count} Question{topic.count === 1 ? "" : "s"}
        </span>
      </div>

      <p className="mt-4 text-lg font-bold text-admin-ink">{topic.topic}</p>
      <p className="mt-1 text-sm text-admin-muted">
        {topic.practised === 0
          ? "Not started yet."
          : `${topic.practised} of ${topic.count} practised.`}
      </p>

      <div className="mt-auto pt-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-admin-muted">
            Mastery Progress
          </span>
          <span className="font-bold text-admin-ink">{topic.mastery}%</span>
        </div>
        <ProgressBar value={topic.mastery} className="mt-1.5" />
      </div>
    </Link>
  );
}
