"use client";

import { useSyncExternalStore } from "react";

import {
  getMyInstituteSnapshot,
  refreshMyInstitute,
  subscribeMyInstitute,
  type MyInstitute,
} from "@/lib/platform";

/**
 * The caller's own institute (§ institute branding) — name, slug, code, and
 * its logo if one has been set. `GET /institutes/me` is open to ADMIN,
 * TEACHER and STUDENT alike, so every workspace shell can use this the same
 * way.
 *
 * Backed by the shared cache in `lib/platform.ts`: every mounted consumer
 * reads the same in-memory row instead of firing its own fetch, and a
 * rename/logo change made anywhere (via `setMyInstituteCache`) is reflected
 * here immediately, with no remount needed. `null` until the first fetch
 * resolves, which callers treat as "no custom logo yet" rather than
 * blocking on it — a sidebar should never wait on a network round-trip to
 * show its brand mark.
 */
export function useMyInstitute(): {
  institute: MyInstitute | null;
  /** Forces a genuine re-fetch. Prefer `setMyInstituteCache` after a
   *  mutation whose response already has the fresh row — this is for the
   *  rare case nothing local has it to push. */
  refresh: () => void;
} {
  const institute = useSyncExternalStore(
    subscribeMyInstitute,
    getMyInstituteSnapshot,
    () => null,
  );
  return { institute, refresh: refreshMyInstitute };
}
