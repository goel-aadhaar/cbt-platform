"use client";

import type { ComponentType, SVGProps } from "react";
import { useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { ResultDetailDrawer } from "@/components/admin/result-detail-drawer";
import {
  PublishResultsModal,
  RecalculateResultsModal,
} from "@/components/admin/results-modals";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  PlusIcon,
  SearchIcon,
  SlidersIcon,
} from "@/components/admin/icons";

type RStatus = "PUBLISHED" | "PROCESSING" | "HELD";

interface RRow {
  exam: string;
  batch: string;
  date: string;
  participants: number;
  status: RStatus;
  alert?: boolean;
}

const ROWS: RRow[] = [
  {
    exam: "Biology Mid-Term Alpha",
    batch: "Class XII - Science",
    date: "Oct 12, 2023",
    participants: 145,
    status: "PUBLISHED",
  },
  {
    exam: "Zoology Mock Test 1",
    batch: "Batch 2024 Pre-Med",
    date: "Oct 14, 2023",
    participants: 89,
    status: "PROCESSING",
    alert: true,
  },
  {
    exam: "Botany Final Assessment",
    batch: "Class XI - Science",
    date: "Oct 10, 2023",
    participants: 112,
    status: "HELD",
  },
  {
    exam: "Genetics Weekly Quiz",
    batch: "Advanced Batch",
    date: "Oct 05, 2023",
    participants: 45,
    status: "PUBLISHED",
  },
];

const TABS = ["All", "Held", "Published", "Processing"];

export default function ResultsPage() {
  const [tab, setTab] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [recalcOpen, setRecalcOpen] = useState(false);

  return (
    <AdminShell title="Results">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-admin-ink">Results</h2>
            <p className="mt-1 text-sm text-admin-muted">
              Review, publish, and manage results for all your exams
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setPublishOpen(true)}
              className="rounded-lg border border-admin-line bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-admin-ink hover:bg-admin-bg"
            >
              Publication Centre
            </button>
            <button
              onClick={() => setRecalcOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-admin px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:opacity-95"
            >
              <PlusIcon className="size-4" /> Process New Result
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={ClockIcon} label="Awaiting Processing" value="12" />
          <StatCard
            icon={SlidersIcon}
            label="Held for Review"
            value="4"
            chip="Action Required"
            chipTone="warn"
          />
          <StatCard
            icon={CheckCircleIcon}
            label="Published This Month"
            value="148"
            badge="+12%"
          />
          <StatCard
            icon={AlertTriangleIcon}
            label="Processing Errors"
            value="2"
            link="Resolve"
            danger
          />
        </div>

        {/* Panel */}
        <section className="rounded-2xl border border-admin-line/60 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-1 rounded-full bg-admin-bg p-1">
              {TABS.map((t, i) => (
                <button
                  key={t}
                  onClick={() => setTab(i)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                    i === tab
                      ? "bg-white text-admin-ink shadow-sm"
                      : "text-admin-muted hover:text-admin-ink"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex items-center">
                <SearchIcon className="pointer-events-none absolute left-3 size-4 text-admin-subtle" />
                <input
                  placeholder="Search exams…"
                  className="h-9 w-56 rounded-lg border border-admin-line bg-white pl-9 pr-3 text-sm outline-none placeholder:text-admin-subtle focus:border-admin"
                />
              </div>
              <button className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-3 py-2 text-sm font-medium text-admin-ink">
                2023 - 2024{" "}
                <ChevronDownIcon className="size-4 text-admin-muted" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-y border-admin-line/60 bg-admin-bg/50 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                  <th className="px-6 py-3">Exam Name</th>
                  <th className="px-6 py-3">Batch / Class</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Participants</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line/50">
                {ROWS.map((r) => (
                  <tr
                    key={r.exam}
                    className={`hover:bg-admin-bg/40 ${r.alert ? "bg-[#fbf3f2]" : ""}`}
                  >
                    <td className="px-6 py-4 font-bold text-admin-ink">
                      {r.exam}
                    </td>
                    <td className="px-6 py-4 text-admin-muted">{r.batch}</td>
                    <td className="px-6 py-4 text-admin-muted">{r.date}</td>
                    <td className="px-6 py-4 text-admin-ink">
                      {r.participants}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <ResultPill status={r.status} />
                        {r.alert && (
                          <AlertTriangleIcon className="size-4 text-danger" />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setDetailOpen(true)}
                        className="rounded-lg border border-admin-line bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-admin-ink hover:bg-admin-bg"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <ResultDetailDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onPublish={() => setPublishOpen(true)}
        onRecalculate={() => setRecalcOpen(true)}
      />
      <PublishResultsModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
      />
      <RecalculateResultsModal
        open={recalcOpen}
        onClose={() => setRecalcOpen(false)}
      />
    </AdminShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  badge,
  chip,
  chipTone,
  link,
  danger,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  badge?: string;
  chip?: string;
  chipTone?: "warn";
  link?: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${danger ? "border-danger/30" : "border-admin-line/60"}`}
    >
      <div className="flex items-start justify-between">
        <p
          className={`text-sm font-semibold ${danger ? "text-danger" : "text-admin-muted"}`}
        >
          {label}
        </p>
        <span
          className={`flex size-9 items-center justify-center rounded-full ${danger ? "text-danger" : "text-admin-subtle"}`}
        >
          <Icon className="size-5" />
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p
          className={`text-4xl font-bold ${danger ? "text-danger" : "text-admin-ink"}`}
        >
          {value}
        </p>
        {badge && (
          <span className="rounded-full bg-admin-mint/50 px-2.5 py-1 text-xs font-semibold text-admin">
            {badge}
          </span>
        )}
        {chip && (
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${chipTone === "warn" ? "bg-warn/20 text-[#c77700]" : "bg-admin-surface text-admin-muted"}`}
          >
            {chip}
          </span>
        )}
        {link && (
          <a className="text-sm font-semibold text-danger underline">{link}</a>
        )}
      </div>
    </div>
  );
}

function ResultPill({ status }: { status: RStatus }) {
  const map: Record<RStatus, string> = {
    PUBLISHED: "bg-admin-mint/50 text-admin",
    PROCESSING: "bg-[#e7edff] text-[#3d5afe]",
    HELD: "bg-warn/20 text-[#c77700]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${map[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}
