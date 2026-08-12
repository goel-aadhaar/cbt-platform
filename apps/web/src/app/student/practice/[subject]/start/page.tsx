"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { StudentShell } from "@/components/student/student-shell";
import { PlayIcon, TargetIcon } from "@/components/student/icons";
import { usePracticeFacets } from "@/hooks/use-practice";
import { subjectFromSlug, type PracticeDifficulty } from "@/lib/practice";

const SIZES = [5, 10, 20];
const LEVELS: { value: PracticeDifficulty | "ALL"; label: string }[] = [
  { value: "ALL", label: "Mixed" },
  { value: "EASY", label: "Easy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HARD", label: "Hard" },
];

export default function PracticeStartPage() {
  return (
    <Suspense
      fallback={
        <StudentShell breadcrumb={["Practice Library"]}>
          <div />
        </StudentShell>
      }
    >
      <PracticeStartInner />
    </Suspense>
  );
}

/** Configure a practice set, then hand the choices to the session screen. */
function PracticeStartInner() {
  const params = useParams<{ subject: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const slug = params.subject ?? "";
  const chapter = search.get("chapter");

  const { data } = usePracticeFacets();
  const subject = subjectFromSlug(data, slug);

  const [size, setSize] = useState(10);
  const [level, setLevel] = useState<PracticeDifficulty | "ALL">("ALL");

  function begin() {
    const qs = new URLSearchParams({ limit: String(size) });
    if (chapter) qs.set("chapter", chapter);
    if (level !== "ALL") qs.set("difficulty", level);
    router.push(`/student/practice/${slug}/session?${qs}`);
  }

  return (
    <StudentShell
      breadcrumb={["Practice Library", subject ?? "Subject", "Start"]}
    >
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-admin/10 text-admin">
            <TargetIcon className="size-7" />
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-[-0.6px] text-admin-ink">
            Ready to practise?
          </h1>
          <p className="mt-1 text-sm text-admin-muted">
            {chapter ? (
              <>
                {subject} · <span className="font-semibold">{chapter}</span>
              </>
            ) : (
              <>All chapters in {subject ?? "this subject"}</>
            )}
          </p>
        </header>

        <div className="rounded-2xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
          <Fieldset label="How many questions?">
            {SIZES.map((n) => (
              <Choice
                key={n}
                active={size === n}
                onClick={() => setSize(n)}
                label={String(n)}
              />
            ))}
          </Fieldset>

          <Fieldset label="Difficulty">
            {LEVELS.map((l) => (
              <Choice
                key={l.value}
                active={level === l.value}
                onClick={() => setLevel(l.value)}
                label={l.label}
              />
            ))}
          </Fieldset>

          <p className="mt-5 rounded-lg bg-admin/6 px-4 py-3 text-xs text-admin-muted">
            No timer, no proctoring, and nothing is recorded against your exam
            results. Each answer is checked as you go, with the explanation
            revealed once you commit.
          </p>

          <button
            type="button"
            onClick={begin}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-admin px-6 py-3.5 text-base font-bold text-white hover:opacity-95"
          >
            <PlayIcon className="size-5" />
            Start Practice
          </button>
          <Link
            href={`/student/practice/${slug}`}
            className="mt-3 block text-center text-sm font-semibold text-admin-muted hover:text-admin-ink"
          >
            Choose a different chapter
          </Link>
        </div>
      </div>
    </StudentShell>
  );
}

function Fieldset({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="mb-2 text-sm font-bold text-admin-ink">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Choice({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-w-16 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-admin bg-admin text-white"
          : "border-admin-line/60 bg-white text-admin-ink hover:bg-admin/5"
      }`}
    >
      {label}
    </button>
  );
}
