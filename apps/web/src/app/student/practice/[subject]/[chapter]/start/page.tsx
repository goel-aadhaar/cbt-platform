"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { StudentShell } from "@/components/student/student-shell";
import {
  ArrowRightIcon,
  ClipboardIcon,
  InfoIcon,
  ListIcon,
  TimerIcon,
} from "@/components/student/icons";
import { usePracticeFacets } from "@/hooks/use-practice";
import {
  chapterFromSlug,
  PRACTICE_PRESETS,
  subjectFromSlug,
} from "@/lib/practice";

/** "Start Practice" confirmation (Figma 183:33503). */
export default function PracticeStartPage() {
  return (
    <Suspense
      fallback={
        <StudentShell breadcrumb={["Practice Library"]}>
          <div className="mx-auto h-96 max-w-lg animate-pulse rounded-2xl bg-admin-line/10" />
        </StudentShell>
      }
    >
      <PracticeStartInner />
    </Suspense>
  );
}

function PracticeStartInner() {
  const params = useParams<{ subject: string; chapter: string }>();
  const search = useSearchParams();
  const router = useRouter();

  const subjectSlug = params.subject ?? "";
  const chapterSlug = params.chapter ?? "";
  const topic = search.get("topic");
  const presetId = search.get("preset") ?? "standard";
  const size = Number(search.get("size") ?? 25);

  const preset =
    PRACTICE_PRESETS.find((p) => p.id === presetId) ?? PRACTICE_PRESETS[1];
  const minutes = Math.max(
    5,
    Math.round((size / preset.size) * preset.minutes),
  );

  const { data } = usePracticeFacets();
  const subjectName = subjectFromSlug(data, subjectSlug);
  const subject = data?.subjects.find((s) => s.subject === subjectName) ?? null;
  const chapter = chapterFromSlug(subject, chapterSlug);

  const [timed, setTimed] = useState(false);
  const scope = topic ?? chapter?.chapter ?? subjectName ?? "this selection";
  const back = `/student/practice/${subjectSlug}/${chapterSlug}/set${topic ? `?topic=${encodeURIComponent(topic)}` : ""}`;

  function begin() {
    const qs = new URLSearchParams({ size: String(size) });
    if (topic) qs.set("topic", topic);
    if (timed) qs.set("timed", "1");
    if (timed) qs.set("minutes", String(minutes));
    router.push(
      `/student/practice/${subjectSlug}/${chapterSlug}/session?${qs}`,
    );
  }

  return (
    <StudentShell
      breadcrumb={[
        { label: "Practice Library", href: "/student/practice" },
        {
          label: subjectName ?? "Subject",
          href: `/student/practice/${subjectSlug}`,
        },
        `${preset.name} (${size} Qs)`,
      ]}
    >
      <div className="mx-auto max-w-lg">
        <div className="rounded-2xl border border-admin-line/40 bg-white p-8 text-center shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-admin/10 text-admin">
            <ClipboardIcon className="size-6" />
          </span>

          <h1 className="mt-4 text-3xl font-bold tracking-[-0.6px] text-admin-ink">
            {preset.name}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-admin-muted">
            You&apos;re about to start a practice session covering{" "}
            <span className="font-semibold text-admin-ink">{scope}</span>.
          </p>

          <div className="mt-6 flex justify-center gap-4">
            <Figure
              icon={<ListIcon className="size-4" />}
              value={size}
              label="Questions"
            />
            <Figure
              icon={<TimerIcon className="size-4" />}
              value={minutes}
              label="Minutes"
            />
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-admin-line/60 bg-admin-bg p-4 text-left">
            <span>
              <span className="flex items-center gap-1.5 text-sm font-bold text-admin-ink">
                Timed Mode
                <InfoIcon className="size-3.5 text-admin-muted" />
              </span>
              <span className="mt-0.5 block text-xs text-admin-muted">
                Keep it relaxed, or set a {minutes}-minute timer.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={timed}
              aria-label="Timed mode"
              onClick={() => setTimed((t) => !t)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                timed ? "bg-admin" : "bg-admin-line"
              }`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${
                  timed ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>

          <p className="mt-4 rounded-lg bg-admin/6 px-4 py-3 text-xs text-admin-muted">
            Practice is separate from your exams. Nothing here is proctored and
            no score is added to your results — it only updates your own
            progress in this library.
          </p>

          <button
            type="button"
            onClick={begin}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-admin px-6 py-3.5 text-base font-bold text-white hover:opacity-95"
          >
            Start Practice
            <ArrowRightIcon className="size-4" />
          </button>
          <Link
            href={back}
            className="mt-3 block text-center text-sm font-semibold text-admin-muted hover:text-admin-ink"
          >
            Cancel
          </Link>
        </div>
      </div>
    </StudentShell>
  );
}

function Figure({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="w-32 rounded-xl bg-admin-bg py-4">
      <span className="flex justify-center text-admin">{icon}</span>
      <p className="mt-1 text-2xl font-bold text-admin-ink">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
        {label}
      </p>
    </div>
  );
}
