"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { ExamPreviewMockup } from "@/components/exam-preview-mockup";
import {
  ArrowRightIcon,
  BrowserIcon,
  CertifiedIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  SupportIcon,
} from "@/components/icons";
import { ApiError } from "@/lib/api";
import { logout, staffLogin, studentLogin, type Role } from "@/lib/auth";

const DEFAULT_INSTITUTE = process.env.NEXT_PUBLIC_DEFAULT_INSTITUTE_SLUG ?? "";

/** Everyone who is not a candidate signs in through the staff branch. */
type StaffRole = Exclude<Role, "STUDENT">;

const ROLE_LABEL: Record<Role, string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  ADMIN: "Administrator",
  SUPERADMIN: "Super Admin",
};

/**
 * The staff roles, in the order they are offered. Ordered by how often each
 * signs in, not by privilege — the rarest account should not be the first
 * thing a teacher has to read past.
 */
const STAFF_ROLES: { value: StaffRole; blurb: string }[] = [
  {
    value: "TEACHER",
    blurb: "Author questions, build papers and review results.",
  },
  {
    value: "ADMIN",
    blurb: "Run the institute: students, staff, exams and publishing.",
  },
  {
    value: "SUPERADMIN",
    blurb: "Platform owner. Access across every institute.",
  },
];

