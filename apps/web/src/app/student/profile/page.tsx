"use client";

import { useState } from "react";

import { StudentShell } from "@/components/student/student-shell";

export default function StudentProfilePage() {
  const [prefs, setPrefs] = useState({
    email: true,
    sms: false,
    dark: false,
  });

  return (
    <StudentShell breadcrumb={["Profile"]}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
        {/* Left column */}
        <div className="space-y-5">
          {/* Profile card */}
          <section className="overflow-hidden rounded-2xl border border-admin-line/40 bg-white shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
            <div className="h-24 bg-admin/20" />
            <div className="flex flex-col items-center px-6 pb-6 text-center">
              <div className="relative -mt-12">
                <span className="flex size-24 items-center justify-center rounded-full border-4 border-white bg-admin text-2xl font-bold text-white">
                  AV
                </span>
                <span className="absolute bottom-1 right-1 flex size-7 items-center justify-center rounded-full border-2 border-white bg-admin text-white">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-3.5"
                    fill="currentColor"
                  >
                    <path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" />
                  </svg>
                </span>
              </div>
              <h1 className="mt-3 text-xl font-bold text-admin-ink">
                Akash Verma
              </h1>
              <p className="text-sm text-admin-muted [font-family:var(--font-courier-prime)]">
                Roll No. DRSK789434
              </p>
              <div className="mt-4 flex gap-3">
                <span className="flex items-center gap-1.5 rounded-full bg-admin-bg px-3 py-1.5 text-xs font-semibold text-admin-muted">
                  🔥 12-day streak
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-admin-bg px-3 py-1.5 text-xs font-semibold text-admin-muted">
                  ✓ 24 tests
                </span>
              </div>
            </div>
          </section>

          {/* Academic details */}
          <section className="rounded-2xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-admin-ink">
              🎓 Academic Details
            </h2>
            <dl className="mt-4 divide-y divide-admin-line/40 text-sm">
              <Row label="Exam Track">
                <span className="rounded-full bg-admin/10 px-2.5 py-1 text-xs font-semibold text-admin">
                  NEET 2027
                </span>
              </Row>
              <Row label="Class">
                <span className="font-semibold text-admin-ink">Class XII</span>
              </Row>
              <Row label="Batch">
                <span className="font-semibold text-admin-ink">Batch A</span>
              </Row>
              <Row label="Enrolled Since">
                <span className="font-semibold text-admin-ink">April 2023</span>
              </Row>
              <Row label="Assigned Mentor">
                <span className="font-semibold text-admin-ink">
                  🧑‍🏫 Dr. Sharma
                </span>
              </Row>
            </dl>
            <p className="mt-4 rounded-lg bg-admin-bg p-3 text-xs text-admin-muted">
              ⓘ To update your batch or track details, please contact your
              institute&apos;s administrative desk.
            </p>
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Personal information */}
          <section className="rounded-2xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-admin-ink">
              👤 Personal Information
            </h2>
            <form
              className="mt-5 space-y-5"
              onSubmit={(e) => e.preventDefault()}
            >
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="Full Name" defaultValue="Akash Verma" />
                <Field label="Date of Birth" defaultValue="08/15/2006" />
                <Field
                  label="Email Address"
                  type="email"
                  defaultValue="akash.v@example.com"
                />
                <Field label="Phone Number" defaultValue="+91 98765 43210" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-admin-ink">
                  Residential Address
                </label>
                <textarea
                  rows={2}
                  defaultValue="42, Green Park Avenue, New Delhi, India 110016"
                  className="w-full resize-none rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm text-admin-ink outline-none focus:border-admin"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </section>

          {/* Preferences */}
          <section className="rounded-2xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-admin-ink">
              ⚙ Preferences
            </h2>
            <div className="mt-4 divide-y divide-admin-line/40">
              <Toggle
                title="Email Notifications"
                sub="Receive test results and weekly reports via email."
                on={prefs.email}
                onToggle={() => setPrefs((p) => ({ ...p, email: !p.email }))}
              />
              <Toggle
                title="SMS / WhatsApp Alerts"
                sub="Get instant alerts for upcoming live classes and exams."
                on={prefs.sms}
                onToggle={() => setPrefs((p) => ({ ...p, sms: !p.sms }))}
              />
              <Toggle
                title="Dark Mode"
                sub="Ease eye strain during late-night study sessions."
                on={prefs.dark}
                onToggle={() => setPrefs((p) => ({ ...p, dark: !p.dark }))}
              />
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="font-semibold text-admin-ink">
                    Portal Language
                  </p>
                  <p className="text-sm text-admin-muted">
                    Select your preferred language for the interface.
                  </p>
                </div>
                <select className="h-10 rounded-lg border border-admin-line bg-white px-3 text-sm text-admin-ink outline-none focus:border-admin">
                  <option>English</option>
                  <option>हिन्दी</option>
                </select>
              </div>
            </div>
          </section>
        </div>
      </div>
    </StudentShell>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-admin-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Field({
  label,
  defaultValue,
  type = "text",
}: {
  label: string;
  defaultValue: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-admin-ink">
        {label}
      </label>
      <input
        type={type}
        defaultValue={defaultValue}
        className="h-11 w-full rounded-lg border border-admin-line bg-white px-3 text-sm text-admin-ink outline-none focus:border-admin"
      />
    </div>
  );
}

function Toggle({
  title,
  sub,
  on,
  onToggle,
}: {
  title: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="pr-4">
        <p className="font-semibold text-admin-ink">{title}</p>
        <p className="text-sm text-admin-muted">{sub}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Toggle ${title}`}
        onClick={onToggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          on ? "bg-admin" : "bg-admin-line"
        }`}
      >
        <span
          className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${
            on ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
