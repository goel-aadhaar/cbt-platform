"use client";

import type { ComponentType, SVGProps } from "react";
import { useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { QuestionDetailDrawer } from "@/components/admin/question-detail-drawer";
import {
  QuestionExportModal,
  QuestionImportModal,
} from "@/components/admin/question-modals";
import {
  AlignLeftIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  DatabaseIcon,
  DownloadIcon,
  FlagIcon,
  MoreVerticalIcon,
  PlusIcon,
  SearchIcon,
  SlidersIcon,
  TargetIcon,
  UploadIcon,
} from "@/components/admin/icons";
import { useAdminData } from "@/hooks/use-admin-data";
import {
  listQuestions,
  type QuestionListItem,
  type QuestionStatus,
} from "@/lib/questions";

const STATUS_LABEL: Record<QuestionStatus, string> = {
  DRAFT: "Draft",
  REVIEW: "In Review",
  APPROVED: "Approved",
  ARCHIVED: "Archived",
};

// Tab → API status filter (null = all). "Rejected" has no backend equivalent.
const TABS: { label: string; status: QuestionStatus | null }[] = [
  { label: "All", status: null },
  { label: "Draft", status: "DRAFT" },
  { label: "In Review", status: "REVIEW" },
  { label: "Approved", status: "APPROVED" },
  { label: "Archived", status: "ARCHIVED" },
];

export default function QuestionBankPage() {
  const [tab, setTab] = useState(0);
  const [onlyMine, setOnlyMine] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data, loading, error } = useAdminData(() =>
    listQuestions({ limit: 200 }),
  );
  const all = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;

  const count = (s: QuestionStatus) => all.filter((q) => q.status === s).length;
  const approved = count("APPROVED");

  const active = TABS[tab].status;
  const rows = active ? all.filter((q) => q.status === active) : all;

  return (
    <AdminShell title="Question Bank">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-admin-ink">Question Bank</h2>
            <p className="mt-1 text-sm text-admin-muted">
              Manage and review all your exam questions in one place
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <OutlineBtn icon={UploadIcon} onClick={() => setImportOpen(true)}>
              Import
            </OutlineBtn>
            <OutlineBtn icon={DownloadIcon} onClick={() => setExportOpen(true)}>
              Export
            </OutlineBtn>
            <button className="flex items-center gap-2 rounded-lg bg-admin px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95">
              <PlusIcon className="size-4" /> Add Question
            </button>
          </div>
        </div>

        {/* Stat cards (live counts) */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={DatabaseIcon}
            label="Total Questions"
            value={fmt(total)}
          />
          <StatCard
            icon={CheckCircleIcon}
            label="Approved"
            value={fmt(approved)}
            badge={total ? `${Math.round((approved / total) * 100)}%` : "0%"}
            progress={total ? Math.round((approved / total) * 100) : 0}
          />
          <StatCard
            icon={SlidersIcon}
            label="Needs Your Review"
            value={fmt(count("REVIEW"))}
            chip="Pending + Corrections"
            accent
          />
          <StatCard
            icon={CheckCircleIcon}
            label="Archived"
            value={fmt(count("ARCHIVED"))}
            badge="INACTIVE"
            plain
          />
        </div>

        {/* Panel */}
        <section className="overflow-hidden rounded-2xl border border-admin-line/60 bg-white">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <div className="relative flex min-w-[240px] flex-1 items-center">
              <SearchIcon className="pointer-events-none absolute left-3 size-4 text-admin-subtle" />
              <input
                placeholder="Search questions, IDs, or tags…"
                className="h-10 w-full rounded-lg border border-admin-line bg-admin-bg pl-9 pr-3 text-sm outline-none placeholder:text-admin-subtle focus:border-admin"
              />
            </div>
            <button className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-3 py-2 text-sm font-medium text-admin-ink hover:bg-admin-bg">
              <SlidersIcon className="size-4 text-admin-muted" /> Filters
            </button>
            <div className="ml-auto flex items-center gap-4">
              <button
                type="button"
                onClick={() => setOnlyMine((v) => !v)}
                className="flex items-center gap-2 text-sm font-medium text-admin-muted"
              >
                Only mine
                <span
                  className={`relative h-5 w-9 rounded-full transition-colors ${onlyMine ? "bg-admin" : "bg-admin-line"}`}
                >
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${onlyMine ? "left-[18px]" : "left-0.5"}`}
                  />
                </span>
              </button>
              <button className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-3 py-2 text-sm font-medium text-admin-ink">
                All Collections{" "}
                <ChevronDownIcon className="size-4 text-admin-muted" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-6 border-b border-admin-line/60 px-4">
            {TABS.map((t, i) => {
              const c = t.status ? count(t.status) : total;
              return (
                <button
                  key={t.label}
                  onClick={() => setTab(i)}
                  className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold ${i === tab ? "border-admin text-admin" : "border-transparent text-admin-muted hover:text-admin-ink"}`}
                >
                  {t.label}
                  <span className="rounded-full bg-admin-surface px-2 py-0.5 text-xs text-admin-muted">
                    {fmt(c)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" className="size-4 accent-admin" />
                  </th>
                  <th className="px-4 py-3">Question Preview</th>
                  <th className="px-4 py-3">Subject / Chapter</th>
                  <th className="px-4 py-3">Difficulty</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line/50">
                {loading && <TableMessage>Loading questions…</TableMessage>}
                {!loading && error && (
                  <TableMessage tone="error">{error}</TableMessage>
                )}
                {!loading && !error && rows.length === 0 && (
                  <TableMessage>No questions in this view.</TableMessage>
                )}
                {!loading &&
                  !error &&
                  rows.map((q) => (
                    <QuestionRow
                      key={q.id}
                      q={q}
                      onOpen={() => setDetailOpen(true)}
                    />
                  ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-admin-line/60 px-4 py-3">
            <p className="text-sm text-admin-muted">
              Showing {rows.length} of {fmt(total)} questions
            </p>
          </div>
        </section>
      </div>

      <QuestionImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />
      <QuestionExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
      />
      <QuestionDetailDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </AdminShell>
  );
}

function QuestionRow({
  q,
  onOpen,
}: {
  q: QuestionListItem;
  onOpen: () => void;
}) {
  const Icon =
    q.status === "REVIEW"
      ? FlagIcon
      : q.type === "INTEGER"
        ? AlignLeftIcon
        : TargetIcon;
  const code = `${q.subject.slice(0, 3).toUpperCase()}-${q.id.slice(0, 4).toUpperCase()}`;
  const diff = q.difficulty.charAt(0) + q.difficulty.slice(1).toLowerCase();
  return (
    <tr
      onClick={onOpen}
      className={`cursor-pointer hover:bg-admin-bg/40 ${q.status === "REVIEW" ? "bg-[#fff8ec]" : ""}`}
    >
      <td className="px-4 py-4 align-top">
        <input type="checkbox" className="mt-1 size-4 accent-admin" />
      </td>
      <td className="px-4 py-4">
        <div className="flex gap-3">
          <Icon
            className={`mt-0.5 size-4 shrink-0 ${q.status === "REVIEW" ? "text-warn" : "text-admin-subtle"}`}
          />
          <div className="max-w-md">
            <span className="inline-block rounded bg-admin-surface px-1.5 py-0.5 font-mono text-[11px] text-admin-muted">
              ID: {code}
            </span>
            <p className="mt-1 line-clamp-2 text-admin-ink">{q.statement}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="font-semibold text-admin-ink">{q.subject}</p>
        <p className="text-xs text-admin-subtle">{q.chapter}</p>
      </td>
      <td className="px-4 py-4 align-top text-admin-ink">{diff}</td>
      <td className="px-4 py-4 align-top">
        <StatusPill status={q.status} />
      </td>
      <td className="px-4 py-4 text-right align-top">
        {q.status === "REVIEW" ? (
          <button className="rounded-lg bg-admin px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95">
            Review Now
          </button>
        ) : (
          <button className="text-admin-muted hover:text-admin-ink">
            <MoreVerticalIcon className="size-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

function TableMessage({
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

function StatCard({
  icon: Icon,
  label,
  value,
  badge,
  chip,
  progress,
  accent,
  plain,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  badge?: string;
  chip?: string;
  progress?: number;
  accent?: boolean;
  plain?: boolean;
}) {
  return (
    <div
      className={`relative rounded-2xl border border-admin-line/60 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${accent ? "border-t-2 border-t-warn" : ""}`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`flex size-11 items-center justify-center rounded-full ${accent ? "bg-warn/15 text-warn" : "bg-admin-surface text-admin-muted"}`}
        >
          <Icon className="size-5" />
        </span>
        {badge && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${plain ? "bg-admin-surface text-admin-muted" : "bg-admin-mint/50 text-admin"}`}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="mt-4 text-sm text-admin-muted">{label}</p>
      <div className="mt-1 flex items-end gap-3">
        <p className="text-3xl font-bold text-admin-ink">{value}</p>
        {chip && (
          <span className="mb-1 rounded bg-admin-surface px-2 py-0.5 text-[11px] font-medium leading-tight text-admin-muted">
            {chip}
          </span>
        )}
      </div>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-admin-line/50">
          <div
            className="h-full rounded-full bg-admin"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: QuestionStatus }) {
  const map: Record<QuestionStatus, string> = {
    APPROVED: "bg-admin-mint/50 text-admin",
    REVIEW: "bg-warn/15 text-[#c77700]",
    DRAFT: "bg-admin-surface text-admin-muted",
    ARCHIVED: "bg-danger/10 text-danger",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${map[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function OutlineBtn({
  icon: Icon,
  children,
  onClick,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg"
    >
      <Icon className="size-4 text-admin-muted" />
      {children}
    </button>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}
