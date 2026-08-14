"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoadingSpinner } from "@/components/loading-spinner";
import { getToken, getUserSnapshot, subscribeSession } from "@/lib/auth";

/**
 * Client-side guard for any page that requires a logged-in student. Hydrates
 * safely (server gets `loading=true` so it can render nothing), then either
 * lets the children render or redirects to /login. We deliberately do NOT
 * pre-fetch /auth/me here — the local user snapshot is good enough for
 * presence checks; per-page data hooks are responsible for validating the
 * token with the server.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ok" | "anon">("loading");

  useEffect(() => {
    const check = () => {
      const token = getToken();
      const user = getUserSnapshot();
      if (!token || !user) {
        setState("anon");
        router.replace("/login");
        return;
      }
      setState("ok");
    };
    check();
    const unsubscribe = subscribeSession(check);
    return unsubscribe;
  }, [router]);

  if (state === "ok") return <>{children}</>;
  if (state === "anon") return null;
  // loading: render a quiet placeholder so SSR + first paint don't flash a
  // logged-in screen for a user whose session is gone.
  return (
    <div
      aria-hidden
      className="flex min-h-screen items-center justify-center bg-admin-bg"
    >
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size={32} />
      </div>
    </div>
  );
}