export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();

  // Guards bounce here with ?as=staff so an expired admin session does not
  // land on the audience picker it already answered.
  const preselectStaff = params.get("as") === "staff";

  const [audience, setAudience] = useState<"student" | "staff" | null>(
    preselectStaff ? "staff" : null,
  );
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);

  const [instituteSlug, setInstituteSlug] = useState(DEFAULT_INSTITUTE);
  const [rollNumber, setRollNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step: "audience" | "role" | "credentials" =
    audience === null
      ? "audience"
      : audience === "staff" && staffRole === null
        ? "role"
        : "credentials";

  /**
   * 401 is the one failure worth softening: the server says "Invalid
   * credentials" and naming the wrong field would help an attacker. Everything
   * else keeps its real reason — a wrong institute code, a disabled account or
   * an unreachable API are all actionable, and "something went wrong" hides all
   * three.
   */
  function describe(err: unknown, credentialHint: string): string {
    if (err instanceof ApiError) {
      if (err.status === 401) return credentialHint;
      return err.message;
    }
    if (err instanceof Error) return err.message;
    return "Login failed for an unknown reason.";
  }

  async function handleStudentSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await studentLogin({
        instituteSlug: instituteSlug.trim(),
        rollNumber: rollNumber.trim(),
        password,
      });
      router.push("/student");
    } catch (err) {
      setError(
        describe(
          err,
          "Invalid credentials. Check your Institute ID, Candidate ID and password.",
        ),
      );
      setSubmitting(false);
    }
  }

  async function handleStaffSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!staffRole) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await staffLogin({ email: email.trim(), password });

      // The chosen role has to match the account, or the selection would be
      // decorative: a teacher who picked Administrator would authenticate fine
      // and then meet a console that refuses them at every turn. Better to say
      // so here than to strand them on a dashboard full of errors.
      if (result.user.role !== staffRole) {
        await logout();
        setError(
          `This account signs in as ${ROLE_LABEL[result.user.role]}, not ` +
            `${ROLE_LABEL[staffRole]}. Go back and choose ` +
            `${ROLE_LABEL[result.user.role]}.`,
        );
        setSubmitting(false);
        return;
      }

      // Every staff role shares the admin console today; the API decides what
      // each of them can actually read.
      router.push("/admin/dashboard");
    } catch (err) {
      setError(
        describe(err, "Invalid credentials. Check your email and password."),
      );
      setSubmitting(false);
    }
  }

  /** Step back one screen, dropping anything typed on the screen being left. */
  function back() {
    setError(null);
    setPassword("");
    if (step === "credentials" && audience === "staff") {
      setStaffRole(null);
      return;
    }
    setAudience(null);
    setStaffRole(null);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* ---------- Left: sign-in ---------- */}
      <div className="flex w-full flex-col overflow-auto border-r border-line px-6 py-6 sm:px-12 sm:py-8 lg:w-1/2 lg:shrink-0 [@media(min-height:900px)]:sm:py-12">
        <div className="flex items-center gap-1.5">
          <span className="flex size-12 items-center justify-center rounded-[2px]">
            <Image
              src="/brand/drsk-logo.png"
              alt="DRSK"
              width={39}
              height={39}
              priority
              className="size-[39px] object-contain"
            />
          </span>
          <span className="text-xl font-semibold tracking-[-0.5px] text-[#1a6a35]">
            DRSK
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-center py-4 [@media(min-height:900px)]:py-8">
          <div className="mx-auto w-full max-w-[448px]">
            {step !== "audience" && (
              <button
                type="button"
                onClick={back}
                className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-brand"
              >
                <ArrowRightIcon className="size-3 rotate-180" />
                Back
              </button>
            )}

            {step === "audience" && (
              <>
                <Heading
                  title="Sign in"
                  subtitle="Choose how you use DRSK to continue."
                />
                <div className="flex flex-col gap-3">
                  <ChoiceCard
                    title="Student"
                    blurb="Sit your scheduled examinations and see your results."
                    icon={<StudentIcon className="size-6" />}
                    onClick={() => {
                      setError(null);
                      setAudience("student");
                    }}
                  />
                  <ChoiceCard
                    title="Administrator"
                    blurb="Staff access: teachers, administrators and platform owners."
                    icon={<StaffIcon className="size-6" />}
                    onClick={() => {
                      setError(null);
                      setAudience("staff");
                    }}
                  />
                </div>
              </>
            )}

            {step === "role" && (
              <>
                <Heading
                  title="Select your role"
                  subtitle="Sign in as the role your account was created with."
                />
                <div className="flex flex-col gap-3">
                  {STAFF_ROLES.map((r) => (
                    <ChoiceCard
                      key={r.value}
                      title={ROLE_LABEL[r.value]}
                      blurb={r.blurb}
                      onClick={() => {
                        setError(null);
                        setStaffRole(r.value);
                      }}
                    />
                  ))}
                </div>
              </>
            )}

            {step === "credentials" && audience === "student" && (
              <>
                <Heading
                  title="Candidate Login"
                  subtitle="Enter your registered credentials to access your examination dashboard."
                />
                <form
                  onSubmit={handleStudentSubmit}
                  className="flex flex-col gap-4"
                  noValidate
                >
                  <Field
                    label="Institute ID"
                    id="instituteSlug"
                    value={instituteSlug}
                    onChange={setInstituteSlug}
                    placeholder="e.g. DRSK789434"
                    autoComplete="organization"
                    autoFocus={!DEFAULT_INSTITUTE}
                  />
                  <Field
                    label="Application Number / Candidate ID"
                    id="rollNumber"
                    value={rollNumber}
                    onChange={setRollNumber}
                    placeholder="e.g. 2400183920"
                    autoComplete="username"
                    autoFocus={!!DEFAULT_INSTITUTE}
                  />
                  <PasswordField
                    value={password}
                    onChange={setPassword}
                    show={showPassword}
                    onToggle={() => setShowPassword((v) => !v)}
                  />
                  {error && <ErrorNote>{error}</ErrorNote>}
                  <SubmitButton submitting={submitting} />
                </form>
              </>
            )}

            {step === "credentials" && audience === "staff" && staffRole && (
              <>
                <Heading
                  title={`${ROLE_LABEL[staffRole]} Login`}
                  subtitle="Enter your registered credentials to access your dashboard."
                />
                <form
                  onSubmit={handleStaffSubmit}
                  className="flex flex-col gap-4"
                  noValidate
                >
                  <Field
                    label="Email"
                    id="email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@institute.edu"
                    autoComplete="username"
                    autoFocus
                  />
                  <PasswordField
                    value={password}
                    onChange={setPassword}
                    show={showPassword}
                    onToggle={() => setShowPassword((v) => !v)}
                  />
                  {error && <ErrorNote>{error}</ErrorNote>}
                  <SubmitButton submitting={submitting} />
                </form>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-line pt-4 [@media(min-height:900px)]:mt-8">
          <div className="flex items-center gap-2">
            <SupportIcon className="h-3 w-[13px] shrink-0 text-muted" />
            <span className="text-xs font-semibold leading-4 text-muted">
              Technical Support: 1800-111-2222 (9:00 AM to 6:00 PM)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <BrowserIcon className="h-[11px] w-[13px] shrink-0 text-subtle" />
            <span className="text-xs font-semibold leading-4 text-subtle">
              Supported Browsers: Chrome 80+, Edge 85+, Firefox 78+
            </span>
          </div>
        </div>
      </div>

      {/* ---------- Right: trust panel ---------- */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-brand-indigo p-12 lg:flex">
        <div className="flex max-w-[576px] flex-col gap-2">
          <h2 className="text-3xl font-bold leading-[37.5px] tracking-[-0.6px] text-white">
            India&apos;s Trusted Examination Infrastructure
          </h2>
          <p className="text-lg leading-7 text-brand-soft opacity-90">
            Secure, resilient, and highly available testing environment designed
            for high-stakes assessments.
          </p>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-hidden py-8">
          <ExamPreviewMockup />
        </div>

        <div className="flex flex-wrap gap-4 border-t border-[#e0e0ff]/20 pt-8">
          <TrustBadge
            icon={<CertifiedIcon className="h-[21px] w-[22px]" />}
            label="Board Certified"
          />
          <TrustBadge
            icon={<LockIcon className="h-[21px] w-4" />}
            label="Data Encrypted"
          />
          <TrustBadge
            icon={<EyeIcon className="h-[15px] w-[22px]" />}
            label="Proctored & Secure"
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces                                                              *
 * ------------------------------------------------------------------ */

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5 flex flex-col gap-2 [@media(min-height:900px)]:mb-8">
      <h1 className="text-3xl font-bold tracking-[-0.6px] text-brand">
        {title}
      </h1>
      <p className="text-base leading-6 text-muted">{subtitle}</p>
    </div>
  );
}

function ChoiceCard({
  title,
  blurb,
  icon,
  onClick,
}: {
  title: string;
  blurb: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded border border-[#6b7280] bg-white px-4 py-4 text-left transition-colors hover:border-brand hover:bg-brand/[0.03] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
    >
      {icon && (
        <span className="flex size-11 shrink-0 items-center justify-center rounded bg-brand/10 text-brand">
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-bold text-ink">{title}</span>
        <span className="text-sm leading-5 text-muted">{blurb}</span>
      </span>
      <ArrowRightIcon className="size-3 shrink-0 text-subtle group-hover:text-brand" />
    </button>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
    >
      {children}
    </p>
  );
}

function SubmitButton({ submitting }: { submitting: boolean }) {
  return (
    <button
      type="submit"
      disabled={submitting}
      className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-brand px-6 py-3.5 text-sm font-bold uppercase text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {submitting ? "Signing in…" : "Login"}
      {!submitting && <ArrowRightIcon className="size-3" />}
    </button>
  );
}

function PasswordField({
  value,
  onChange,
  show,
  onToggle,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="password"
        className="text-sm font-semibold leading-[21px] text-muted"
      >
        Password
      </label>
      <div className="relative">
        <input
          id="password"
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter your password"
          autoComplete="current-password"
          className="w-full border border-[#6b7280] bg-white px-[13px] py-2.5 pr-12 text-base text-ink outline-none placeholder:text-[#6b7280] focus:border-brand focus:ring-1 focus:ring-brand"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-3 flex items-center text-subtle hover:text-muted"
        >
          {show ? (
            <EyeOffIcon className="h-[15px] w-[22px]" />
          ) : (
            <EyeIcon className="h-[15px] w-[22px]" />
          )}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
  type = "text",
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  autoFocus?: boolean;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-sm font-semibold leading-[21px] text-muted"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className="w-full border border-[#6b7280] bg-white px-[13px] py-2.5 text-base text-ink outline-none placeholder:text-[#6b7280] focus:border-brand focus:ring-1 focus:ring-brand"
      />
    </div>
  );
}

function TrustBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[2px] border border-[#e0e0ff]/20 bg-[#e0e0ff]/10 px-4 py-2 text-[#e0e0ff]">
      {icon}
      <span className="text-xs font-semibold uppercase leading-4 tracking-[0.3px]">
        {label}
      </span>
    </div>
  );
}

/* The audience picker is new UI with no Figma source, so these two glyphs are
   hand-drawn rather than exported — kept here instead of in the icon set, which
   is a faithful export of the design file. */

function StudentIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M12 3 1 9l11 6 9-4.91V17h2V9L12 3Z" fill="currentColor" />
      <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82Z" fill="currentColor" />
    </svg>
  );
}

function StaffIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4Zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8Z"
        fill="currentColor"
      />
    </svg>
  );
}
