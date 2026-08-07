"use client";

import { useState } from "react";

import { ChevronDownIcon, KeyIcon, PhoneIcon, UserIcon, XIcon } from "./icons";

/**
 * Right-side drawer for enrolling a new student (Figma 9:3758). Presentational
 * for now — Save just closes; wiring to POST /students (invite flow) comes later.
 */
export function AddStudentDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [generateCreds, setGenerateCreds] = useState(true);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-admin-ink/30"
      />

      {/* Panel */}
      <div className="relative flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-admin-line/60 px-8 py-6">
          <div>
            <h2 className="text-2xl font-bold text-admin-ink">
              Add New Student
            </h2>
            <p className="mt-1 text-sm text-admin-muted">
              Enroll a new student to the institute workspace.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-admin-muted hover:bg-admin-bg"
          >
            <XIcon className="size-5" />
          </button>
        </header>

        <form className="flex flex-1 flex-col gap-5 overflow-auto px-8 py-6">
          <Field label="Full Name">
            <IconInput
              icon={<UserIcon className="size-4" />}
              placeholder="e.g. Johnathan Doe"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Class">
              <SelectBox>Select Class</SelectBox>
            </Field>
            <Field label="Batch">
              <SelectBox>Select Batch</SelectBox>
            </Field>
          </div>

          <Field label="Program">
            <SelectBox>Select Academic Program</SelectBox>
          </Field>

          <Field label="Parent/Guardian Phone">
            <IconInput
              icon={<PhoneIcon className="size-4" />}
              placeholder="+91 00000 00000"
            />
          </Field>

          <div className="flex items-center gap-3 rounded-xl bg-admin/[0.06] p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-admin-mint/60 text-admin">
              <KeyIcon className="size-4" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold text-admin-ink">
                Generate Credentials
              </p>
              <p className="text-xs text-admin-muted">
                Send login details to parent phone
              </p>
            </div>
            <Toggle
              on={generateCreds}
              onToggle={() => setGenerateCreds((v) => !v)}
            />
          </div>
        </form>

        <footer className="flex items-center justify-end gap-3 border-t border-admin-line/60 px-8 py-5">
          <button
            onClick={onClose}
            className="rounded-lg border border-admin-line bg-white px-6 py-3 text-sm font-semibold text-admin-ink hover:bg-admin-bg"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-admin px-6 py-3 text-sm font-semibold text-white hover:opacity-95"
          >
            Save Student
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-admin-muted">{label}</span>
      {children}
    </label>
  );
}

function IconInput({
  icon,
  placeholder,
}: {
  icon: React.ReactNode;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-admin-line bg-admin-bg px-3 py-3 focus-within:border-admin">
      <span className="text-admin-subtle">{icon}</span>
      <input
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-admin-ink outline-none placeholder:text-admin-subtle"
      />
    </div>
  );
}

function SelectBox({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="flex items-center justify-between rounded-lg border border-admin-line bg-white px-3 py-3 text-sm text-admin-subtle hover:bg-admin-bg"
    >
      {children}
      <ChevronDownIcon className="size-4 text-admin-muted" />
    </button>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? "bg-admin" : "bg-admin-line"
      }`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
