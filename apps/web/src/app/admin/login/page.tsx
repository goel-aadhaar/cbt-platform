"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
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
import { staffLogin } from "@/lib/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await staffLogin({ email: userId.trim(), password });
      router.push("/admin/dashboard");
    } catch (err) {
      // Only 401 is softened deliberately (see the candidate login). Every
      // other failure keeps its real reason so it can actually be fixed.
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? "Invalid credentials. Check your email and password."
            : err.message
          : err instanceof Error
            ? err.message
            : "Login failed for an unknown reason.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* ---------- Left: login form ---------- */}
      <div className="flex w-full flex-col overflow-auto border-r border-line px-6 py-6 sm:px-12 sm:py-8 lg:w-1/2 lg:shrink-0 [@media(min-height:900px)]:sm:py-12">
        {/* Logo */}
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

        {/* Form (vertically centered) */}
        <div className="flex flex-1 flex-col justify-center py-4 [@media(min-height:900px)]:py-8">
          <div className="mx-auto w-full max-w-[448px]">
            <div className="mb-5 flex flex-col gap-2 [@media(min-height:900px)]:mb-8">
              <h1 className="text-3xl font-bold tracking-[-0.6px] text-brand">
                Admin Login
              </h1>
              <p className="text-base leading-6 text-muted">
                Enter your registered credentials to access your admin
                dashboard.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4"
              noValidate
            >
              <Field
                label="User ID"
                id="userId"
                type="email"
                value={userId}
                onChange={setUserId}
                placeholder="admin@drsk.local"
                autoComplete="username"
                autoFocus
              />

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
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="w-full border border-[#6b7280] bg-white px-[13px] py-2.5 pr-12 text-base text-ink outline-none placeholder:text-[#6b7280] focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="absolute inset-y-0 right-3 flex items-center text-subtle hover:text-muted"
                  >
                    {showPassword ? (
                      <EyeOffIcon className="h-[15px] w-[22px]" />
                    ) : (
                      <EyeIcon className="h-[15px] w-[22px]" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-brand px-6 py-3.5 text-sm font-bold uppercase text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Signing in…" : "Login"}
                {!submitting && <ArrowRightIcon className="size-3" />}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
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
