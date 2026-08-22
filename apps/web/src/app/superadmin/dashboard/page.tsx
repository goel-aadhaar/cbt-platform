"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ActivityIcon,
  LayersIcon,
  ClipboardIcon,
  UsersIcon,
} from "@/components/admin/icons";
import {
  BarList,
  LineChart,
  Panel,
  BreakdownCard,
  StatusPill,
} from "@/components/staff/charts";
import { SuperadminShell } from "@/components/staff/superadmin-shell";
import {
  fetchOverview,
  fetchUsage,
  formatMetric,
  type PlatformOverview,
  type UsageSnapshot,
} from "@/lib/platform";

export default function SuperadminDashboardPage() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchOverview(), fetchUsage(30)])
      .then(([o, u]) => {
        if (cancelled) return;
        setOverview(o);
        setUsage(u);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? e.message
            : "Could not load the platform overview",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const t = overview?.totals;

  return (
    <SuperadminShell title="Platform Overview">
      {error && (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <BreakdownCard
          icon={LayersIcon}
          label="Institutes"
          total={t?.institutes}
          parts={[
            { label: "active", value: t?.activeInstitutes, tone: "good" },
            { label: "suspended", value: t?.suspendedInstitutes, tone: "bad" },
          ]}
          footnote={
            overview
              ? `${overview.last30Days.newInstitutes} onboarded in the last 30 days`
              : undefined
          }
        />
        <BreakdownCard
          icon={UsersIcon}
          label="Students"
          total={t?.students}
          parts={[
            { label: "active", value: t?.activeStudents, tone: "good" },
            { label: "invited", value: t?.pendingStudents, tone: "warn" },
            { label: "disabled", value: t?.disabledStudents, tone: "bad" },
          ]}
        />
        <BreakdownCard
          icon={ClipboardIcon}
          label="Exams"
          total={t?.exams}
          parts={[
            {
              label: "created in 30d",
              value: overview?.last30Days.exams,
              tone: "neutral",
            },
            { label: "in progress", value: overview?.liveExams, tone: "good" },
          ]}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          title="Tenant growth"
          subtitle="Total institutes on the platform, by month"
        >
          <LineChart
            points={(overview?.growth ?? []).map((g) => ({
              label: g.month,
              value: g.value,
            }))}
          />
        </Panel>

        <Panel
          title="Busiest institutes"
          subtitle="By exam attempts"
          action={
            <Link
              href="/superadmin/tenants"
              className="text-xs font-bold uppercase text-admin hover:underline"
            >
              All institutes
            </Link>
          }
        >
          <BarList
            items={(overview?.busiestInstitutes ?? []).map((b) => ({
              label: b.name,
              value: b.attempts,
            }))}
            empty="No attempts recorded yet"
          />
        </Panel>
      </div>

      <div className="mt-6">
        <Panel
          title="Platform usage"
          subtitle={usage?.note}
          action={
            usage && (
              <StatusPill
                tone={usage.source === "cloudwatch" ? "good" : "muted"}
              >
                {usage.source === "cloudwatch"
                  ? "AWS CloudWatch"
                  : "measured locally"}
              </StatusPill>
            )
          }
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            {(usage?.metrics ?? []).map((m) => (
              <div key={m.key}>
                <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
                  {m.label}
                </p>
                <p className="mt-1 text-2xl font-bold text-admin-ink">
                  {formatMetric(m.value, m.unit)}
                </p>
                <div className="mt-2">
                  <LineChart
                    height={90}
                    points={m.series.map((s) => ({
                      label: s.date.slice(5),
                      value: s.value,
                    }))}
                    format={(v) => formatMetric(v, m.unit)}
                  />
                </div>
                {/* Where the number came from, so nobody has to guess whether
                    it is a real measurement or a placeholder. */}
                <p className="mt-1 text-[11px] text-admin-subtle">{m.origin}</p>
              </div>
            ))}
            {!usage && (
              <p className="text-sm text-admin-muted">Loading usage…</p>
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title="At a glance" subtitle="Across every tenant">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Glance
              icon={ActivityIcon}
              label="Attempts (30d)"
              value={overview?.last30Days.attempts}
            />
            <Glance
              icon={ActivityIcon}
              label="Attempts (all time)"
              value={t?.attempts}
            />
            <Glance icon={UsersIcon} label="Staff accounts" value={t?.staff} />
            <Glance
              icon={UsersIcon}
              label="Active institutes"
              value={t?.activeInstitutes}
            />
          </div>
        </Panel>
      </div>
    </SuperadminShell>
  );
}

function Glance({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="rounded-xl border border-admin-line/60 bg-admin-bg/40 p-4">
      <span className="flex size-8 items-center justify-center rounded-full bg-white text-admin-muted">
        <Icon className="size-4" />
      </span>
      <p className="mt-2 text-xl font-bold text-admin-ink">
        {value === undefined ? "…" : value.toLocaleString("en-IN")}
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
        {label}
      </p>
    </div>
  );
}
