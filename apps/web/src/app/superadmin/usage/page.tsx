"use client";

import { useEffect, useState } from "react";

import { LineChart, Panel, StatusPill } from "@/components/staff/charts";
import { SuperadminShell } from "@/components/staff/superadmin-shell";
import { fetchUsage, formatMetric, type UsageSnapshot } from "@/lib/platform";

const WINDOWS = [7, 30, 90];

export default function UsagePage() {
  const [days, setDays] = useState(30);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setUsage(null);
      try {
        const u = await fetchUsage(days);
        if (!cancelled) setUsage(u);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load usage");
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <SuperadminShell title="Usage">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {WINDOWS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                days === d
                  ? "bg-admin text-white"
                  : "border border-admin-line bg-white text-admin-ink hover:bg-admin-bg"
              }`}
            >
              {d} days
            </button>
          ))}
        </div>
        {usage && (
          <StatusPill tone={usage.source === "cloudwatch" ? "good" : "muted"}>
            {usage.source === "cloudwatch"
              ? "AWS CloudWatch"
              : "measured locally"}
          </StatusPill>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {usage && (
        <p className="mb-6 rounded-xl border border-admin-line/60 bg-white px-4 py-3 text-sm text-admin-muted">
          {usage.note}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {(usage?.metrics ?? []).map((m) => (
          <Panel key={m.key} title={m.label} subtitle={m.origin}>
            <p className="mb-3 text-3xl font-bold text-admin-ink">
              {formatMetric(m.value, m.unit)}
            </p>
            <LineChart
              points={m.series.map((s) => ({
                label: s.date.slice(5),
                value: s.value,
              }))}
              format={(v) => formatMetric(v, m.unit)}
            />
          </Panel>
        ))}
        {!usage && !error && (
          <>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-2xl bg-admin-line/15"
              />
            ))}
          </>
        )}
      </div>
    </SuperadminShell>
  );
}
