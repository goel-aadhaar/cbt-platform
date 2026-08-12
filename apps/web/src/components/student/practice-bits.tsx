"use client";

import Link from "next/link";

import { ChevronRightIcon } from "@/components/student/icons";

/** Thin progress rail used across the practice library screens. */
export function ProgressBar({
  value,
  className = "",
}: {
  /** 0–100. */
  value: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-admin-line/30 ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-admin/70 to-admin transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** "45% Completed" / "Not Started" — the design's progress caption. */
export function completionLabel(practised: number, count: number): string {
  if (count === 0) return "No questions yet";
  if (practised === 0) return "Not Started";
  const pct = Math.round((practised / count) * 100);
  return pct >= 100 ? "Completed" : `${pct}% Completed`;
}

/** Breadcrumb-style back link shown above each practice screen's heading. */
export function PracticeBack({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-admin-muted hover:text-admin-ink"
    >
      <ChevronRightIcon className="size-4 rotate-180" />
      {label}
    </Link>
  );
}

export function EmptyPractice({
  title,
  body,
  actionHref,
  actionLabel,
}: {
  title: string;
  body: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-admin-line bg-white p-12 text-center">
      <p className="text-base font-bold text-admin-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-admin-muted">{body}</p>
      <Link
        href={actionHref}
        className="mt-5 inline-flex rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
