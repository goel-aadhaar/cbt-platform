"use client";

import { useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { CreateReportDrawer } from "@/components/admin/create-report-drawer";
import {
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  FilterIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
} from "@/components/admin/icons";

interface Report {
  name: string;
  type: string;
  date: string;
  format: "PDF" | "CSV";
}

const REPORTS: Report[] = [
  {
    name: "Q3 Final Batch Performance",
    type: "Batch Performance",
    date: "Oct 24, 2023",
    format: "PDF",
  },
  {
    name: "Midterm Summary - Advanced Data Structures",
    type: "Exam Summary",
    date: "Oct 20, 2023",
    format: "CSV",
  },
  {
    name: "Annual Student Engagement Audit",
    type: "Custom Analysis",
    date: "Oct 15, 2023",
    format: "PDF",
  },
];

const EXPORTS = [
  { file: "batch_perf_q3_final.pdf", when: "Today, 09:41 AM", ok: true },
  { file: "midterm_summary_CS101.csv", when: "Yesterday, 14:20 PM", ok: true },
  {
    file: "large_dataset_export_2023.zip",
    when: "Oct 22, 11:05 AM",
    ok: false,
  },
];

export default function ReportsPage() {
  const [tab, setTab] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <AdminShell title="Reports">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-admin-ink">Reports</h2>
            <p className="mt-1 text-sm text-admin-muted">
              Generate and manage reports across exams, students, and results.
            </p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-admin px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95"
          >
            <PlusIcon className="size-4" /> Create Report
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.9fr_1fr]">
          {/* Left */}
          <div>
            <div className="flex gap-6 border-b border-admin-line/60">
              {["My Reports", "Scheduled Reports"].map((t, i) => (
                <button
                  key={t}
                  onClick={() => setTab(i)}
                  className={`border-b-2 pb-3 text-sm font-semibold ${
                    i === tab
                      ? "border-admin text-admin"
                      : "border-transparent text-admin-muted hover:text-admin-ink"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <section className="mt-4 overflow-hidden rounded-2xl border border-admin-line/60 bg-white">
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2 text-admin-muted">
                  <button className="rounded-lg p-2 hover:bg-admin-bg">
                    <FilterIcon className="size-4" />
                  </button>
                  <button className="rounded-lg p-2 hover:bg-admin-bg">
                    <SortIcon className="size-4" />
                  </button>
                </div>
                <div className="relative flex items-center">
                  <SearchIcon className="pointer-events-none absolute left-3 size-4 text-admin-subtle" />
                  <input
                    placeholder="Filter reports…"
                    className="h-9 w-52 rounded-lg border border-admin-line bg-white pl-9 pr-3 text-sm outline-none placeholder:text-admin-subtle focus:border-admin"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead>
                    <tr className="border-y border-admin-line/60 bg-admin-bg/50 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          className="size-4 accent-admin"
                        />
                      </th>
                      <th className="px-4 py-3">Report Name</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Created Date</th>
                      <th className="px-4 py-3">Format</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-admin-line/50">
                    {REPORTS.map((r) => (
                      <tr key={r.name} className="hover:bg-admin-bg/40">
                        <td className="px-4 py-4 align-top">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 accent-admin"
                          />
                        </td>
                        <td className="px-4 py-4 font-bold text-admin-ink">
                          {r.name}
                        </td>
                        <td className="px-4 py-4 text-admin-muted">{r.type}</td>
                        <td className="px-4 py-4 text-admin-muted">{r.date}</td>
                        <td className="px-4 py-4">
                          <FormatBadge fmt={r.format} />
                        </td>
                        <td className="px-4 py-4 text-admin-muted">
                          <FileTextIcon className="size-4" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-admin-line/60 px-4 py-3">
                <p className="text-sm text-admin-muted">
                  Showing 1 to 3 of 12 entries
                </p>
                <div className="flex items-center gap-1">
                  <PageBtn>
                    <ChevronLeftIcon className="size-4" />
                  </PageBtn>
                  <PageNum active>1</PageNum>
                  <PageNum>2</PageNum>
                  <PageNum>3</PageNum>
                  <PageBtn>
                    <ChevronRightIcon className="size-4" />
                  </PageBtn>
                </div>
              </div>
            </section>
          </div>

          {/* Right rail */}
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl border border-admin-line/60 bg-white p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-admin-ink">
                  Recent Exports
                </h3>
                <button className="text-sm font-semibold text-admin-2">
                  View All
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                {EXPORTS.map((e) => (
                  <div
                    key={e.file}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${e.ok ? "border-admin-line/60" : "border-danger/20 bg-danger-soft/20"}`}
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${e.ok ? "bg-admin/10 text-admin" : "bg-danger/10 text-danger"}`}
                    >
                      {e.ok ? (
                        <FileTextIcon className="size-4" />
                      ) : (
                        <AlertTriangleIcon className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-admin-ink">
                        {e.file}
                      </p>
                      <p className="text-xs text-admin-subtle">{e.when}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${e.ok ? "bg-admin-mint/50 text-admin" : "bg-danger/10 text-danger"}`}
                    >
                      {e.ok ? "Success" : "Failed"}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="relative overflow-hidden rounded-2xl bg-admin p-5 text-white shadow-lg">
              <div className="absolute -right-6 -top-6 size-24 rounded-full bg-white/10 blur-2xl" />
              <p className="text-sm font-semibold text-admin-mint">
                Storage Usage
              </p>
              <p className="mt-2 text-4xl font-bold">
                45<span className="text-lg">%</span>
              </p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/20">
                <div className="h-full w-[45%] rounded-full bg-admin-mint" />
              </div>
              <p className="mt-2 text-xs text-admin-mint">
                4.5 GB of 10 GB used
              </p>
            </section>
          </div>
        </div>
      </div>

      <CreateReportDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </AdminShell>
  );
}

function FormatBadge({ fmt }: { fmt: "PDF" | "CSV" }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
        fmt === "PDF"
          ? "bg-danger/10 text-danger"
          : "bg-admin-mint/50 text-admin"
      }`}
    >
      {fmt}
    </span>
  );
}

function PageBtn({ children }: { children: React.ReactNode }) {
  return (
    <button className="flex size-8 items-center justify-center rounded-lg border border-admin-line text-admin-muted hover:bg-admin-bg">
      {children}
    </button>
  );
}

function PageNum({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      className={`flex size-8 items-center justify-center rounded-lg text-xs font-bold ${active ? "bg-admin text-white" : "text-admin-muted hover:bg-admin-bg"}`}
    >
      {children}
    </button>
  );
}
