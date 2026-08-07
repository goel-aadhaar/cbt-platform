"use client";

import type { ComponentType, SVGProps } from "react";
import { useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { ExamBuilderDrawer } from "@/components/admin/exam-builder-drawer";
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  FileTextIcon,
  FilterIcon,
  PlusCircleIcon,
  RadioIcon,
  ScaleIcon,
  TemplateIcon,
} from "@/components/admin/icons";
import { useAdminData } from "@/hooks/use-admin-data";
import {
  type ExamDisplayStatus,
  type ExamListItem,
  examDisplayStatus,
  formatSchedule,
  listExams,
} from "@/lib/exams";

const TABS: { label: string; match: ExamDisplayStatus[] | null }[] = [
  { label: "All Exams", match: null },
  { label: "Draft", match: ["DRAFT"] },
  { label: "Scheduled", match: ["SCHEDULED"] },
  {
    label: "Published",
    match: ["PUBLISHED", "SCHEDULED", "LIVE", "COMPLETED"],
  },
  { label: "Live", match: ["LIVE"] },
  { label: "Completed", match: ["COMPLETED"] },
  { label: "Cancelled", match: ["ARCHIVED"] },
];

export default function ExamsPage() {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [tab, setTab] = useState(0);

  const { data, loading, error } = useAdminData(() => listExams());
  const exams = useMemo(() => data ?? [], [data]);

  const withStatus = useMemo(
    () => exams.map((e) => ({ e, s: examDisplayStatus(e) })),
    [exams],
  );
  const countS = (s: ExamDisplayStatus) =>
    withStatus.filter((x) => x.s === s).length;

  const match = TABS[tab].match;
  const rows = match
    ? withStatus.filter((x) => match.includes(x.s))
    : withStatus;

  const approvedQ = exams.reduce((n, e) => n + e._count.questions, 0);

  return (
    <AdminShell title="Exams">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-admin-ink">Exams</h2>
            <p className="mt-1 text-sm text-admin-muted">
              {exams.length} exams · {approvedQ} questions in use
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <OutlineBtn icon={TemplateIcon}>Exam Templates</OutlineBtn>
            <OutlineBtn icon={CalendarIcon}>Exam Calendar</OutlineBtn>
            <button
              onClick={() => setBuilderOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-admin px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95"
            >
              <PlusCircleIcon className="size-4" /> Create Exam
            </button>
          </div>
        </div>

        {/* Stat cards (live counts) */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <ExamStat
            icon={FileTextIcon}
            tint="bg-admin-surface text-admin-muted"
            label="Draft Exams"
            value={pad(countS("DRAFT"))}
          />
          <ExamStat
            icon={CalendarIcon}
            tint="bg-[#e7edff] text-[#3d5afe]"
            label="Scheduled"
            value={pad(countS("SCHEDULED"))}
          />
          <ExamStat
            icon={RadioIcon}
            tint="bg-danger-soft/50 text-danger"
            label="Live Now"
            value={pad(countS("LIVE"))}
            dot
          />
          <ExamStat
            icon={CheckCircleIcon}
            tint="bg-admin-mint/40 text-admin"
            label="Completed"
            value={pad(countS("COMPLETED"))}
          />
        </div>

        {/* Two-column */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.9fr_1fr]">
          <div className="flex flex-col gap-4">
            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
              {TABS.map((t, i) => {
                const active = i === tab;
                const c = t.match
                  ? withStatus.filter((x) => t.match!.includes(x.s)).length
                  : exams.length;
                return (
                  <button
                    key={t.label}
                    onClick={() => setTab(i)}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${active ? "bg-admin text-white" : "bg-white text-admin-muted hover:bg-admin-bg"}`}
                  >
                    {t.label}
                    <span
                      className={active ? "text-white/80" : "text-admin-subtle"}
                    >
                      {c}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-admin-line/60 bg-white p-3">
              <Chip icon={FilterIcon}>Batch: All</Chip>
              <Chip icon={ScaleIcon}>Class: All</Chip>
              <button className="text-sm font-semibold text-admin-2 hover:underline">
                Clear all
              </button>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-sm text-admin-muted">
                  Sort by:{" "}
                  <span className="font-semibold text-admin-ink">
                    Newest First
                  </span>
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-admin-line/60 bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-admin-line/60 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox" className="size-4 accent-admin" />
                    </th>
                    <th className="px-4 py-3">Exam Name</th>
                    <th className="px-4 py-3">Batches</th>
                    <th className="px-4 py-3">Schedule</th>
                    <th className="px-4 py-3">Questions</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-admin-line/50">
                  {loading && <Msg>Loading exams…</Msg>}
                  {!loading && error && <Msg tone="error">{error}</Msg>}
                  {!loading && !error && rows.length === 0 && (
                    <Msg>No exams in this view.</Msg>
                  )}
                  {!loading &&
                    !error &&
                    rows.map(({ e, s }) => <ExamRow key={e.id} e={e} s={s} />)}
                </tbody>
              </table>
              <div className="border-t border-admin-line/60 px-4 py-3 text-sm text-admin-muted">
                Showing {rows.length} of {exams.length} exams
              </div>
            </div>
          </div>

          {/* Right rail (static) */}
          <div className="flex flex-col gap-6">
            <Card>
              <h3 className="text-lg font-bold text-admin-ink">
                Live Snapshot
              </h3>
              <div className="mt-4 rounded-xl bg-admin-bg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-admin-muted">Live exams</span>
                  <span className="text-lg font-bold text-admin-ink">
                    {countS("LIVE")}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-admin-muted">Scheduled</span>
                  <span className="font-semibold text-admin">
                    {countS("SCHEDULED")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-admin-muted">Completed</span>
                  <span className="font-semibold text-admin-ink">
                    {countS("COMPLETED")}
                  </span>
                </div>
              </div>
            </Card>
            <Card>
              <h3 className="text-lg font-bold text-admin-ink">
                Critical Alerts
              </h3>
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-soft/30 p-4">
                <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-danger" />
                <p className="text-sm text-admin-ink">
                  Monitor live exams from the Live Monitoring section.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <ExamBuilderDrawer
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
      />
    </AdminShell>
  );
}

function ExamRow({ e, s }: { e: ExamListItem; s: ExamDisplayStatus }) {
  const code = `EX-${e.id.slice(0, 5).toUpperCase()}`;
  return (
    <tr className="hover:bg-admin-bg/50">
      <td className="px-4 py-4">
        <input type="checkbox" className="size-4 accent-admin" />
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-admin-mint/40 text-admin">
            <FileTextIcon className="size-4" />
          </span>
          <div>
            <p className="font-bold text-admin-ink">{e.title}</p>
            <p className="font-mono text-xs text-admin-subtle">ID: {code}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-admin-ink">{e._count.batches}</td>
      <td className="px-4 py-4">
        <p className="font-semibold text-admin-ink">{formatSchedule(e)}</p>
        <p className="text-xs text-admin-subtle">
          Duration: {e.durationMinutes} min
        </p>
      </td>
      <td className="px-4 py-4 text-admin-ink">{e._count.questions}</td>
      <td className="px-4 py-4">
        <ExamStatusPill status={s} />
      </td>
    </tr>
  );
}

function ExamStatusPill({ status }: { status: ExamDisplayStatus }) {
  const map: Record<ExamDisplayStatus, string> = {
    LIVE: "bg-danger/10 text-danger",
    SCHEDULED: "bg-[#e7edff] text-[#3d5afe]",
    DRAFT: "bg-admin-surface text-admin-muted",
    COMPLETED: "bg-admin-mint/50 text-admin",
    PUBLISHED: "bg-admin-mint/50 text-admin",
    ARCHIVED: "bg-admin-surface text-admin-muted",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${map[status]}`}
    >
      {status === "LIVE" && (
        <span className="size-1.5 rounded-full bg-danger" />
      )}
      {status}
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-admin-line/60 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {children}
    </section>
  );
}

function ExamStat({
  icon: Icon,
  tint,
  label,
  value,
  dot,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tint: string;
  label: string;
  value: string;
  dot?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <span
          className={`flex size-11 items-center justify-center rounded-full ${tint}`}
        >
          <Icon className="size-5" />
        </span>
        {dot && <span className="size-2 rounded-full bg-danger" />}
      </div>
      <p className="mt-4 text-sm text-admin-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold text-admin-ink">{value}</p>
    </Card>
  );
}

function OutlineBtn({
  icon: Icon,
  children,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
}) {
  return (
    <button className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg">
      <Icon className="size-4 text-admin-muted" />
      {children}
    </button>
  );
}

function Chip({
  icon: Icon,
  children,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-2 rounded-lg bg-admin-bg px-3 py-1.5 text-sm font-medium text-admin-ink">
      <Icon className="size-3.5 text-admin-muted" />
      {children}
    </span>
  );
}

function Msg({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "error";
}) {
  return (
    <tr>
      <td
        colSpan={6}
        className={`px-4 py-10 text-center ${tone === "error" ? "text-danger" : "text-admin-muted"}`}
      >
        {children}
      </td>
    </tr>
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
