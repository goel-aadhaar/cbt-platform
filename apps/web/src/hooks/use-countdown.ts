"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts down from `totalSeconds`. Anchored to a real start timestamp so it
 * stays accurate even if the tab is throttled/backgrounded (we recompute from
 * elapsed wall-clock time, not by decrementing). Calls `onExpire` once at zero.
 */
export function useCountdown(totalSeconds: number, onExpire?: () => void) {
  const [remaining, setRemaining] = useState(totalSeconds);
  const onExpireRef = useRef(onExpire);

  // Keep the latest callback without re-running the timer effect.
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    const start = Date.now();
    let fired = false;
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const left = Math.max(0, totalSeconds - elapsed);
      setRemaining(left);
      if (left === 0 && !fired) {
        fired = true;
        onExpireRef.current?.();
        window.clearInterval(id);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [totalSeconds]);

  return remaining;
}
