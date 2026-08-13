"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
} from "@/components/icons";
import { ApiError } from "@/lib/api";
import { platformLogin } from "@/lib/auth";

/**
 * Platform console sign-in — the platform owner only.
 *
 * Deliberately not a role on the institute login. The account that can cross
 * every tenant does not share a door with the accounts that cannot, and the
 * separation is enforced server-side: /auth/login refuses SUPERADMIN, and this
 * endpoint refuses everyone else. The split here is for clarity, not security.
 *
 * Same design language as the candidate and staff screens, without the
 * marketing panel — nobody arrives here by accident.
 */
export default function PlatformLoginPage() {
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
      await platformLogin({ email: email.trim(), password });
      router.push("/superadmin/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? "Invalid credentials, or this is not a platform account."
            : err.message
          : err instanceof Error
            ? err.message
            : "Sign-in failed for an unknown reason.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-brand-indigo px-6 py-10">
      <div className="flex items-center gap-1.5">
        <span className="flex size-12 items-center justify-center rounded-[2px] bg-white/10">
          <Image
            src="/brand/drsk-logo.png"
            alt="DRSK"
            width={34}
            height={34}
            priority
            className="size-[34px] object-contain"
          />
        </span>
        <span className="text-xl font-semibold tracking-[-0.5px] text-white">
          DRSK
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-[420px] rounded bg-white p-8 shadow-2xl">
          <span className="flex size-11 items-center justify-center rounded-full bg-brand-indigo/10 text-brand-indigo">
            <LockIcon className="h-[21px] w-4" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-[-0.5px] text-brand">
            Platform Console
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted">
            For the platform owner. Institute staff and candidates sign in from
            the main screen.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-6 flex flex-col gap-4"
            noValidate
          >
            <div className="flex flex-col gap-2">
              <label
                htmlFor="platform-email"
                className="text-sm font-semibold leading-[21px] text-muted"
              >
                Email
              </label>
              <input
                id="platform-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@drsk.local"
                autoComplete="username"
                autoFocus
                className="w-full border border-[#6b7280] bg-white px-[13px] py-2.5 text-base text-ink outline-none placeholder:text-[#6b7280] focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="platform-password"
                className="text-sm font-semibold leading-[21px] text-muted"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="platform-password"
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
                  aria-label={showPassword ? "Hide password" : "Show password"}
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
              className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-brand-indigo px-6 py-3.5 text-sm font-bold uppercase text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign in"}
              {!submitting && <ArrowRightIcon className="size-3" />}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-subtle">
            Not a platform account?{" "}
            <Link
              href="/login"
              className="font-semibold text-brand hover:underline"
            >
              Institute sign-in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
