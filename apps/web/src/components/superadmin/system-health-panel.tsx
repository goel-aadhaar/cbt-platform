"use client";

import { useEffect, useState } from "react";

import { Panel, StatusPill } from "@/components/staff/charts";
import { formatBytes } from "@/lib/media";
import {
  fetchSystemHealth,
  formatDuration,
  type SystemHealth,
} from "@/lib/platform";

/**
 * Machine and application vitals (§2.17).
 *
 * Measured by the API about itself and the host it runs on, which is why this
 * works with no AWS agent installed: EC2 publishes CPU to CloudWatch out of the
 * box but *not* memory or disk — those need the CloudWatch agent, which is
 * infrastructure the client owns. Read from the host they need nothing and are
 * the same numbers the agent would publish.
 *
 * Two honesty rules run through this panel. A metric the platform cannot
 * measure renders as "unavailable", never as zero — a zero here would read as
 * an idle machine rather than a missing reading. And the API window is stated
 * as what it is: in-memory, reset by a restart, per-instance.
 */

/** How often to re-poll. Slow enough not to be its own load. */
const REFRESH_MS = 15_000;

export function SystemHealthPanel() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = () =>
      fetchSystemHealth()
        .then((h) => {
          if (cancelled) return;
          setHealth(h);
          setError(null);
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setError(
              e instanceof Error ? e.message : "Could not read system health",
            );
          }
        });

    void run();
    const id = setInterval(() => void run(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const api = health?.api;

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <Panel
        title="Host"
        subtitle={
          health
            ? `${health.host.hostname} · ${health.host.platform} ${health.host.release} · up ${formatDuration(health.host.uptimeSeconds)}`
            : "Reading the machine…"
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Gauge
            label="CPU utilisation"
            percent={health?.host.cpu.utilisationPercent}
            detail={
              health
                ? `${health.host.cpu.cores} core(s)` +
                  (health.host.cpu.loadAverage
                    ? ` · load ${health.host.cpu.loadAverage.join(" / ")}`
                    : "")
                : undefined
            }
          />
          <Gauge
            label="Memory usage"
            percent={health?.host.memory.usedPercent}
            detail={
              health
                ? `${formatBytes(health.host.memory.usedBytes)} of ${formatBytes(health.host.memory.totalBytes)}`
                : undefined
            }
          />
          {/* Rendered as unavailable rather than omitted, so a missing reading
              is visibly missing instead of quietly absent from the page. */}
          <Gauge
            label="Disk usage"
            percent={
              health ? (health.host.disk?.usedPercent ?? null) : undefined
            }
            detail={
              health
                ? health.host.disk
                  ? `${formatBytes(health.host.disk.usedBytes)} of ${formatBytes(health.host.disk.totalBytes)} on ${health.host.disk.path}`
                  : "This platform does not report filesystem statistics"
                : undefined
            }
          />
        </div>
      </Panel>

      <Panel
        title="API"
        subtitle={
          api
            ? `Last ${api.windowMinutes} minutes${api.truncated ? " (trimmed — very high traffic)" : ""} · in-memory, resets on restart, one instance`
            : "Reading request metrics…"
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label="Requests"
            value={api ? api.requests.toLocaleString("en-IN") : undefined}
            hint={api ? `${api.requestsPerMinute}/min` : undefined}
          />
          <Figure
            label="Response time (p95)"
            value={api?.responseTime ? `${api.responseTime.p95} ms` : undefined}
            hint={
              api?.responseTime
                ? `p50 ${api.responseTime.p50} · p99 ${api.responseTime.p99} · max ${api.responseTime.max} ms`
                : api
                  ? "No requests in the window yet"
                  : undefined
            }
            empty={Boolean(api && !api.responseTime)}
          />
          <Figure
            label="Errors"
            value={api ? api.errors.total.toLocaleString("en-IN") : undefined}
            hint={
              api
                ? `${api.errors.client} client · ${api.errors.server} server`
                : undefined
            }
            tone={
              api && api.errors.server > 0
                ? "bad"
                : api && api.errors.total > 0
                  ? "warn"
                  : "good"
            }
          />
          <Figure
            label="Error rate"
            value={api ? `${api.errors.rate}%` : undefined}
            hint={
              health
                ? `process up ${formatDuration(health.process.uptimeSeconds)}`
                : undefined
            }
            tone={
              api && api.errors.rate >= 5
                ? "bad"
                : api && api.errors.rate > 0
                  ? "warn"
                  : "good"
            }
          />
        </div>

        {api && Object.keys(api.byStatusFamily).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-admin-line/50 pt-4">
            {Object.entries(api.byStatusFamily)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([family, count]) => (
                <StatusPill
                  key={family}
                  tone={
                    family.startsWith("5")
                      ? "bad"
                      : family.startsWith("4")
                        ? "warn"
                        : "good"
                  }
                >
                  {family} · {count.toLocaleString("en-IN")}
                </StatusPill>
              ))}
          </div>
        )}
      </Panel>

      <Panel
        title="API process"
        subtitle={
          health
            ? `Node ${health.process.nodeVersion} · pid ${health.process.pid}`
            : "…"
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Figure
            label="Resident memory"
            value={
              health ? formatBytes(health.process.memory.rssBytes) : undefined
            }
          />
          <Figure
            label="Heap used"
            value={
              health
                ? formatBytes(health.process.memory.heapUsedBytes)
                : undefined
            }
            hint={
              health
                ? `of ${formatBytes(health.process.memory.heapTotalBytes)} allocated`
                : undefined
            }
          />
          <Figure
            label="Uptime"
            value={
              health ? formatDuration(health.process.uptimeSeconds) : undefined
            }
          />
        </div>
      </Panel>
    </div>
  );
}

/**
 * A percentage with a bar. `null` means measured-as-unavailable and
 * `undefined` means not-loaded-yet — they look different on purpose.
 */
function Gauge({
  label,
  percent,
  detail,
}: {
  label: string;
  percent: number | null | undefined;
  detail?: string;
}) {
  const bar =
    percent == null
      ? "bg-admin-line"
      : percent >= 90
        ? "bg-danger"
        : percent >= 75
          ? "bg-warn"
          : "bg-admin";

  return (
    <div className="rounded-xl border border-admin-line/60 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
          {label}
        </p>
        <p className="text-lg font-bold text-admin-ink">
          {percent === undefined ? "…" : percent === null ? "—" : `${percent}%`}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-admin-surface">
        <div
          className={`h-full rounded-full transition-all ${bar}`}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-admin-subtle">
        {percent === null ? (detail ?? "Unavailable") : (detail ?? "")}
      </p>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  tone = "default",
  empty = false,
}: {
  label: string;
  value: string | undefined;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
  empty?: boolean;
}) {
  const colour =
    tone === "bad"
      ? "text-danger"
      : tone === "warn"
        ? "text-[#8a5a00]"
        : "text-admin-ink";

  return (
    <div className="rounded-xl border border-admin-line/60 bg-white p-4">
      <p
        className={`text-2xl font-bold ${empty ? "text-admin-subtle" : colour}`}
      >
        {value === undefined ? "…" : empty ? "—" : value}
      </p>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-admin-muted">
        {label}
      </p>
      {hint && <p className="mt-1 text-xs text-admin-subtle">{hint}</p>}
    </div>
  );
}
