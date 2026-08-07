"use client";

import type { ComponentType, SVGProps } from "react";
import { useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import {
  BarChartIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  FilterIcon,
  MoreVerticalIcon,
  PlusIcon,
  SortIcon,
  UserCheckIcon,
  UsersIcon,
} from "@/components/admin/icons";

type Eligibility = "ELIGIBLE" | "FLAGGED";
type Attempt = "In Progress" | "COMPLETED" | "NOT STARTED" | "EVALUATING";

interface Row {
  name: string;
  profile: string;
  roll: string;
  eligibility: Eligibility;
  status: Attempt;
  start: string;
  score: string;
}

const ROWS: Row[] = [
  {
    name: "Oliver John Brown",
    profile: "Class 12 • Biology Group",
    roll: "NEET-2024-0012",
    eligibility: "ELIGIBLE",
    status: "In Progress",
    start: "10:05 AM",
    score: "-- / 720",
  },
  {
    name: "Emma Wilson",
    profile: "Class 12 • Science Stream",
    roll: "NEET-2024-0045",
    eligibility: "ELIGIBLE",
    status: "COMPLETED",
    start: "10:00 AM",
    score: "680 / 720",
  },
  {
    name: "Noah James Smith",
    profile: "Dropper • Medical Prep",
    roll: "NEET-2024-0102",
    eligibility: "FLAGGED",
    status: "NOT STARTED",
    start: "--:--",
    score: "-- / 720",
  },
  {
    name: "Amara Lee",
    profile: "Class 12 • Biology Group",
    roll: "NEET-2024-0089",
    eligibility: "ELIGIBLE",
    status: "In Progress",
    start: "10:12 AM",
    score: "-- / 720",
  },
  {
    name: "Sophia Garcia",
    profile: "Class 11 • Foundation",
    roll: "NEET-2024-0151",
    eligibility: "ELIGIBLE",
    status: "EVALUATING",
    start: "10:02 AM",
    score: "-- / 720",
  },
];

const TABS = [
  "All Students (2,400)",
  "In Progress (942)",
  "Completed (156)",
  "Not Started (1,302)",
];

export default function ParticipantsPage() {
  const [tab, setTab] = useState(0);

  return (
    <AdminShell title="Exams">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
              Exams / NEET Full Mock 04
            </p>
            <h2 className="mt-1 text-3xl font-bold text-admin-ink">
              Participants &amp; Attempts
            </h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-admin-muted">
              <CalendarIcon className="size-4" />
              Scheduled for 12 Dec 2024 • 2,400 students enrolled
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg">
              <DownloadIcon className="size-4 text-admin-muted" /> Export
              Attendance
            </button>
            <button className="flex items-center gap-2 rounded-lg bg-admin px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95">
              <UsersIcon className="size-4" /> Bulk Enroll
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            icon={UserCheckIcon}
            label="Checked In"
            value="1,842"
            sub="76.7% Attendance"
          />
          <Stat
            icon={ClockIcon}
            label="Active Now"
            value="942"
            sub="Real-time"
            subTone="live"
          />
          <Stat
            icon={CheckCircleIcon}
            label="Submissions"
            value="156"
            sub="6.5% of total"
          />
          <Stat
            icon={BarChartIcon}
            label="Avg. Progress"
            value="42%"
            progress={42}
          />
        </div>

        {/* Table panel */}
        <section className="overflow-hidden rounded-2xl border border-admin-line/60 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-admin-line/60 px-4 py-3">
            <div className="flex flex-wrap gap-4">
              {TABS.map((t, i) => {
                const active = i === tab;
                return (
                  <button
                    key={t}
                    onClick={() => setTab(i)}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                      active
                        ? "bg-admin/10 text-admin"
                        : "text-admin-muted hover:text-admin-ink"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <FilterBtn icon={FilterIcon}>Filter: Eligibility</FilterBtn>
              <FilterBtn icon={SortIcon}>Sort: Roll Number</FilterBtn>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-admin-line/60 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" className="size-4 accent-admin" />
                  </th>
                  <th className="px-4 py-3">Name &amp; Profile</th>
                  <th className="px-4 py-3">Roll Number</th>
                  <th className="px-4 py-3">Eligibility</th>
                  <th className="px-4 py-3">Attempt Status</th>
                  <th className="px-4 py-3">Start Time</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line/50">
                {ROWS.map((r) => (
                  <tr
                    key={r.roll}
                    className={`hover:bg-admin-bg/50 ${r.eligibility === "FLAGGED" ? "bg-danger-soft/20" : ""}`}
                  >
                    <td className="px-4 py-4">
                      <input type="checkbox" className="size-4 accent-admin" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-admin-mint/50 text-xs font-bold text-admin">
                          {initials(r.name)}
                        </span>
                        <div>
                          <p className="font-bold text-admin-ink">{r.name}</p>
                          <p className="text-xs text-admin-subtle">
                            {r.profile}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-admin-ink">
                      {r.roll}
                    </td>
                    <td className="px-4 py-4">
                      <EligibilityPill v={r.eligibility} />
                    </td>
                    <td className="px-4 py-4">
                      <AttemptPill v={r.status} />
                    </td>
                    <td className="px-4 py-4 text-admin-muted">{r.start}</td>
                    <td className="px-4 py-4 font-semibold text-admin-ink">
                      {r.score}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button className="text-admin-muted hover:text-admin-ink">
                        <MoreVerticalIcon className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* FAB */}
      <button className="fixed bottom-8 right-8 flex size-14 items-center justify-center rounded-full bg-admin text-white shadow-lg hover:opacity-95">
        <PlusIcon className="size-6" />
      </button>
    </AdminShell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  subTone,
  progress,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  sub?: string;
  subTone?: "live";
  progress?: number;
}) {
  return (
    <section className="rounded-2xl border border-admin-line/60 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
            {label}
          </p>
          <p className="mt-1 text-3xl font-bold text-admin-ink">{value}</p>
        </div>
        <span className="flex size-11 items-center justify-center rounded-full bg-admin-mint/40 text-admin">
          <Icon className="size-5" />
        </span>
      </div>
      {progress !== undefined ? (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-admin-line/50">
          <div
            className="h-full rounded-full bg-admin"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : (
        <p
          className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${subTone === "live" ? "text-admin" : "text-admin-muted"}`}
        >
          {subTone === "live" && (
            <span className="size-1.5 rounded-full bg-admin" />
          )}
          {sub}
        </p>
      )}
    </section>
  );
}

function EligibilityPill({ v }: { v: Eligibility }) {
  return v === "ELIGIBLE" ? (
    <span className="rounded-full bg-admin-mint/50 px-3 py-1 text-xs font-bold text-admin">
      ELIGIBLE
    </span>
  ) : (
    <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-bold text-danger">
      FLAGGED
    </span>
  );
}

function AttemptPill({ v }: { v: Attempt }) {
  if (v === "In Progress")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-admin">
        <span className="size-1.5 rounded-full bg-admin" /> In Progress
      </span>
    );
  if (v === "COMPLETED")
    return (
      <span className="rounded-full bg-admin-mint/50 px-3 py-1 text-xs font-bold text-admin">
        COMPLETED
      </span>
    );
  if (v === "EVALUATING")
    return (
      <span className="rounded-full bg-[#fff3e0] px-3 py-1 text-xs font-bold text-[#c77700]">
        EVALUATING
      </span>
    );
  return (
    <span className="rounded-full bg-admin-surface px-3 py-1 text-xs font-bold text-admin-muted">
      NOT STARTED
    </span>
  );
}

function FilterBtn({
  icon: Icon,
  children,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
}) {
  return (
    <button className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-3 py-2 text-sm font-medium text-admin-ink hover:bg-admin-bg">
      <Icon className="size-4 text-admin-muted" />
      {children}
    </button>
  );
}

function initials(name: string): string {
  const p = name.split(" ").filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}
