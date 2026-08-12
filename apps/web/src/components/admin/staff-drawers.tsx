"use client";

import { useState } from "react";

import { inviteTeacher } from "@/lib/admin";

import { CheckIcon, ImageIcon, UserPlusIcon, XIcon } from "./icons";

/* ------------------------------ Add Staff ------------------------------ */

/**
 * Add-staff drawer, wired to POST /invitations/teacher.
 *
 * The invite endpoint accepts only `{name, email}` — role is implicitly TEACHER
 * (admin invites are SUPERADMIN-only) and subject/batch assignments have no
 * backing field yet, so those inputs are marked as post-activation steps rather
 * than pretending to save.
 */
export function AddStaffDrawer({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited?: (name: string) => void;
}) {
  const [invite, setInvite] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await inviteTeacher({ name: name.trim(), email: email.trim() });
      onInvited?.(name.trim());
      setName("");
      setEmail("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the invite.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <DrawerShell
      title="Add New Staff"
      onClose={onClose}
      width="max-w-[480px]"
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-admin-line bg-white px-6 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid || submitting}
            className="flex items-center gap-2 rounded-lg bg-admin px-6 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-40"
          >
            <UserPlusIcon className="size-4" />
            {submitting ? "Sending…" : "Send Invite"}
          </button>
        </div>
      }
    >
      {/* Profile photo */}
      <div className="flex items-center gap-4">
        <span className="flex size-14 items-center justify-center rounded-full bg-admin-mint/40 text-admin">
          <ImageIcon className="size-6" />
        </span>
        <div>
          <p className="font-bold text-admin-ink">Profile Photo</p>
          <p className="text-sm text-admin-muted">Optional, JPG or PNG.</p>
        </div>
      </div>

      <SectionLabel>Basic Information</SectionLabel>
      <Field label="Full Name" required>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jane Doe"
          className={inputCls}
        />
      </Field>
      <Field label="Email Address" required>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane.doe@drsk.edu"
          className={inputCls}
        />
      </Field>

      <SectionLabel>Role &amp; Assignments</SectionLabel>
      <Field label="Role">
        <input
          value="Teacher"
          readOnly
          className={`${inputCls} bg-admin-bg text-admin-muted`}
        />
        <span className="mt-1 text-xs text-admin-subtle">
          Staff invites create a Teacher. Admin invites are issued by a
          superadmin.
        </span>
      </Field>
      <Field label="Subject(s)">
        <ChipInput
          chips={["Biology", "Chemistry"]}
          placeholder="Type to search…"
        />
        <span className="mt-1 text-xs text-admin-subtle">
          Assigned after the teacher activates their account.
        </span>
      </Field>
      <Field label="Batch(es)">
        <ChipInput chips={["2024-A"]} placeholder="Type to search…" />
        <span className="mt-1 text-xs text-admin-subtle">
          Assigned after activation.
        </span>
      </Field>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <label className="mt-6 flex cursor-pointer items-start gap-3">
        <span
          onClick={() => setInvite((v) => !v)}
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border ${invite ? "border-admin bg-admin text-white" : "border-admin-line"}`}
        >
          {invite && <CheckIcon className="size-3.5" />}
        </span>
        <span>
          <span className="block text-sm font-semibold text-admin-ink">
            Send invitation email immediately
          </span>
          <span className="block text-xs text-admin-muted">
            The user will receive a link to set their password.
          </span>
        </span>
      </label>
    </DrawerShell>
  );
}

/* ---------------------------- Staff Details ---------------------------- */

export function StaffDetailsDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(0);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end [font-family:var(--font-hanken)]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-admin-ink/30"
      />
      <div className="relative flex h-full w-full max-w-[640px] flex-col bg-white shadow-2xl">
        <header className="border-b border-admin-line/60 px-8 pt-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <span className="flex size-12 items-center justify-center rounded-full bg-admin text-sm font-bold text-white">
                RJ
              </span>
              <div>
                <h2 className="text-xl font-bold text-admin-ink">
                  Rahul Joshi
                </h2>
                <p className="flex items-center gap-2 text-sm text-admin-muted">
                  Senior Faculty - Biology
                  <span className="rounded-full bg-admin-mint/50 px-2 py-0.5 text-xs font-semibold text-admin">
                    Active
                  </span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-admin-muted hover:text-admin-ink"
            >
              <XIcon className="size-5" />
            </button>
          </div>
          <div className="mt-4 flex gap-6">
            {["Profile Details", "Assignments", "Login History"].map((t, i) => (
              <button
                key={t}
                onClick={() => setTab(i)}
                className={`border-b-2 pb-3 text-sm font-semibold ${i === tab ? "border-admin text-admin" : "border-transparent text-admin-muted"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-admin-bg px-8 py-6">
          {tab === 0 ? (
            <div className="flex flex-col gap-6">
              <Card title="Personal Information">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="First Name">
                    <input defaultValue="Rahul" className={inputCls} />
                  </Field>
                  <Field label="Last Name">
                    <input defaultValue="Joshi" className={inputCls} />
                  </Field>
                </div>
                <Field label="Email Address">
                  <input
                    defaultValue="rahul.joshi@drskbiology.com"
                    className={inputCls}
                  />
                </Field>
                <Field label="Phone Number">
                  <input defaultValue="+91 98765 43210" className={inputCls} />
                </Field>
              </Card>
              <Card title="Employment Details">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Employee ID">
                    <input
                      defaultValue="EMP-2023-042"
                      disabled
                      className={`${inputCls} bg-admin-surface text-admin-muted`}
                    />
                  </Field>
                  <Field label="Department">
                    <input defaultValue="Biology" className={inputCls} />
                  </Field>
                </div>
                <Field label="System Role">
                  <input defaultValue="Faculty" className={inputCls} />
                </Field>
              </Card>
            </div>
          ) : (
            <p className="py-10 text-center text-admin-muted">
              {tab === 1
                ? "Assignment details will appear here."
                : "Login history will appear here."}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-admin-line/60 bg-white px-8 py-5">
          <div className="flex gap-3">
            <button
              disabled
              title="No staff-status endpoint yet"
              className="disabled:cursor-not-allowed disabled:opacity-40 rounded-lg border border-danger/40 bg-white px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger-soft/30"
            >
              Deactivate Staff
            </button>
            <button
              disabled
              title="No staff-archive endpoint yet"
              className="disabled:cursor-not-allowed disabled:opacity-40 rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg"
            >
              Archive
            </button>
          </div>
          <button
            disabled
            title="No staff-update endpoint yet"
            className="disabled:cursor-not-allowed disabled:opacity-40 rounded-lg bg-admin px-6 py-2.5 text-sm font-semibold text-white hover:opacity-95"
          >
            Save Changes
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------- shared ------------------------------- */

const inputCls =
  "w-full rounded-lg border border-admin-line bg-white px-3.5 py-3 text-sm text-admin-ink outline-none placeholder:text-admin-subtle focus:border-admin";

function DrawerShell({
  title,
  onClose,
  children,
  footer,
  width,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  width: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end [font-family:var(--font-hanken)]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-admin-ink/30"
      />
      <div
        className={`relative flex h-full w-full ${width} flex-col bg-white shadow-2xl`}
      >
        <header className="flex items-center justify-between border-b border-admin-line/60 px-7 py-6">
          <h2 className="text-2xl font-bold text-admin-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </header>
        <div className="flex flex-1 flex-col gap-4 overflow-auto px-7 py-6">
          {children}
        </div>
        <footer className="border-t border-admin-line/60 px-7 py-5">
          {footer}
        </footer>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-admin-line/60 bg-white p-5">
      <h3 className="font-bold text-admin-ink">{title}</h3>
      {children}
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-xs font-bold uppercase tracking-wide text-admin-muted">
      {children}
    </p>
  );
}

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
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-admin-muted">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}

function ChipInput({
  chips,
  placeholder,
}: {
  chips: string[];
  placeholder: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-admin-line bg-white px-3 py-2.5">
      {chips.map((c) => (
        <span
          key={c}
          className="flex items-center gap-1 rounded bg-admin-mint/40 px-2 py-1 text-sm text-admin"
        >
          {c} <XIcon className="size-3" />
        </span>
      ))}
      <input
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-admin-subtle"
      />
    </div>
  );
}
