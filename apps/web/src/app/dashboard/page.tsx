"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { fetchMe, logout, type MeResponse } from "@/lib/auth";
import { useAuthUser, useIsHydrated } from "@/hooks/use-auth";

type Verify = "checking" | "ok" | "error";

/**
 * Candidate landing after login. Validates the stored session against the API
 * (GET /auth/me) so a stale/expired token bounces to /login, and shows the
 * server-confirmed identity — proving the token round-trips end to end.
 */
export default function DashboardPage() {
  const router = useRouter();
  const hydrated = useIsHydrated();
  const cachedUser = useAuthUser();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [verify, setVerify] = useState<Verify>("checking");

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    // Async .then keeps setState out of the synchronous effect body.
    fetchMe()
      .then((user) => {
        if (!active) return;
        setMe(user);
        setVerify("ok");
      })
      .catch((err) => {
        if (!active) return;
        // SessionLostModal explains the 401 and handles the sign-out; a
        // silent redirect here would pre-empt it.
        if (!(err instanceof ApiError && err.status === 401)) {
          setVerify("error");
        }
      });
    return () => {
      active = false;
    };
  }, [hydrated, router]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (!hydrated) return null;

  const name = me?.name ?? cachedUser?.name ?? "Candidate";

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-3xl font-bold text-brand">Welcome, {name}</h1>
        <p className="mt-2 text-muted">
          {verify === "checking" && "Verifying your session…"}
          {verify === "ok" &&
            "Your session is active. Your exam dashboard will appear here."}
          {verify === "error" &&
            "Could not reach the server. Showing your saved session."}
        </p>
      </div>

      {me && (
        <dl className="grid grid-cols-[110px_1fr] gap-y-1 rounded-lg border border-line bg-surface p-4 text-sm">
          <dt className="font-semibold text-muted">Email</dt>
          <dd className="text-ink">{me.email}</dd>
          <dt className="font-semibold text-muted">Role</dt>
          <dd className="text-ink">{me.role}</dd>
          <dt className="font-semibold text-muted">Status</dt>
          <dd className="text-ink">{me.status}</dd>
        </dl>
      )}

      <button
        onClick={handleLogout}
        className="w-fit rounded bg-brand px-6 py-2.5 text-sm font-bold uppercase text-white hover:opacity-95"
      >
        Log out
      </button>
    </main>
  );
}
