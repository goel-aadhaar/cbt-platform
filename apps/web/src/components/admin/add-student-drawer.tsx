"use client";

import { useMemo, useState } from "react";

import { LoadingSpinner } from "@/components/loading-spinner";
import { useOrgCatalogue } from "@/hooks/use-org-catalogue";

import { inviteStudent } from "@/lib/admin";

import { KeyIcon, UserIcon, XIcon } from "./icons";

import { useBatchPaths } from "./academic-cascade";

/**
 * Right-side drawer for enrolling a new student (Figma 9:3758), wired to
 * POST /invitations/student.
 *
 * The backend creates students through the INVITE flow — it needs
 * `{name, email, batchId}` and mails an activation link, so the student
 * lands in PENDING until they set a password. The roll number is always
 * server-generated ({yy}{institute code}{sequence}, §2.11), never entered
 * here. The design's "Parent/Guardian Phone" and "Generate Credentials"
 * controls have no backing field, so they're replaced by a note explaining
 * what actually happens. Program/Class remain as filters that narrow the
 * Batch list (the real org hierarchy is program → class → batch).
 */
export function AddStudentDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (name: string, rollNumber: string | undefined) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [programId, setProgramId] = useState("");
  const [classId, setClassId] = useState("");
  const [batchId, setBatchId] = useState("");

  const catalogue = useOrgCatalogue();
  const programs = catalogue?.programs ?? [];

  const visibleClasses = useMemo(() => {
    const classes = catalogue?.classes ?? [];
    return programId
      ? classes.filter((c) => c.programId === programId)
      : classes;
  }, [catalogue, programId]);
  const visibleBatches = useMemo(() => {
    const batches = catalogue?.batches ?? [];
    return classId ? batches.filter((b) => b.classId === classId) : batches;
  }, [catalogue, classId]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { path: batchPath } = useBatchPaths(open);

  const valid =
    name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && batchId !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const invited = await inviteStudent({
        name: name.trim(),
        email: email.trim(),
        batchId,
      });
      onCreated?.(name.trim(), invited.rollNumber);
      setName("");
      setEmail("");
      setBatchId("");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not invite the student.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-admin-ink/30"
      />

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

        <form
          id="add-student-form"
          onSubmit={submit}
          className="flex flex-1 flex-col gap-5 overflow-auto px-8 py-6"
        >
          <Field label="Full Name" required>
            <div className="flex items-center gap-2 rounded-lg border border-admin-line bg-admin-bg px-3 py-3 focus-within:border-admin">
              <span className="text-admin-subtle">
                <UserIcon className="size-4" />
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Johnathan Doe"
                className="w-full bg-transparent text-sm text-admin-ink outline-none placeholder:text-admin-subtle"
              />
            </div>
          </Field>

          <Field label="Email" required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Program">
              <select
                value={programId}
                onChange={(e) => {
                  setProgramId(e.target.value);
                  setClassId("");
                  setBatchId("");
                }}
                className={inputCls}
              >
                <option value="">All programs</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Class">
              <select
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setBatchId("");
                }}
                className={inputCls}
              >
                <option value="">All classes</option>
                {visibleClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Batch" required>
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className={inputCls}
            >
              <option value="">Select Batch</option>
              {/* Programme and class above are optional filters, so this list
                  is the whole institute until they are used. The full path
                  keeps it unambiguous either way. */}
              {visibleBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {batchPath(b)}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex items-center gap-3 rounded-xl bg-admin/[0.06] p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-admin-mint/60 text-admin">
              <KeyIcon className="size-4" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold text-admin-ink">
                Invitation email
              </p>
              <p className="text-xs text-admin-muted">
                The student receives an activation link and stays PENDING until
                they set their password. Their roll number is assigned
                automatically — you&apos;ll see it once the invite is sent.
              </p>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}
        </form>

        <footer className="flex items-center justify-end gap-3 border-t border-admin-line/60 px-8 py-5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-admin-line bg-white px-6 py-3 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-student-form"
            disabled={!valid || submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-admin px-6 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-40"
            aria-busy={submitting || undefined}
          >
            {submitting && <LoadingSpinner size={14} tone="current" label="" />}
            {submitting ? "Inviting…" : "Send Invite"}
          </button>
        </footer>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-admin-line bg-white px-3 py-3 text-sm text-admin-ink outline-none focus:border-admin";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-admin-muted">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
    </label>
  );
}
