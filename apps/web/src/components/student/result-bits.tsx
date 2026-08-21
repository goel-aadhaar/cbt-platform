"use client";

import type { ComponentType, SVGProps } from "react";

import {
  PERFORMANCE_LABEL,
  type PerformanceBand,
} from "@/lib/result-analytics";

/* ------------------------------------------------------------------ *
 * Cards and panels                                                     *
 * ------------------------------------------------------------------ */

/** The standard student card shell, so every result panel matches. */
export function ResultCard({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)] ${className}`}
    >
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="text-base font-bold text-admin-ink">{title}</h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-admin-muted">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** A single headline number with a caption. */
export function ResultStat({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "good" | "bad" | "warn" | "muted";
}) {
  const valueTone =
    tone === "good"
      ? "text-success"
      : tone === "bad"
        ? "text-danger"
        : tone === "warn"
          ? "text-warn"
          : tone === "muted"
            ? "text-admin-muted"
            : "text-admin-ink";

  return (
    <div className="rounded-xl border border-admin-line/40 bg-white p-4">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-4 text-admin-muted" />}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
          {label}
        </p>
      </div>
      <p className={`mt-2 text-2xl font-bold ${valueTone}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-admin-subtle">{hint}</p>}
    </div>
  );
}

/**
 * "Not recorded" placeholder.
 *
 * Used wherever data genuinely does not exist for an attempt — per-question
 * timing on an attempt sat before it was instrumented, say. Showing this beats
 * showing a 0 that reads as a real measurement.
 */
export function NotRecorded({ what }: { what: string }) {
  return (
    <p className="rounded-lg border border-dashed border-admin-line bg-admin-bg/50 px-4 py-6 text-center text-sm text-admin-muted">
      {what}
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * Badges                                                               *
 * ------------------------------------------------------------------ */

const BAND_STYLE: Record<PerformanceBand, string> = {
  EXCELLENT: "bg-admin-mint/50 text-admin",
  GOOD: "bg-brand-soft text-brand",
  NEEDS_IMPROVEMENT: "bg-warn/15 text-warn",
};

export function PerformanceBadge({ band }: { band: PerformanceBand }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${BAND_STYLE[band]}`}
    >
      {PERFORMANCE_LABEL[band]}
    </span>
  );
}

export function PassFailBadge({ passed }: { passed: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
        passed ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
      }`}
    >
      {passed ? "Passed" : "Not cleared"}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Bars                                                                 *
 * ------------------------------------------------------------------ */

/**
 * A labelled horizontal bar, scaled against `max` rather than 100 — so a set
 * of bars in one panel stays comparable to each other.
 */
export function MeterRow({
  label,
  caption,
  value,
  max,
  tone = "admin",
}: {
  label: string;
  caption?: string;
  value: number;
  max: number;
  tone?: "admin" | "muted" | "good" | "bad";
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill =
    tone === "muted"
      ? "bg-admin-line"
      : tone === "good"
        ? "bg-success"
        : tone === "bad"
          ? "bg-danger"
          : "bg-admin";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-admin-ink">{label}</span>
        {caption && (
          <span className="shrink-0 text-xs text-admin-muted">{caption}</span>
        )}
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-admin-line/30">
        <div
          className={`h-full rounded-full ${fill} transition-[width] duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Proportional stacked bar — correct / incorrect / skipped across one row.
 * Segments below a visible width are dropped rather than rendered as slivers.
 */
export function StackedBar({
  segments,
}: {
  segments: { label: string; value: number; className: string }[];
}) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  if (total === 0) {
    return <div className="h-2.5 w-full rounded-full bg-admin-line/30" />;
  }
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-admin-line/30">
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <div
            key={s.label}
            className={s.className}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
    </div>
  );
}

/** Legend entry matching a {@link StackedBar} segment. */
export function LegendDot({
  className,
  label,
  value,
}: {
  className: string;
  label: string;
  value: number | string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-admin-muted">
      <span className={`size-2.5 rounded-full ${className}`} />
      {label}
      <span className="font-bold text-admin-ink">{value}</span>
    </span>
  );
}
