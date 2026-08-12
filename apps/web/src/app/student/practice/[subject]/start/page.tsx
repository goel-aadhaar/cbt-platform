"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import {
  ArrowRightIcon,
  ClipboardIcon,
  ListIcon,
  TimerIcon,
} from "@/components/student/icons";

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function StartPracticePage() {
  const params = useParams<{ subject: string }>();
  const subject = params.subject ?? "physics";
  const subjectName = titleCase(subject);
  const [timed, setTimed] = useState(false);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-admin/[0.04] px-4 py-10 [font-family:var(--font-hanken)] text-admin-ink">
      {/* breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-admin-muted">
        <span>Practice Library</span>
        <span className="text-admin-line">›</span>
        <span>{subjectName}</span>
        <span className="text-admin-line">›</span>
        <span className="font-semibold text-admin">Standard Set (25 Qs)</span>
      </nav>

      <div className="w-full max-w-lg rounded-3xl border border-admin-line/40 bg-white p-10 text-center shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-admin-surface text-admin">
          <ClipboardIcon className="size-7" />
        </span>
        <h1 className="mt-5 text-4xl font-bold tracking-tight text-admin-ink">
          Standard Set
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-admin-muted">
          You&apos;re about to start a practice session covering core concepts
          in {subjectName}.
        </p>

        <div className="mt-6 flex justify-center gap-4">
          <InfoTile
            icon={<ListIcon className="size-5" />}
            value="25"
            label="Questions"
          />
          <InfoTile
            icon={<TimerIcon className="size-5" />}
            value="40"
            label="Minutes"
          />
        </div>

        <div className="mt-6 flex items-center justify-between rounded-2xl border border-admin-line/60 p-4 text-left">
          <div>
            <p className="flex items-center gap-1.5 font-bold text-admin-ink">
              Timed Mode
              <span className="text-admin-muted">ⓘ</span>
            </p>
            <p className="text-sm text-admin-muted">
              Keep it relaxed or set a timer
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={timed}
            aria-label="Toggle timed mode"
            onClick={() => setTimed((v) => !v)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              timed ? "bg-admin" : "bg-admin-line"
            }`}
          >
            <span
              className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${
                timed ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <Link
          href={`/student/practice/${subject}/session`}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-admin py-4 text-base font-bold text-white hover:opacity-95"
        >
          Start Practice
          <ArrowRightIcon className="size-4" />
        </Link>
        <Link
          href={`/student/practice/${subject}`}
          className="mt-4 inline-block text-sm font-semibold text-admin-muted hover:text-admin-ink"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}

function InfoTile({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex w-32 flex-col items-center gap-1 rounded-2xl bg-admin-bg py-4">
      <span className="text-admin">{icon}</span>
      <span className="text-xl font-bold text-admin-ink">{value}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
        {label}
      </span>
    </div>
  );
}
