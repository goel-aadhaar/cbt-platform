"use client";

import { useSyncExternalStore } from "react";

import { type AuthUser, getUserSnapshot, subscribeSession } from "@/lib/auth";

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
