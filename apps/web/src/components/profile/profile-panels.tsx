"use client";

import { useEffect, useState } from "react";

import {
  changeMyPassword,
  fetchMyProfile,
  updateMyProfile,
  type MyProfile,
} from "@/lib/auth";

const ROLE_LABEL: Record<string, string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  ADMIN: "Administrator",
  SUPERADMIN: "Super Admin",
};

/**
 * The profile screen, shared by every console.
 *
 * One component rather than four, because "what does this platform hold about
 * me" and "let me change my password" are the same job whoever is asking. Only
 * the surrounding chrome differs, so each console passes its own.
 *
 * Everything shown is read from /auth/me/profile. Nothing here is decorative:
 * a field the platform does not store is absent rather than filled with a
 * plausible-looking value.
 */
export function ProfilePanels() {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const p = await fetchMyProfile();
        if (!cancelled) setProfile(p);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Could not load your profile",
        );
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
      >
        {error}
      </p>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col gap-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-48 animate-pulse rounded-2xl bg-admin-line/15"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <IdentityCard profile={profile} />
      <DetailsCard profile={profile} onSaved={setProfile} />
      <PasswordCard />
    </div>
  );
}

/** Who you are, as the platform records it. All read-only. */
function IdentityCard({ profile }: { profile: MyProfile }) {
  const s = profile.student;
  return (
    <section className="rounded-2xl border border-admin-line/60 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-admin text-lg font-bold text-white">
          {profile.name
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase() ?? "")
            .join("")}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold text-admin-ink">
            {profile.name}
          </h2>
          <p className="text-sm text-admin-muted">
            {profile.roles.map((r) => ROLE_LABEL[r] ?? r).join(" · ")}
            {profile.institute ? ` · ${profile.institute.name}` : ""}
          </p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Row label="Email" value={profile.email} />
        <Row label="Account status" value={profile.status} />
        {s && <Row label="Candidate ID" value={s.rollNumber} />}
        {s && <Row label="Batch" value={s.batch} />}
        {s && <Row label="Class" value={s.class} />}
        {s && <Row label="Program" value={s.program} />}
        {profile.institute && (
          <Row label="Institute code" value={profile.institute.slug} />
        )}
        <Row
          label={s ? "Enrolled" : "Member since"}
          value={new Date(
            s?.enrolledAt ?? profile.createdAt,
          ).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        />
      </dl>

      {/* Say who to ask, so a wrong roll number does not become a dead end. */}
      <p className="mt-4 rounded-lg border border-admin-line/60 bg-admin-bg/50 px-3 py-2 text-xs text-admin-muted">
        {s
          ? "Your candidate ID, batch and email are part of your examination record. Contact your institute to correct any of them."
          : "Your email is your sign-in identifier. Contact your administrator to change it."}
      </p>
    </section>
  );
}

/** The fields a user owns. */
function DetailsCard({
  profile,
  onSaved,
}: {
  profile: MyProfile;
  onSaved: (p: MyProfile) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = name !== profile.name || phone !== (profile.phone ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const updated = await updateMyProfile({
        name: name.trim(),
        phone: phone.trim(),
      });
      onSaved(updated);
      setNote("Saved.");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not save your changes",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-admin-line/60 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <h2 className="text-lg font-bold text-admin-ink">Your details</h2>
      <p className="mt-0.5 text-sm text-admin-muted">
        The only fields you can change yourself.
      </p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <Field
          id="profile-name"
          label="Full name"
          value={name}
          onChange={setName}
          required
        />
        <Field
          id="profile-phone"
          label="Contact number"
          value={phone}
          onChange={setPhone}
          placeholder="+91 98765 43210"
          hint="Optional. Used by your institute to reach you about an exam."
        />

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}
        {note && (
          <p className="rounded-lg border border-admin/30 bg-admin/5 px-3 py-2 text-sm font-semibold text-admin">
            {note}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !dirty || name.trim().length < 2}
            className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Checked here as well as on the server so the mismatch is caught before a
  // round-trip; the server owns every other rule.
  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = current.length > 0 && next.length >= 8 && !mismatch;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      await changeMyPassword({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setNote(
        "Password changed. Any other device signed in as you has been signed out.",
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not change your password",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-admin-line/60 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <h2 className="text-lg font-bold text-admin-ink">Password</h2>
      <p className="mt-0.5 text-sm text-admin-muted">
        Changing it signs out every other device, but not this one.
      </p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <Field
          id="current-password"
          label="Current password"
          type="password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          required
        />
        <Field
          id="new-password"
          label="New password"
          type="password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          hint="At least 8 characters."
          required
        />
        <Field
          id="confirm-password"
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          error={mismatch ? "The two passwords do not match." : undefined}
          required
        />

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}
        {note && (
          <p className="rounded-lg border border-admin/30 bg-admin/5 px-3 py-2 text-sm font-semibold text-admin">
            {note}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !ready}
            className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:opacity-40"
          >
            {saving ? "Changing…" : "Change password"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-admin-line/40 py-2 last:border-0 sm:block sm:border-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
        {label}
      </dt>
      <dd className="truncate font-semibold text-admin-ink">{value}</dd>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
  error,
  required,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-admin-muted">
        {label}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`rounded-lg border px-3 py-2.5 text-sm text-admin-ink outline-none focus:border-admin ${
          error ? "border-danger" : "border-admin-line"
        }`}
      />
      {error ? (
        <span className="text-xs font-semibold text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-admin-muted">{hint}</span>
      ) : null}
    </label>
  );
}
