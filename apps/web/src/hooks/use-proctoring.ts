"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

interface ProctoringOptions {
  maxViolations: number;
  /** Only monitor while true (e.g. after the candidate starts the exam). */
  enabled: boolean;
  /** Called once when the violation count reaches maxViolations. */
  onLimitReached?: () => void;
}

export interface Proctoring {
  violations: number;
  isFullscreen: boolean;
  /** Current warning to surface to the candidate (null = none). */
  warning: string | null;
  /** Acknowledge the warning and re-enter fullscreen. */
  dismissWarning: () => void;
  /** Request fullscreen (call on exam start / from a user gesture). */
  enterFullscreen: () => Promise<void>;
}

function subscribeFullscreen(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
}

/**
 * Lightweight client-side proctoring for the exam screen:
 *  - enforces fullscreen,
 *  - counts a violation when the candidate switches tabs/apps (page hidden)
 *    or leaves fullscreen,
 *  - surfaces a warning after each violation and auto-submits at the limit.
 *
 * Violations within a short window are de-duplicated (leaving fullscreen by
 * switching tabs fires both events). Real integrity checks are enforced
 * server-side (§2.16 proctoring events); this is the candidate-facing UX.
 */
export function useProctoring({
  maxViolations,
  enabled,
  onLimitReached,
}: ProctoringOptions): Proctoring {
  const [violations, setViolations] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const lastViolationAt = useRef(0);
  const limitFired = useRef(false);
  const onLimitRef = useRef(onLimitReached);

  useEffect(() => {
    onLimitRef.current = onLimitReached;
  });

  // Fullscreen state as an external store — no setState-in-effect needed.
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => Boolean(document.fullscreenElement),
    () => false,
  );

  const enterFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Browser refused (no user gesture / unsupported) — the warning still nudges.
    }
  }, []);

  const registerViolation = useCallback(
    (message: string) => {
      const now = Date.now();
      if (now - lastViolationAt.current < 1000) return; // de-dupe burst
      lastViolationAt.current = now;
      setViolations((v) => {
        const next = v + 1;
        /**
         * `maxViolations` of 0 means "record and warn, never terminate" — the
         * contract stated on the schema field, and the default for every exam.
         *
         * Without the `> 0` guard, `next >= 0` is true on the *first*
         * violation, so the default configuration auto-submitted a candidate's
         * paper the first time their browser lost focus or dropped out of full
         * screen. That is the opposite of the documented behaviour, and it
         * destroys an attempt that cannot be restarted.
         */
        const terminates = maxViolations > 0 && next >= maxViolations;
        if (terminates && !limitFired.current) {
          limitFired.current = true;
          onLimitRef.current?.();
          setWarning(
            "Final violation recorded. Your exam is being submitted automatically.",
          );
        } else if (maxViolations > 0) {
          setWarning(
            `${message} This is violation ${next} of ${maxViolations}. Further violations will auto-submit your exam.`,
          );
        } else {
          // No limit configured: say what actually happens rather than
          // threatening an auto-submit that will never come.
          setWarning(
            `${message} This is violation ${next}. It has been recorded for the invigilator.`,
          );
        }
        return next;
      });
    },
    [maxViolations],
  );

  useEffect(() => {
    if (!enabled) return;

    const onVisibility = () => {
      if (document.hidden) {
        registerViolation("You switched away from the exam window.");
      }
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement)
        registerViolation("You exited full-screen mode.");
    };

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [enabled, registerViolation]);

  const dismissWarning = useCallback(() => {
    setWarning(null);
    if (enabled && !limitFired.current) void enterFullscreen();
  }, [enabled, enterFullscreen]);

  return { violations, isFullscreen, warning, dismissWarning, enterFullscreen };
}
