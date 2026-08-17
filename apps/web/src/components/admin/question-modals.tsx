"use client";

import { useState } from "react";

import {
  AlertTriangleIcon,
  CheckIcon,
  CloudUploadIcon,
  DownloadIcon,
  FileTextIcon,
  XIcon,
} from "./icons";

function Shell({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 [font-family:var(--font-hanken)]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-admin-ink/40"
      />
      <div
        className={`relative w-full ${wide ? "max-w-[680px]" : "max-w-[540px]"} overflow-hidden rounded-2xl bg-white shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-admin-line/60 px-7 py-5">
          <h2 className="text-xl font-bold text-admin-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto px-7 py-6">{children}</div>
        <div className="flex items-center justify-end gap-3 border-t border-admin-line/60 px-7 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}

const RECENT = [
  {
    file: "biology_midterm_qbank.csv",
    meta: "Oct 24, 2023 at 10:42 AM • 45kb",
    ok: true,
  },
  {
    file: "chemistry_final_v2_broken.csv",
    meta: "Oct 22, 2023 at 3:15 PM • 12kb",
    ok: false,
  },
];

export function QuestionImportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <Shell
      title="Import Questions"
      onClose={onClose}
      wide
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-admin-muted hover:text-admin-ink"
          >
            Cancel
          </button>
          <button
            disabled
            title="Question import mapping not implemented"
            className="disabled:cursor-not-allowed disabled:opacity-40 rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
          >
            Proceed to map fields →
          </button>
        </>
      }
    >
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-admin-line bg-admin-bg px-6 py-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-admin-mint/40 text-admin">
          <CloudUploadIcon className="size-6" />
        </span>
        <p className="mt-4 text-lg font-bold text-admin-ink">
          Click or drag file to this area to upload
        </p>
        <p className="mt-1 max-w-sm text-sm text-admin-muted">
          Support for a single or bulk upload. Strictly prohibit from uploading
          company data or other band files.
        </p>
        <p className="mt-4 text-sm text-admin-muted">
          Need a formatted CSV?{" "}
          <button className="font-semibold text-admin-2">
            <DownloadIcon className="mr-1 inline size-4" /> Download template
          </button>
        </p>
      </div>

      <p className="mt-6 font-bold text-admin-ink">Recent Imports</p>
      <div className="mt-3 flex flex-col gap-3">
        {RECENT.map((r) => (
          <div
            key={r.file}
            className={`flex items-center gap-3 rounded-xl border p-4 ${r.ok ? "border-admin-line/60" : "border-danger/20 bg-danger-soft/20"}`}
          >
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${r.ok ? "bg-admin/10 text-admin" : "bg-danger/10 text-danger"}`}
            >
              {r.ok ? (
                <FileTextIcon className="size-4" />
              ) : (
                <AlertTriangleIcon className="size-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-admin-ink">
                {r.file}
              </p>
              <p className="text-xs text-admin-subtle">{r.meta}</p>
            </div>
            <span
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${r.ok ? "bg-admin-mint/50 text-admin" : "bg-danger/10 text-danger"}`}
            >
              {r.ok ? "Success" : "Failed"}
            </span>
          </div>
        ))}
      </div>
    </Shell>
  );
}

const FORMATS = [
  { id: "csv", label: "CSV", desc: "Comma-separated, best for spreadsheets" },
  { id: "xlsx", label: "XLSX", desc: "Native Excel workbook" },
  { id: "pdf", label: "PDF", desc: "Print-ready question paper" },
];

const SCOPES = [
  "Current filter (14,285)",
  "Selected questions",
  "Entire question bank",
];

export function QuestionExportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [fmt, setFmt] = useState("csv");
  const [scope, setScope] = useState(0);
  const [withAnswers, setWithAnswers] = useState(true);
  if (!open) return null;

  return (
    <Shell
      title="Export Questions"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-admin-muted hover:text-admin-ink"
          >
            Cancel
          </button>
          <button
            disabled
            title="Question bank export has no backend endpoint yet — exam results can already be exported from the Results page"
            className="flex items-center gap-2 rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <DownloadIcon className="size-4" /> Export
          </button>
        </>
      }
    >
      <p className="text-sm font-semibold text-admin-muted">Format</p>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFmt(f.id)}
            className={`rounded-xl border p-3 text-left ${fmt === f.id ? "border-admin bg-admin-mint/15" : "border-admin-line/60 hover:bg-admin-bg"}`}
          >
            <p className="font-bold text-admin-ink">{f.label}</p>
            <p className="mt-0.5 text-xs text-admin-muted">{f.desc}</p>
          </button>
        ))}
      </div>

      <p className="mt-6 text-sm font-semibold text-admin-muted">Scope</p>
      <div className="mt-2 flex flex-col gap-2">
        {SCOPES.map((s, i) => (
          <button
            key={s}
            onClick={() => setScope(i)}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm ${scope === i ? "border-admin bg-admin-mint/10" : "border-admin-line/60 hover:bg-admin-bg"}`}
          >
            <span
              className={`flex size-4 items-center justify-center rounded-full border ${scope === i ? "border-admin bg-admin" : "border-admin-line"}`}
            >
              {scope === i && (
                <span className="size-1.5 rounded-full bg-white" />
              )}
            </span>
            <span className="text-admin-ink">{s}</span>
          </button>
        ))}
      </div>

      <label className="mt-6 flex cursor-pointer items-center gap-3">
        <span
          onClick={() => setWithAnswers((v) => !v)}
          className={`flex size-5 items-center justify-center rounded border ${withAnswers ? "border-admin bg-admin text-white" : "border-admin-line"}`}
        >
          {withAnswers && <CheckIcon className="size-3.5" />}
        </span>
        <span className="text-sm text-admin-ink">
          Include correct answers &amp; rationale
        </span>
      </label>
    </Shell>
  );
}
