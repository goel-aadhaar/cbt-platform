"use client";

import { useEffect, useState } from "react";

import {
  deactivateStaff,
  getStaffBatches,
  inviteAdmin,
  inviteTeacher,
  listBatches,
  reactivateStaff,
  resendStaffInvite,
  setStaffBatches,
  updateStaff,
  type BatchRow,
  type StaffRow,
} from "@/lib/admin";

import { CheckIcon, ImageIcon, UserPlusIcon, XIcon } from "./icons";

import { useBatchPaths } from "./academic-cascade";

/* ------------------------------ Add Staff ------------------------------ */

/**
 * Add-staff drawer, wired to POST /invitations/teacher (with optional
 * `batchIds`) or POST /invitations/admin, depending on which page opened it —
 * there's no in-drawer role toggle any more since Teachers and Administrators
 * are now separate pages (§2.4 admin console split), so "Add Staff" from
 * either page unambiguously means "invite into this role".
 */
export function AddStaffDrawer({
  open,
  role,
  onClose,
  onInvited,
}: {
  open: boolean;
  role: "TEACHER" | "ADMIN";
  onClose: () => void;
  onInvited?: (name: string) => void;
}) {
  const [invite, setInvite] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || role !== "TEACHER") return;
    let cancelled = false;
    listBatches()
      .then((b) => !cancelled && setBatches(b))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, role]);

  const valid = name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const body = { name: name.trim(), email: email.trim() };
      if (role === "ADMIN") {
        await inviteAdmin(body);
      } else {
        await inviteTeacher({ ...body, batchIds });
      }
      onInvited?.(name.trim());
      setName("");
      setEmail("");
      setBatchIds([]);
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
      title={role === "ADMIN" ? "Add Administrator" : "Add Teacher"}
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

      {role === "TEACHER" && (
        <>
          <SectionLabel>Assignments</SectionLabel>
          <Field label="Subject(s)">
            <input
              disabled
              placeholder="Not set on invite"
              title="A teacher's subjects are derived from the questions they write, not set here."
              className={`${inputCls} bg-admin-surface text-admin-subtle disabled:cursor-not-allowed`}
            />
          </Field>
          <Field label="Batch(es)">
            <BatchChecklist
              batches={batches}
              selected={batchIds}
              onToggle={(id) =>
                setBatchIds((prev) =>
                  prev.includes(id)
                    ? prev.filter((b) => b !== id)
                    : [...prev, id],
                )
              }
            />
            <span className="mt-1 text-xs text-admin-subtle">
              What this teacher may see across exams, students and results. Can
              be changed any time from their profile.
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
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  /** The roster row that was clicked — already-loaded data, no extra fetch. */
  staff: StaffRow | null;
  /** Fired after any successful mutation, so the parent list can refetch. */
  onChanged?: () => void;
}) {
  const [tab, setTab] = useState(0);
  const [name, setName] = useState(staff?.name ?? "");
  const [allBatches, setAllBatches] = useState<BatchRow[]>([]);
  const [assignedBatchIds, setAssignedBatchIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Roles were display-only: the account's roles were fixed at invitation time
  // with no promote, demote or grant anywhere in the product.
  const [roles, setRoles] = useState<("TEACHER" | "ADMIN")[]>(
    (staff?.roles ?? []).filter(
      (r): r is "TEACHER" | "ADMIN" => r === "TEACHER" || r === "ADMIN",
    ),
  );

  const isTeacher = staff?.roles.includes("TEACHER") ?? false;

  useEffect(() => {
    if (!open || !staff || !isTeacher) return;
    let cancelled = false;
    Promise.all([listBatches(), getStaffBatches(staff.id)])
      .then(([all, mine]) => {
        if (cancelled) return;
        setAllBatches(all);
        setAssignedBatchIds(mine.map((b) => b.id));
      })
      .catch(
        (e: unknown) =>
          !cancelled &&
          setError(e instanceof Error ? e.message : "Could not load batches."),
      );
    return () => {
      cancelled = true;
    };
    // staff.id is the real dependency; re-run whenever a different row opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, staff?.id, isTeacher]);

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

  async function saveChanges() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (tab === 1 && isTeacher) {
        await setStaffBatches(staff!.id, assignedBatchIds);
        setNotice("Batch assignment saved.");
      } else {
        const nameChanged =
          name.trim().length >= 2 && name.trim() !== staff!.name;
        const rolesChanged =
          [...roles].sort().join() !== [...staff!.roles].sort().join();
        if (nameChanged || rolesChanged) {
          await updateStaff(staff!.id, {
            ...(nameChanged ? { name: name.trim() } : {}),
            ...(rolesChanged ? { roles } : {}),
          });
          setNotice(
            rolesChanged
              ? "Saved. Their role takes effect on their next request — an open session using a removed role is ended."
              : "Saved.",
          );
        }
      }
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    if (
      !window.confirm(
        `Deactivate ${staff!.name}? They will no longer be able to sign in.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deactivateStaff(staff!.id);
      onChanged?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not deactivate.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReactivate() {
    setBusy(true);
    setError(null);
    try {
      await reactivateStaff(staff!.id);
      onChanged?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reactivate.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResendInvite() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await resendStaffInvite(staff!.id);
      setNotice(`Invitation email resent to ${staff!.email}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resend the invite.");
    } finally {
      setBusy(false);
    }
  }

  const tabs = [
    "Profile Details",
    ...(isTeacher ? ["Assignments"] : []),
    "Login History",
  ];
  const assignmentsTabIndex = isTeacher ? 1 : -1;
  const loginTabIndex = isTeacher ? 2 : 1;

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
            {tabs.map((t, i) => (
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
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputCls}
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
                    {/*
                      An account may hold both roles at once — the session picks
                      one at sign-in — so this is two checkboxes rather than a
                      single-choice select. At least one must remain, and the
                      API refuses a self-demotion or removing the institute's
                      last administrator.
                    */}
                    <div className="flex flex-col gap-2 pt-1">
                      {(["TEACHER", "ADMIN"] as const).map((r) => {
                        const checked = roles.includes(r);
                        const lastOne = checked && roles.length === 1;
                        return (
                          <label
                            key={r}
                            className="flex items-center gap-2 text-sm text-admin-ink"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={lastOne}
                              onChange={(e) =>
                                setRoles((prev) =>
                                  e.target.checked
                                    ? [...prev, r]
                                    : prev.filter((x) => x !== r),
                                )
                              }
                              className="size-4 accent-admin disabled:opacity-40"
                            />
                            {r === "ADMIN" ? "Administrator" : "Teacher"}
                            {lastOne && (
                              <span className="text-xs text-admin-muted">
                                (an account needs at least one role)
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
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
          ) : tab === assignmentsTabIndex ? (
            <Card title="Batches">
              {allBatches.length === 0 ? (
                <p className="py-4 text-center text-sm text-admin-muted">
                  No batches exist yet in this institute.
                </p>
              ) : (
                <BatchChecklist
                  batches={allBatches}
                  selected={assignedBatchIds}
                  onToggle={(id) =>
                    setAssignedBatchIds((prev) =>
                      prev.includes(id)
                        ? prev.filter((b) => b !== id)
                        : [...prev, id],
                    )
                  }
                />
              )}
              <p className="mt-2 text-xs text-admin-subtle">
                What this teacher may see across exams, students and results.
                Save Changes below to apply.
              </p>
            </Card>
          ) : tab === loginTabIndex ? (
            <p className="py-10 text-center text-admin-muted">
              {staff.lastLoginAt
                ? `Last signed in ${new Date(staff.lastLoginAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}.`
                : "Has not signed in yet."}
            </p>
          ) : null}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}
          {notice && (
            <p className="mt-4 rounded-lg border border-admin/30 bg-admin/5 px-3 py-2 text-sm font-semibold text-admin">
              {notice}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-admin-line/60 bg-white px-8 py-5">
          <div className="flex gap-3">
            {staff.status === "DISABLED" ? (
              <button
                onClick={() => void handleReactivate()}
                disabled={busy}
                className="rounded-lg border border-admin/40 bg-white px-4 py-2.5 text-sm font-semibold text-admin hover:bg-admin/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reactivate Staff
              </button>
            ) : (
              <button
                onClick={() => void handleDeactivate()}
                disabled={busy}
                className="rounded-lg border border-danger/40 bg-white px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger-soft/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Deactivate Staff
              </button>
            )}
            {staff.status === "PENDING" && (
              <button
                onClick={() => void handleResendInvite()}
                disabled={busy}
                className="rounded-lg border border-admin-line bg-white px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:cursor-not-allowed disabled:opacity-40"
              >
                Resend Invite
              </button>
            )}
          </div>
          <button
            onClick={() => void saveChanges()}
            disabled={busy}
            className="rounded-lg bg-admin px-6 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save Changes
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------- shared ------------------------------- */

/**
 * A teacher is routinely assigned several batches across two classes, so this
 * stays a checkbox list rather than becoming a cascade — narrowing would turn
 * one pass into several. The full path on each row is what removes the
 * ambiguity instead.
 */
function BatchChecklist({
  batches,
  selected,
  onToggle,
}: {
  batches: BatchRow[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const { path } = useBatchPaths(true);
  if (batches.length === 0) {
    return (
      <p className="text-xs text-admin-subtle">
        No batches exist yet in this institute.
      </p>
    );
  }
  return (
    <div className="flex max-h-40 flex-col gap-1 overflow-auto rounded-lg border border-admin-line bg-white p-2">
      {batches.map((b) => (
        <label
          key={b.id}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-admin-ink hover:bg-admin-bg"
        >
          <input
            type="checkbox"
            checked={selected.includes(b.id)}
            onChange={() => onToggle(b.id)}
            className="size-4 accent-admin"
          />
          {path(b)}
        </label>
      ))}
    </div>
  );
}

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
