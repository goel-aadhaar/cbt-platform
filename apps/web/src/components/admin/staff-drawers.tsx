"use client";

import { useState } from "react";

import { inviteAdmin, inviteTeacher, type StaffRow } from "@/lib/admin";

import { CheckIcon, ImageIcon, UserPlusIcon, XIcon } from "./icons";

/* ------------------------------ Add Staff ------------------------------ */

/**
 * Add-staff drawer, wired to POST /invitations/teacher and, when
 * "Administrator" is picked, POST /invitations/admin.
 *
 * Both invite endpoints accept only `{name, email}` from an admin caller —
 * the institute is always the caller's own — and subject/batch assignments
 * have no backing field yet, so those inputs are marked as post-activation
 * steps rather than pretending to save. They only apply to a Teacher invite,
 * so they're hidden once Administrator is selected.
 */
export function AddStaffDrawer({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited?: (name: string, role: "TEACHER" | "ADMIN") => void;
}) {
  const [invite, setInvite] = useState(true);
  const [role, setRole] = useState<"TEACHER" | "ADMIN">("TEACHER");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const body = { name: name.trim(), email: email.trim() };
      if (role === "ADMIN") {
        await inviteAdmin(body);
      } else {
        await inviteTeacher(body);
      }
      onInvited?.(name.trim(), role);
      setName("");
      setEmail("");
      setRole("TEACHER");
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
        <div className="flex gap-2">
          {(["TEACHER", "ADMIN"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                role === r
                  ? "border-admin bg-admin/10 text-admin"
                  : "border-admin-line text-admin-muted hover:bg-admin-bg"
              }`}
            >
              {r === "TEACHER" ? "Teacher" : "Administrator"}
            </button>
          ))}
        </div>
        <span className="mt-1 text-xs text-admin-subtle">
          {role === "ADMIN"
            ? "Invited into your own institute, with the same administrator access you have."
            : "Can author questions and exams, and read student reports."}
        </span>
      </Field>
      {role === "TEACHER" && (
        <>
          <Field label="Subject(s)">
            <input
              disabled
              placeholder="Not set on invite"
              title="Subject assignment isn't tracked yet — the teacher's authored subjects are derived from the questions they write."
              className={`${inputCls} bg-admin-surface text-admin-subtle disabled:cursor-not-allowed`}
            />
            <span className="mt-1 text-xs text-admin-subtle">
              Not sent with this invite — a teacher&apos;s subjects are derived
              from what they author, once they start.
            </span>
          </Field>
          <Field label="Batch(es)">
            <input
              disabled
              placeholder="Not set on invite"
              title="Batch assignment for staff isn't implemented yet."
              className={`${inputCls} bg-admin-surface text-admin-subtle disabled:cursor-not-allowed`}
            />
            <span className="mt-1 text-xs text-admin-subtle">
              Not sent with this invite.
            </span>
          </Field>
        </>
      )}

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
  staff,
}: {
  open: boolean;
  onClose: () => void;
  /** The roster row that was clicked — already-loaded data, no extra fetch. */
  staff: StaffRow | null;
}) {
  const [tab, setTab] = useState(0);
  if (!open || !staff) return null;

  const isAdmin = staff.roles.includes("ADMIN");
  const roleLabel = isAdmin
    ? staff.roles.includes("TEACHER")
      ? "Teacher & Administrator"
      : "Administrator"
    : "Teacher";
  const statusLabel =
    staff.status === "ACTIVE"
      ? "Active"
      : staff.status === "PENDING"
        ? "Invited"
        : "Deactivated";

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
                {initials(staff.name)}
              </span>
              <div>
                <h2 className="text-xl font-bold text-admin-ink">
                  {staff.name}
                </h2>
                <p className="flex items-center gap-2 text-sm text-admin-muted">
                  {roleLabel}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      staff.status === "ACTIVE"
                        ? "bg-admin-mint/50 text-admin"
                        : staff.status === "PENDING"
                          ? "bg-warn/15 text-warn"
                          : "bg-admin-surface text-admin-muted"
                    }`}
                  >
                    {statusLabel}
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
              <Card title="Contact">
                <Field label="Full Name">
                  <input
                    defaultValue={staff.name}
                    disabled
                    className={`${inputCls} bg-admin-surface text-admin-muted`}
                  />
                </Field>
                <Field label="Email Address">
                  <input
                    defaultValue={staff.email}
                    disabled
                    className={`${inputCls} bg-admin-surface text-admin-muted`}
                  />
                </Field>
              </Card>
              <Card title="Activity">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Role">
                    <input
                      defaultValue={roleLabel}
                      disabled
                      className={`${inputCls} bg-admin-surface text-admin-muted`}
                    />
                  </Field>
                  <Field label="Joined">
                    <input
                      defaultValue={new Date(staff.joinedAt).toLocaleDateString(
                        "en-IN",
                        { day: "numeric", month: "short", year: "numeric" },
                      )}
                      disabled
                      className={`${inputCls} bg-admin-surface text-admin-muted`}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Questions Authored">
                    <input
                      defaultValue={String(staff.questionsAuthored)}
                      disabled
                      className={`${inputCls} bg-admin-surface text-admin-muted`}
                    />
                  </Field>
                  <Field label="Exams Authored">
                    <input
                      defaultValue={String(staff.examsAuthored)}
                      disabled
                      className={`${inputCls} bg-admin-surface text-admin-muted`}
                    />
                  </Field>
                </div>
                {staff.subjects.length > 0 && (
                  <Field label="Subjects">
                    <div className="flex flex-wrap gap-2">
                      {staff.subjects.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-admin-mint/40 px-2.5 py-1 text-xs font-medium text-admin"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </Field>
                )}
              </Card>
            </div>
          ) : tab === 1 ? (
            <p className="py-10 text-center text-admin-muted">
              Batch and program assignments are not tracked per staff member
              yet.
            </p>
          ) : (
            <p className="py-10 text-center text-admin-muted">
              {staff.lastLoginAt
                ? `Last signed in ${new Date(staff.lastLoginAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}.`
                : "Has not signed in yet."}
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
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
