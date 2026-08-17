"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { onSessionLost, type SessionLoss } from "@/lib/api";
import { clearSession } from "@/lib/auth";

/** Seconds on screen before the redirect happens by itself. */
const REDIRECT_SECONDS = 15;

/**
 * Per-reason wording. The server already sends a sentence, but a heading and a
 * line of "what to do now" turn it from a report into something actionable —
 * and "someone signed in as you" deserves a different tone from "your day ran
 * out".
 */
const COPY: Record<
  string,
  { title: string; advice: string; alarming?: boolean }
> = {
  SESSION_REVOKED: {
    title: "Signed in somewhere else",
    advice:
      "If that was not you, sign in again and change your password straight away.",
    alarming: true,
  },
  SESSION_EXPIRED: {
    title: "Session expired",
    advice: "Sign in again to pick up where you left off.",
  },
  SESSION_UNKNOWN: {
    title: "Session ended",
    advice: "Sign in again to continue.",
  },
  INVALID_TOKEN: {
    title: "Session ended",
    advice: "Sign in again to continue.",
  },
  NO_TOKEN: {
    title: "You are signed out",
    advice: "Sign in to continue.",
  },
  ACCOUNT_INACTIVE: {
    title: "Account unavailable",
    advice: "Your administrator can re-enable it.",
    alarming: true,
  },
  INSTITUTE_SUSPENDED: {
    title: "Institute suspended",
    advice: "Contact the platform administrator for details.",
    alarming: true,
  },
};

/** Screens that already explain why you are looking at them. */
function isAuthScreen(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/platform/login");
}

const FALLBACK = {
  title: "Session ended",
  advice: "Sign in again to continue.",
};

/**
 * Explains a lost session, then sends the user to sign in again.
 *
 * Mounted once at the root so every screen behaves identically. Without it a
 * dead session shows up as an unexplained error on whatever screen happened to
 * be making a request — worst of all mid-exam, where a candidate deserves to
 * know their answers are saved rather than guessing.
 */
export function SessionLostModal() {
  const router = useRouter();
  const [loss, setLoss] = useState<SessionLoss | null>(null);
  const [seconds, setSeconds] = useState(REDIRECT_SECONDS);
  // Guards against a burst of parallel 401s re-opening the dialog.
  const shownRef = useRef(false);

  const goToLogin = useCallback(() => {
    clearSession();
    // Dismiss as we leave. Without this the dialog sits on the login screen at
    // "Redirecting in 0s" with nothing left to redirect to.
    setLoss(null);
    shownRef.current = false;
    router.replace("/login");
  }, [router]);

  useEffect(
    () =>
      onSessionLost((detail) => {
        if (shownRef.current) return;
        // A sign-in screen explains itself; a modal over it is noise. Read the
        // path at event time rather than reacting to it afterwards, so the
        // dialog is never raised there in the first place.
        if (isAuthScreen(window.location.pathname)) {
          clearSession();
          return;
        }
        shownRef.current = true;
        setLoss(detail);
        setSeconds(REDIRECT_SECONDS);
      }),
    [],
  );

  useEffect(() => {
    if (!loss) return;
    // The updater stays PURE — React may run it during render, and a side
    // effect in there re-renders other components mid-render (it did: it
    // reached AdminSidebar through the session store). The redirect is driven
    // by the timeout below, not from inside the updater.
    const tick = setInterval(() => {
      setSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    const done = setTimeout(goToLogin, REDIRECT_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [loss, goToLogin]);

  if (!loss) return null;

  const copy = COPY[loss.reason] ?? FALLBACK;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-lost-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 [font-family:var(--font-hanken)]"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
              copy.alarming
                ? "bg-danger/10 text-danger"
                : "bg-admin-surface text-admin-muted"
            }`}
          >
            <LockIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2
              id="session-lost-title"
              className="text-lg font-bold text-admin-ink"
            >
              {copy.title}
            </h2>
            {/* The server's own sentence — the exact reason, not a paraphrase. */}
            <p className="mt-1 text-sm text-admin-muted">{loss.message}</p>
            <p className="mt-2 text-sm font-semibold text-admin-ink">
              {copy.advice}
            </p>
          </div>
        </div>

        {/* Candidates mid-exam need to know their work is not lost. */}
        <p className="mt-4 rounded-lg border border-admin-line/60 bg-admin-bg/50 px-3 py-2 text-xs text-admin-muted">
          Answers you had already saved are stored on the server. Signing in
          again returns you to where you were.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm text-admin-muted">
            Redirecting in{" "}
            <span className="font-bold tabular-nums text-admin-ink">
              {seconds}s
            </span>
          </p>
          <button
            type="button"
            autoFocus
            onClick={goToLogin}
            className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
          >
            Sign in again
          </button>
        </div>
      </div>
    </div>
  );
}

function LockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm0 2a3 3 0 0 1 3 3v3H9V6a3 3 0 0 1 3-3Zm0 11a2 2 0 0 1 1 3.73V19a1 1 0 1 1-2 0v-1.27A2 2 0 0 1 12 14Z"
        fill="currentColor"
      />
    </svg>
  );
}
