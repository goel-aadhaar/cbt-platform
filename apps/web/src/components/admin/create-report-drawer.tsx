"use client";

import { useState } from "react";

import { ChevronDownIcon, FileTextIcon, TemplateIcon, XIcon } from "./icons";

export function CreateReportDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const [schedule, setSchedule] = useState(false);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end [font-family:var(--font-hanken)]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-admin-ink/30"
      />
      <div className="relative flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-admin-line/60 px-7 py-6">
          <h2 className="text-2xl font-bold text-admin-ink">
            Create New Report
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-7 py-6">
          {/* 1. Report Type */}
          <Step
            n="1. Report Type"
            desc="Select the primary dataset for your report."
          >
            <Select>Student Performance</Select>
          </Step>

          <Divider />

          {/* 2. Scope */}
          <Step
            n="2. Scope"
            desc="Define the boundaries of the data to include."
          >
            <Labeled label="Batch">
              <Select>All Active Batches</Select>
            </Labeled>
            <Labeled label="Class">
              <Select>All Classes</Select>
            </Labeled>
            <Labeled label="Session">
              <Select>Mid-Terms (Current)</Select>
            </Labeled>
          </Step>

          <Divider />

          {/* 3. Format */}
          <Step n="3. Format">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormatCard
                icon={<FileTextIcon className="size-5" />}
                title="PDF"
                sub="Visual layout"
                active={format === "pdf"}
                onClick={() => setFormat("pdf")}
              />
              <FormatCard
                icon={<TemplateIcon className="size-5" />}
                title="CSV"
                sub="Raw data"
                active={format === "csv"}
                onClick={() => setFormat("csv")}
              />
            </div>
          </Step>

          {/* Schedule */}
          <div className="mt-6 flex items-center justify-between rounded-xl border border-admin-line/60 bg-admin-bg p-4">
            <div>
              <p className="font-bold text-admin-ink">Schedule this report</p>
              <p className="text-sm text-admin-muted">
                Automate report generation.
              </p>
            </div>
            <button
              onClick={() => setSchedule((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${schedule ? "bg-admin" : "bg-admin-line"}`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${schedule ? "left-[22px]" : "left-0.5"}`}
              />
            </button>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-admin-line/60 px-7 py-5">
          <button
            onClick={onClose}
            className="rounded-lg border border-admin-line bg-white px-6 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg"
          >
            Cancel
          </button>
          <button
            disabled
            title="Reports have no backend endpoint yet"
            className="disabled:cursor-not-allowed disabled:opacity-40 rounded-lg bg-admin px-6 py-2.5 text-sm font-semibold text-white hover:opacity-95"
          >
            Generate Now
          </button>
        </footer>
      </div>
    </div>
  );
}

function Step({
  n,
  desc,
  children,
}: {
  n: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-lg font-bold text-admin-ink">{n}</h3>
        {desc && <p className="text-sm text-admin-muted">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

function Divider() {
  return <div className="my-6 h-px w-full bg-admin-line/60" />;
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-admin-muted">{label}</span>
      {children}
    </label>
  );
}

function Select({ children }: { children: React.ReactNode }) {
  return (
    <button className="flex w-full items-center justify-between rounded-lg border border-admin-line bg-white px-3.5 py-3 text-sm text-admin-ink hover:bg-admin-bg">
      {children}
      <ChevronDownIcon className="size-4 text-admin-muted" />
    </button>
  );
}

function FormatCard({
  icon,
  title,
  sub,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border p-4 text-left ${active ? "border-2 border-admin bg-admin-mint/10" : "border-admin-line/60 hover:bg-admin-bg"}`}
    >
      <span className="text-admin">{icon}</span>
      <div className="flex-1">
        <p className="font-bold text-admin-ink">{title}</p>
        <p className="text-xs text-admin-muted">{sub}</p>
      </div>
      <span
        className={`flex size-4 items-center justify-center rounded-full border ${active ? "border-admin bg-admin" : "border-admin-line"}`}
      >
        {active && <span className="size-1.5 rounded-full bg-white" />}
      </span>
    </button>
  );
}
