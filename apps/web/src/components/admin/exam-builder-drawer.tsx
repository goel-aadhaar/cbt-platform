"use client";

import { useState } from "react";

import { ChevronRightIcon, SaveIcon, XIcon } from "./icons";

const STEPS = [
  "Basic Info",
  "Sections",
  "Questions",
  "Marking",
  "Instructions",
  "Review",
];

/**
 * "Create New Exam" wizard drawer (Figma 38:9654). Step 1 (Basic Info) is fully
 * designed and built; later steps show a placeholder. Presentational — Save/Next
 * don't persist yet (wiring to POST /exams comes later).
 */
export function ExamBuilderDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end [font-family:var(--font-hanken)]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-admin-ink/30"
      />

      <div className="relative flex h-full w-full max-w-[680px] flex-col bg-white shadow-2xl">
        {/* Header + stepper */}
        <header className="border-b border-admin-line/60 px-8 pb-5 pt-7">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-admin">Create New Exam</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-admin-muted hover:text-admin-ink"
            >
              <XIcon className="size-5" />
            </button>
          </div>

          <ol className="mt-6 flex items-center">
            {STEPS.map((label, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <li
                  key={label}
                  className="flex flex-1 items-center last:flex-none"
                >
                  <button
                    onClick={() => setStep(i)}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span
                      className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${
                        active
                          ? "bg-admin text-white"
                          : done
                            ? "bg-admin/20 text-admin"
                            : "border border-admin-line bg-white text-admin-muted"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={`whitespace-nowrap text-[11px] ${
                        active ? "font-bold text-admin" : "text-admin-muted"
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <span className="mx-1 mb-4 h-px flex-1 bg-admin-line" />
                  )}
                </li>
              );
            })}
          </ol>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-auto px-8 py-6">
          {step === 0 ? (
            <BasicInfoStep />
          ) : (
            <StepPlaceholder name={STEPS[step]} />
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-admin-line/60 px-8 py-5">
          <button className="flex items-center gap-2 rounded-lg border border-admin-line bg-white px-5 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg">
            <SaveIcon className="size-4 text-admin-muted" /> Save as Draft
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="rounded-lg border border-admin-line bg-white px-6 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-40"
            >
              Back
            </button>
            <button
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="flex items-center gap-2 rounded-lg bg-admin px-6 py-2.5 text-sm font-semibold text-white hover:opacity-95"
            >
              {step < STEPS.length - 1
                ? `Next: ${STEPS[step + 1]}`
                : "Publish Exam"}
              {step < STEPS.length - 1 && (
                <ChevronRightIcon className="size-4" />
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function BasicInfoStep() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <SectionTitle>General Details</SectionTitle>
        <Label text="Exam Title">
          <div className="grid grid-cols-4 gap-3">
            <Input placeholder="Test" />
            <Input placeholder="Year" />
            <Input placeholder="Subject" />
            <Input placeholder="Type" />
          </div>
        </Label>
        <div className="grid grid-cols-2 gap-4">
          <Label text="Category / Subject">
            <Select>Select Category</Select>
          </Label>
          <Label text="Academic Year">
            <Select>2023-24</Select>
          </Label>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle>Scheduling &amp; Duration</SectionTitle>
        <div className="grid grid-cols-3 gap-4">
          <Label text="Start Date">
            <Input placeholder="mm/dd/yyyy" />
          </Label>
          <Label text="Time of Test">
            <Input placeholder="09/00/AM" />
          </Label>
          <Label text="Duration (Minutes)">
            <div className="flex items-center rounded-lg border border-admin-line bg-white pr-3">
              <input
                defaultValue="180"
                className="w-full bg-transparent px-3 py-3 text-sm text-admin-ink outline-none"
              />
              <span className="text-xs font-semibold text-admin-subtle">
                MINS
              </span>
            </div>
          </Label>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle>Advanced Configuration</SectionTitle>
        <CheckCard
          title="Safe Exam Browser Mode"
          desc="Restrict students from switching tabs or closing the window during the exam."
        />
        <CheckCard
          title="AI Proctoring"
          desc="Enable web-cam monitoring and automated activity logging for identity verification."
        />
      </section>
    </div>
  );
}

function StepPlaceholder({ name }: { name: string }) {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 text-center">
      <p className="text-lg font-bold text-admin-ink">{name}</p>
      <p className="max-w-xs text-sm text-admin-muted">
        This step of the exam builder will be configured here.
      </p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-1 rounded bg-admin" />
      <h3 className="font-bold text-admin-ink">{children}</h3>
    </div>
  );
}

function Label({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-admin-muted">{text}</span>
      {children}
    </label>
  );
}

function Input({ placeholder }: { placeholder: string }) {
  return (
    <input
      placeholder={placeholder}
      className="w-full rounded-lg border border-admin-line bg-white px-3 py-3 text-sm text-admin-ink outline-none placeholder:text-admin-subtle focus:border-admin"
    />
  );
}

function Select({ children }: { children: React.ReactNode }) {
  return (
    <button className="flex items-center justify-between rounded-lg border border-admin-line bg-white px-3 py-3 text-sm text-admin-ink hover:bg-admin-bg">
      {children}
      <span className="text-admin-muted">▾</span>
    </button>
  );
}

function CheckCard({ title, desc }: { title: string; desc: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-admin-line p-4 hover:bg-admin-bg">
      <input type="checkbox" className="mt-0.5 size-4 accent-admin" />
      <span>
        <span className="block text-sm font-bold text-admin-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-admin-muted">{desc}</span>
      </span>
    </label>
  );
}
