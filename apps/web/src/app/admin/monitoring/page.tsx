"use client";

import { useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { MonitorDetailDrawer } from "@/components/admin/monitor-detail-drawer";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  ExternalLinkIcon,
  GraduationCapIcon,
  RadioIcon,
} from "@/components/admin/icons";

interface Session {
  scope: string;
  name: string;
  attempting: string;
  remaining: string;
  submitted: string;
  progress: number;
  incidents?: number;
}

const SESSIONS: Session[] = [
  {
    scope: "Batch 2024",
    name: "NEET Full Mock 04",
    attempting: "2,450",
    remaining: "~45m remaining",
    submitted: "845",
    progress: 25,
    incidents: 2,
  },
  {
    scope: "Class 12 - Section A",
    name: "Physics Weekly Test",
    attempting: "120",
    remaining: "~12m remaining",
    submitted: "1,105",
    progress: 90,
  },
];

const INCIDENTS = [
  {
    title: "Tab-switch flagged",
    who: "Rohan S., NEET Full Mock 04",
    ago: "2 min ago",
    action: "Review Snapshot",
    severe: true,
  },
  {
    title: "Network disconnect",
    who: "Ananya P., Physics Weekly Test",
    ago: "5 min ago",
    action: "Auto-resolved",
    severe: false,
  },
  {
    title: "Multiple faces detected",
    who: "Vikram K., NEET Full Mock 04",
    ago: "12 min ago",
    action: "Review Video",
    severe: true,
  },
];

const CONCLUDED = [
  { name: "Chemistry Term 1", meta: "Ended 45m ago · 450 students" },
  { name: "Math Unit Test", meta: "Ended 2h ago · 1,200 students" },
  { name: "Biology Mock B", meta: "Ended 4h ago · 320 students" },
];

export default function MonitoringPage() {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <AdminShell title="Live Monitoring">
      {/* System status strip */}
      <div className="-mx-8 -mt-6 mb-6 flex flex-wrap items-center gap-x-8 gap-y-1 border-b border-admin-line/60 bg-white px-8 py-2.5 font-mono text-xs text-admin-muted">
        <Strip dot>API UPTIME: 99.99%</Strip>
        <Strip dot>AUTO-SAVE QUEUE: OPERATIONAL</Strip>
        <Strip dot>DB LATENCY: 12MS</Strip>
        <span className="flex items-center gap-2">
          <GraduationCapIcon className="size-3.5 text-admin" />
          PROCTORING AI: <span className="text-admin">ACTIVE</span>
        </span>
      </div>

      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-bold text-admin-ink">Live Monitoring</h2>
          <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-admin-line bg-white px-4 py-2 text-sm font-semibold text-admin-ink">
            <span className="size-2 rounded-full bg-admin" />3 exams live ·
            4,680 students currently attempting
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.9fr_1fr]">
          {/* Left */}
          <div className="flex flex-col gap-4">
            <h3 className="flex items-center gap-2 text-lg font-bold text-admin-ink">
              <RadioIcon className="size-5 text-admin" /> Active Sessions
            </h3>

            {SESSIONS.map((s) => (
              <div
                key={s.name}
                role="button"
                tabIndex={0}
                onClick={() => setDetailOpen(true)}
                className="flex cursor-pointer items-center gap-4 rounded-2xl border border-admin-line/60 border-l-4 border-l-admin bg-white p-5 hover:bg-admin-bg/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-admin-surface px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-admin-muted">
                      {s.scope}
                    </span>
                    {s.incidents && (
                      <span className="flex items-center gap-1 rounded bg-danger/10 px-2 py-0.5 text-[11px] font-bold uppercase text-danger">
                        <AlertTriangleIcon className="size-3" /> {s.incidents}{" "}
                        Incidents
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-lg font-bold text-admin-ink">
                    {s.name}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-admin-muted">
                    <span className="flex items-center gap-1.5 font-semibold text-admin-ink">
                      <span className="size-1.5 rounded-full bg-admin" />{" "}
                      {s.attempting} attempting now
                    </span>
                    <span className="text-admin-line">·</span>
                    <span className="flex items-center gap-1">
                      <ClockIcon className="size-3.5" /> {s.remaining}
                    </span>
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-admin-ink">
                    {s.submitted}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-admin-muted">
                    Submitted
                  </p>
                </div>
                <Ring pct={s.progress} />
                <ChevronRightIcon className="size-5 text-admin-muted" />
              </div>
            ))}

            {/* Incident feed */}
            <div className="mt-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-admin-ink">
                <AlertTriangleIcon className="size-5 text-danger" /> Live
                Incident Feed
              </h3>
              <button className="text-xs font-bold uppercase tracking-wide text-admin-2">
                View All
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl border border-admin-line/60 bg-white">
              {INCIDENTS.map((it, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-4 ${i > 0 ? "border-t border-admin-line/50" : ""}`}
                >
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${it.severe ? "bg-danger" : "bg-warn"}`}
                  />
                  <div>
                    <p className="text-sm">
                      <span
                        className={`font-bold ${it.severe ? "text-danger" : "text-admin-ink"}`}
                      >
                        {it.title}
                      </span>
                      <span className="text-admin-ink"> — {it.who}</span>
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-admin-subtle">
                      {it.ago}{" "}
                      <span className="ml-1 font-sans font-semibold text-admin-2">
                        {it.action}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right rail */}
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl bg-admin p-5 text-white">
              <h3 className="text-lg font-bold">Global Network Load</h3>
              <LoadBar label="Bandwidth Usage" pct={42} />
              <LoadBar label="Server Capacity" pct={68} />
            </section>

            <section>
              <h3 className="flex items-center gap-2 text-lg font-bold text-admin-ink">
                <CheckCircleIcon className="size-5 text-admin" /> Recently
                Concluded
              </h3>
              <div className="mt-3 flex flex-col gap-2">
                {CONCLUDED.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between rounded-xl border border-admin-line/60 bg-white p-4"
                  >
                    <div>
                      <p className="font-bold text-admin-ink">{c.name}</p>
                      <p className="text-xs text-admin-subtle">{c.meta}</p>
                    </div>
                    <ExternalLinkIcon className="size-4 text-admin-2" />
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      <MonitorDetailDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </AdminShell>
  );
}

function Strip({
  children,
  dot,
}: {
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      {dot && <span className="size-1.5 rounded-full bg-admin" />}
      {children}
    </span>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-14 shrink-0">
      <svg viewBox="0 0 44 44" className="size-full -rotate-90">
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="var(--color-admin-line)"
          strokeWidth="4"
        />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="var(--color-admin)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-admin">
        {pct}%
      </span>
    </div>
  );
}

function LoadBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-admin-mint">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-admin-mint"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
