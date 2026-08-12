"use client";

import type { ComponentType, SVGProps } from "react";

/**
 * Small chart + card primitives for the staff dashboards.
 *
 * Hand-rolled SVG rather than a charting library: these are four simple shapes,
 * and the alternative is a dependency bigger than the feature. They follow the
 * admin console's card language so the three consoles look like one product.
 */

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string | number | undefined;
  hint?: string;
  tone?: "default" | "warn" | "good";
}) {
  const pill =
    tone === "warn"
      ? "bg-danger-soft text-[#8c1d18]"
      : tone === "good"
        ? "bg-admin-mint/50 text-admin"
        : "bg-admin-surface text-admin-muted";

  return (
    <div className="rounded-2xl border border-admin-line/60 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between">
        {Icon && (
          <span className="flex size-12 items-center justify-center rounded-full bg-admin-surface text-admin-muted">
            <Icon className="size-5" />
          </span>
        )}
        {hint && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pill}`}
          >
            {hint}
          </span>
        )}
      </div>
      <p className="mt-4 text-3xl font-bold text-admin-ink">
        {value === undefined
          ? "…"
          : typeof value === "number"
            ? value.toLocaleString("en-IN")
            : value}
      </p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-admin-muted">
        {label}
      </p>
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-admin-line/60 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-admin-ink">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-admin-muted">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Line chart for a dated series.
 *
 * An all-zero or single-point series is drawn as an explicit "no data yet"
 * message instead of a flat line, because a flat line at zero reads as a
 * measurement rather than as an absence of one.
 */
export function LineChart({
  points,
  height = 160,
  format = (v: number) => v.toLocaleString(),
}: {
  points: { label: string; value: number }[];
  height?: number;
  format?: (v: number) => string;
}) {
  if (points.length < 2 || points.every((p) => p.value === 0)) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-xl border border-dashed border-admin-line text-sm text-admin-muted"
      >
        Not enough data yet
      </div>
    );
  }

  const width = 600;
  const pad = { top: 10, right: 8, bottom: 22, left: 8 };
  const max = Math.max(...points.map((p) => p.value));
  const min = Math.min(...points.map((p) => p.value), 0);
  const span = max - min || 1;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const x = (i: number) => pad.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => pad.top + innerH - ((v - min) / span) * innerH;

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const area =
    `${pad.left},${pad.top + innerH} ` +
    line +
    ` ${x(points.length - 1)},${pad.top + innerH}`;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-auto w-full"
        role="img"
        aria-label={`Chart from ${points[0].label} to ${points[points.length - 1].label}, latest ${format(points[points.length - 1].value)}`}
      >
        <polygon points={area} fill="var(--color-admin)" opacity="0.08" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-admin)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={x(points.length - 1)}
          cy={y(points[points.length - 1].value)}
          r="3.5"
          fill="var(--color-admin)"
        />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-admin-muted">
        <span>{points[0].label}</span>
        <span className="font-semibold text-admin-ink">
          {format(points[points.length - 1].value)}
        </span>
        <span>{points[points.length - 1].label}</span>
      </figcaption>
    </figure>
  );
}

/** Horizontal bars for a ranked list (busiest tenants, top performers). */
export function BarList({
  items,
  format = (v: number) => v.toLocaleString(),
  empty = "Nothing to show yet",
}: {
  items: { label: string; value: number; href?: string }[];
  format?: (v: number) => string;
  empty?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-admin-line p-6 text-center text-sm text-admin-muted">
        {empty}
      </p>
    );
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="flex flex-col gap-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-semibold text-admin-ink">
              {i.label}
            </span>
            <span className="shrink-0 text-sm font-bold text-admin">
              {format(i.value)}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-admin-surface">
            <div
              className="h-full rounded-full bg-admin"
              style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Consistent status pill across both consoles. */
export function StatusPill({
  tone,
  children,
}: {
  tone: "good" | "warn" | "bad" | "muted";
  children: React.ReactNode;
}) {
  const cls = {
    good: "bg-admin-mint/50 text-admin",
    warn: "bg-[#fff4e0] text-[#8a5a00]",
    bad: "bg-danger-soft text-[#8c1d18]",
    muted: "bg-admin-surface text-admin-muted",
  }[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${cls}`}
    >
      {children}
    </span>
  );
}
