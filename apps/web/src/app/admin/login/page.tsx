"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { ApiError } from "@/lib/api";
import { staffLogin } from "@/lib/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await staffLogin({ email: email.trim(), password });
      router.push("/admin/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? "Invalid credentials. Check your email and password."
            : err.message
          : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-white [font-family:var(--font-hanken)]">
      {/* Left: form */}
      <div className="flex w-full flex-col justify-center px-6 py-10 sm:px-16 lg:w-1/2">
        <div className="mx-auto w-full max-w-[420px]">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-admin-2">
              <Image
                src="/brand/drsk-logo.png"
                alt="DRSK"
                width={34}
                height={34}
                className="size-[34px] object-contain"
              />
            </span>
            <div className="leading-none">
              <p className="text-lg font-extrabold tracking-tight text-admin">
                DR. SK&apos;S
              </p>
              <p className="text-[11px] font-semibold tracking-[0.2em] text-admin-muted">
                BIOLOGY
              </p>
            </div>
          </div>

          <h1 className="mt-10 text-3xl font-bold text-admin-ink">
            Admin Login
          </h1>
          <p className="mt-2 text-sm text-admin-muted">
            Sign in to the institute command center.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-8 flex flex-col gap-4"
            noValidate
          >
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-admin-muted">
                Email address
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@drsk.local"
                autoComplete="username"
                autoFocus
                className="rounded-lg border border-admin-line bg-white px-3.5 py-3 text-sm text-admin-ink outline-none placeholder:text-admin-subtle focus:border-admin"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-admin-muted">
                Password
              </span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-admin-line bg-white px-3.5 py-3 pr-12 text-sm text-admin-ink outline-none placeholder:text-admin-subtle focus:border-admin"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-3 flex items-center text-admin-subtle hover:text-admin-muted"
                >
                  {showPassword ? (
                    <EyeOffIcon className="h-[15px] w-[22px]" />
                  ) : (
                    <EyeIcon className="h-[15px] w-[22px]" />
                  )}
                </button>
              </div>
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 rounded-lg bg-admin px-6 py-3 text-sm font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Login"}
            </button>
          </form>

          <p className="mt-8 border-t border-admin-line/60 pt-4 text-xs text-admin-subtle">
            Institute staff only. Candidates sign in at the exam portal.
          </p>
        </div>
      </div>

      {/* Right: brand panel */}
      <div className="relative hidden flex-col justify-center overflow-hidden bg-admin p-16 text-white lg:flex lg:w-1/2">
        <div className="absolute -right-16 -top-16 size-72 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 size-72 rounded-full bg-admin-mint/10 blur-3xl" />
        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold leading-tight">
            Institute Command Center
          </h2>
          <p className="mt-4 text-lg text-admin-mint">
            Manage examinations, students, question banks, imports, and results
            from one secure, premium workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {["Multi-tenant", "Proctored", "Real-time Analytics"].map((f) => (
              <span
                key={f}
                className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
