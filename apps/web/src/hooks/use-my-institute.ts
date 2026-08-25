"use client";

import { useCallback, useEffect, useState } from "react";

import { getMyInstitute, type MyInstitute } from "@/lib/platform";

/**
 * The caller's own institute (§ institute branding) — name, slug, code, and
 * its logo if one has been set. `GET /institutes/me` is open to ADMIN,
 * TEACHER and STUDENT alike, so every workspace shell can use this the same
 * way. Fetched once per mount; `null` until it resolves, which callers treat
 * as "no custom logo yet" rather than blocking on it — a sidebar should never
 * wait on a network round-trip to show its brand mark.
 */
export function useMyInstitute(): {
  institute: MyInstitute | null;
  refresh: () => void;
} {
  const [institute, setInstitute] = useState<MyInstitute | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getMyInstitute()
      .then((row) => {
        if (!cancelled) setInstitute(row);
      })
      .catch(() => {
        // Silent — every caller already renders the default mark until (and
        // unless) this resolves, so a failed fetch just means "keep it".
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { institute, refresh };
}
