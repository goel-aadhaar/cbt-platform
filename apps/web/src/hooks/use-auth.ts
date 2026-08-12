"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import {
  type AuthUser,
  type Role,
  getUserSnapshot,
  subscribeSession,
} from "@/lib/auth";

/**
 * Reactive view of the current student session. Backed by useSyncExternalStore
 * so it reads localStorage without a setState-in-effect, stays in sync across
 * tabs, and hydrates cleanly (server snapshot is null, client value resolves
 * after hydration).
 */
export function useAuthUser(): AuthUser | null {
  return useSyncExternalStore(
    subscribeSession,
    getUserSnapshot,
    () => null, // server snapshot — no localStorage during SSR
  );
}

/**
 * True only after the component has hydrated on the client. Lets guarded pages
 * wait for the real session value before deciding to redirect, avoiding a
 * flash-redirect on the first (server-snapshot) render.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Guard for a role-specific console. Waits for hydration before deciding, then
 * sends anyone who does not belong to their own home instead of leaving them on
 * a console that will refuse every request they make.
 *
 * Returns null while it is still deciding, so callers render nothing rather
 * than flashing a console the user is about to be moved away from.
 */
export function useRequireRole(allowed: Role[]): AuthUser | null {
  const user = useAuthUser();
  const hydrated = useIsHydrated();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/login?as=staff");
      return;
    }
    if (!allowed.includes(user.role)) {
      router.replace(homeForRole(user.role));
    }
    // `allowed` is a literal array at every call site; depending on its
    // identity would re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user, router]);

  if (!hydrated || !user || !allowed.includes(user.role)) return null;
  return user;
}

/** Where each role belongs after signing in. */
export function homeForRole(role: Role): string {
  switch (role) {
    case "SUPERADMIN":
      return "/superadmin/dashboard";
    case "TEACHER":
      return "/teacher/dashboard";
    case "ADMIN":
      return "/admin/dashboard";
    case "STUDENT":
      return "/student";
  }
}
