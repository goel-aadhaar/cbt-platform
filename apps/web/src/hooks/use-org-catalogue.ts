"use client";

import { useSyncExternalStore } from "react";

import {
  getOrgCatalogueSnapshot,
  subscribeOrgCatalogue,
  type OrgCatalogue,
} from "@/lib/admin";

/**
 * The institute's active program/class/batch catalogue, shared across every
 * consumer instead of each one fetching its own copy (§ duplicate-fetch fix).
 * `null` until the first subscriber's fetch resolves — callers render their
 * usual "Loading…" placeholder for that brief window, exactly as they did
 * before this was shared.
 */
export function useOrgCatalogue(): OrgCatalogue | null {
  return useSyncExternalStore(
    subscribeOrgCatalogue,
    getOrgCatalogueSnapshot,
    () => null,
  );
}
