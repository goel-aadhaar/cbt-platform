"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { StudentShell } from "@/components/student/student-shell";
import {
  ClipboardIcon,
  FlameIcon,
  TimerIcon,
  TrophyIcon,
} from "@/components/student/icons";
import { PracticeBack } from "@/components/student/practice-bits";
import { usePracticeFacets } from "@/hooks/use-practice";
import {
  chapterFromSlug,
  PRACTICE_PRESETS,
  subjectFromSlug,
  type PracticePreset,
} from "@/lib/practice";

/**
 * "Choose Your Practice Set" (Figma 183:34401).
 *
 * Preset sizes are capped by what the scope actually holds — offering a
 * 50-question set over a 12-question topic would be a lie.
 */
export default function PracticeSetPage() {
  return (
    <Suspense
      fallback={
        <StudentShell breadcrumb={["Practice Library"]}>
          <div className="h-64 animate-pulse rounded-2xl bg-admin-line/10" />
        </StudentShell>
      }
    >
      <PracticeSetInner />
    </Suspense>
  );
}

const ICONS = {
  quick: FlameIcon,
  standard: ClipboardIcon,
  full: TrophyIcon,
} as const;

function PracticeSetInner() {
  const params = useParams<{ subject: string; chapter: string }>();
  const search = useSearchParams();
  const subjectSlug = params.subject ?? "";
  const chapterSlug = params.chapter ?? "";
  const topic = search.get("topic");

  const { data, loading } = usePracticeFacets();
  const subjectName = subjectFromSlug(data, subjectSlug);
  const subject = data?.subjects.find((s) => s.subject === subjectName) ?? null;
  const chapter = chapterFromSlug(subject, chapterSlug);

  const available = topic
    ? (chapter?.topics.find((t) => t.topic === topic)?.count ?? 0)
    : (chapter?.count ?? 0);

  const scopeLabel = topic ?? chapter?.chapter ?? subjectName ?? "";
  const back = `/student/practice/${subjectSlug}/${chapterSlug}`;

  return (
    <StudentShell
      breadcrumb={[
        "Practice Library",
        subjectName ?? "Subject",
        chapter?.chapter ?? "Chapter",
        "Set",
      ]}
    >
      <PracticeBack href={back} label={chapter?.chapter ?? "Back"} />

      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          Choose Your Practice Set
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          Select a session length that fits your current focus and available
          time.
          {scopeLabel && (
            <>
              {" "}
              You&apos;re practising{" "}
              <span className="font-semibold text-admin-ink">{scopeLabel}</span>
              {available > 0 && ` (${available} available)`}.
            </>
          )}
        </p>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-2xl border border-admin-line/40 bg-admin-line/10"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {PRACTICE_PRESETS.map((p) => (
            <PresetCard
              key={p.id}
              preset={p}
              available={available}
              href={buildHref(back, p, topic, available)}
            />
          ))}
        </div>
      )}
    </StudentShell>
  );
}

function buildHref(
  back: string,
  preset: PracticePreset,
  topic: string | null,
  available: number,
): string {
  const size = Math.min(preset.size, available || preset.size);
  const qs = new URLSearchParams({ preset: preset.id, size: String(size) });
  if (topic) qs.set("topic", topic);
  return `${back}/start?${qs}`;
}

function PresetCard({
  preset,
  available,
  href,
}: {
  preset: PracticePreset;
  available: number;
  href: string;
}) {
  const Icon = ICONS[preset.id];
  const size = Math.min(preset.size, available || preset.size);
  const capped = available > 0 && preset.size > available;
  const disabled = available === 0;

  const body = (
    <>
      {preset.recommended && (
        <span className="absolute right-0 top-0 rounded-bl-lg rounded-tr-2xl bg-admin px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
          Recommended
        </span>
      )}
      <span
        className={`flex size-11 items-center justify-center rounded-xl ${
          preset.recommended ? "bg-admin text-white" : "bg-admin/10 text-admin"
        }`}
      >
        <Icon className="size-5" />
      </span>

      <p className="mt-4 text-xl font-bold text-admin-ink">{preset.name}</p>
      <p className="mt-1 text-sm font-semibold text-admin-muted">
        {size} Question{size === 1 ? "" : "s"}
        {capped && (
          <span className="font-normal"> · all that&apos;s available</span>
        )}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-admin-muted">
        <TimerIcon className="size-3.5" />
        Est. {Math.max(
          5,
          Math.round((size / preset.size) * preset.minutes),
        )}{" "}
        mins
      </p>
      <p className="mt-3 text-sm text-admin-muted">{preset.blurb}</p>

      <div className="mt-auto pt-5">
        <p className="text-xs font-semibold text-admin-muted">Difficulty Mix</p>
        <div className="mt-1.5 flex h-2 overflow-hidden rounded-full">
          <span className="flex-1 bg-emerald-400" />
          <span
            className={`bg-admin-line ${preset.id === "quick" ? "flex-[2]" : "flex-[3]"}`}
          />
          <span
            className={`${preset.id === "full" ? "flex-1 bg-red-500" : "flex-[2] bg-admin-ink/70"}`}
          />
        </div>
        <p className="mt-1 text-xs text-admin-muted">{preset.mix}</p>
      </div>
    </>
  );

  const shell =
    "relative flex flex-col overflow-hidden rounded-2xl border bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)]";

  if (disabled) {
    return (
      <div
        className={`${shell} border-admin-line/40 opacity-50`}
        aria-disabled="true"
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={`${shell} transition-shadow hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] ${
        preset.recommended ? "border-2 border-admin" : "border-admin-line/40"
      }`}
    >
      {body}
    </Link>
  );
}
