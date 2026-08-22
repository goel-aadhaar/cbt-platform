"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { ApiError } from "@/lib/api";
import { acceptInvite, type AcceptInviteResult } from "@/lib/auth";

/**
 * Lands here from the link in an invite email (built by the API as
 * `${FRONTEND_URL}/accept-invite?token=...`) — there was no page for this
 * route at all until now, so every invited admin/teacher/student hit a 404
 * on the one link the whole invite flow depends on.
 */
export function AcceptInviteScreen() {
  const params = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AcceptInviteResult | null>(null);

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;
  const valid =
    token !== null &&
    password.length >= 8 &&
    confirm.length >= 8 &&
    password === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await acceptInvite(token, password);
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not activate the account.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex items-center gap-1.5">
          <Image
            src="/brand/codonmind-mark.png"
            alt=""
            width={39}
            height={39}
            priority
            className="size-[39px] object-contain"
          />
          <span className="text-xl font-semibold tracking-[-0.5px] text-[#1a6a35]">
            CODON MIND
          </span>
        </div>

        {!token ? (
          <>
            <h1 className="text-2xl font-bold tracking-[-0.5px] text-brand">
              Invalid invite link
            </h1>
            <p className="mt-2 text-base leading-6 text-muted">
              This link is missing its token, so there&apos;s no invitation to
              act on. Check that you copied the full link from the email, or ask
              whoever invited you to resend it.
            </p>
          </>
        ) : result ? (
          <>
            <h1 className="text-2xl font-bold tracking-[-0.5px] text-brand">
              Account activated
            </h1>
            <p className="mt-2 text-base leading-6 text-muted">
              <span className="font-semibold text-ink">{result.email}</span> is
              ready to sign in with the password you just set. We&apos;ve also
              emailed you these details.
            </p>

            {(result.institute || result.rollNumber) && (
              <dl className="mt-5 rounded border border-line bg-surface p-4 text-sm">
                {result.institute && (
                  <div className="flex items-baseline justify-between gap-3 py-1">
                    <dt className="text-muted">Institute</dt>
                    <dd className="font-semibold text-ink">
                      {result.institute.name}{" "}
                      <span className="font-normal text-subtle">
                        ({result.institute.slug})
                      </span>
                    </dd>
                  </div>
                )}
                {result.rollNumber && (
                  <div className="flex items-baseline justify-between gap-3 py-1">
                    <dt className="text-muted">Roll number</dt>
                    <dd className="font-mono font-semibold text-ink">
                      {result.rollNumber}
                    </dd>
                  </div>
                )}
              </dl>
            )}

            <Link
              href={result.role === "STUDENT" ? "/login" : "/login?as=staff"}
              className="mt-6 flex w-full items-center justify-center rounded bg-brand px-6 py-3.5 text-sm font-bold uppercase text-white transition-opacity hover:opacity-95"
            >
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-[-0.5px] text-brand">
              Set your password
            </h1>
            <p className="mt-2 text-base leading-6 text-muted">
              Choose a password to activate your account. You&apos;ll use it to
              sign in from now on.
            </p>

            <form
              onSubmit={submit}
              className="mt-6 flex flex-col gap-4"
              noValidate
            >
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold leading-[21px] text-muted">
                  Password
                </span>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    autoFocus
                    className="w-full border border-[#6b7280] bg-white px-[13px] py-2.5 pr-12 text-base text-ink outline-none placeholder:text-[#6b7280] focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
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
                {tooShort && (
                  <span className="text-xs text-danger">
                    Needs to be at least 8 characters.
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold leading-[21px] text-muted">
                  Confirm password
                </span>
                <input
                  type={show ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  className="w-full border border-[#6b7280] bg-white px-[13px] py-2.5 text-base text-ink outline-none placeholder:text-[#6b7280] focus:border-brand focus:ring-1 focus:ring-brand"
                />
                {mismatch && (
                  <span className="text-xs text-danger">
                    Passwords don&apos;t match.
                  </span>
                )}
              </label>

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
                disabled={!valid || submitting}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-brand px-6 py-3.5 text-sm font-bold uppercase text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Activating…" : "Set password & activate"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
