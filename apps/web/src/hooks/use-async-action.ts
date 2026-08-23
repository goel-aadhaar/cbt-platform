"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Run one asynchronous action, and know while it is running.
 *
 * Two problems this exists to solve, both of which were being solved by hand at
 * every call site:
 *
 *  1. **Double submission.** A disabled button is a UI convention, not a
 *     guarantee — the disable only lands on the next render, and a fast double
 *     click, an Enter keypress on a focused button, or a script can slip a
 *     second call through the gap. `run` refuses to start while a previous call
 *     is still in flight, so the guarantee lives in the code rather than in the
 *     styling.
 *
 *  2. **Setting state after unmount.** A drawer that closes while its save is
 *     still running would otherwise write `pending: false` into a component
 *     that no longer exists.
 *
 * `pending` is tied to the real promise. There is no timer anywhere in here:
 * a fixed delay would report "done" while the request was still running, which
 * is worse than no feedback at all because it is confidently wrong.
 */
export interface AsyncAction<A extends unknown[], R> {
  /** Starts the action, unless it is already running. Never throws. */
  run: (...args: A) => Promise<R | undefined>;
  /** True from the moment `run` is called until the promise settles. */
  pending: boolean;
  /** The last failure, in the caller's words. Cleared when `run` restarts. */
  error: string | null;
  /** Dismiss the error without re-running — for a banner the user closed. */
  clearError: () => void;
}

export function useAsyncAction<A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
  options: {
    /** Called with the resolved value, only if still mounted. */
    onSuccess?: (result: R) => void;
    /** Called with the message, only if still mounted. */
    onError?: (message: string) => void;
    /** Used when the thrown value is not an Error. */
    fallbackMessage?: string;
  } = {},
): AsyncAction<A, R> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The in-flight guard is a ref, not the `pending` state: state updates are
   * asynchronous, so two clicks in the same tick would both read `pending` as
   * false and both proceed. A ref changes synchronously, which is what makes
   * this a real lock.
   */
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Kept in a ref so `run` stays stable across renders — otherwise every
  // consumer's effects and memos would invalidate on each keystroke.
  const actionRef = useRef(action);
  const optionsRef = useRef(options);
  useEffect(() => {
    actionRef.current = action;
    optionsRef.current = options;
  });

  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await actionRef.current(...args);
      if (mounted.current) optionsRef.current.onSuccess?.(result);
      return result;
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : (optionsRef.current.fallbackMessage ??
            "That did not complete. Try again.");
      if (mounted.current) {
        setError(message);
        optionsRef.current.onError?.(message);
      }
      return undefined;
    } finally {
      running.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { run, pending, error, clearError };
}

/**
 * The same guarantee for a list, where several rows can act independently.
 *
 * Returns which key is busy rather than a single boolean, so a table shows the
 * spinner on the row being deleted and leaves the other rows usable — the
 * whole-table freeze is what makes bulk screens feel broken.
 */
export function useKeyedAsyncAction<A extends unknown[], R>(
  action: (key: string, ...args: A) => Promise<R>,
  options: {
    onSuccess?: (key: string, result: R) => void;
    onError?: (key: string, message: string) => void;
    fallbackMessage?: string;
  } = {},
): {
  run: (key: string, ...args: A) => Promise<R | undefined>;
  /** The key currently running, or null. */
  pendingKey: string | null;
  isPending: (key: string) => boolean;
  error: string | null;
  clearError: () => void;
} {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One row at a time: these are destructive or state-changing row actions, and
  // letting three run at once makes the resulting list order unexplainable.
  const running = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const actionRef = useRef(action);
  const optionsRef = useRef(options);
  useEffect(() => {
    actionRef.current = action;
    optionsRef.current = options;
  });

  const run = useCallback(
    async (key: string, ...args: A): Promise<R | undefined> => {
      if (running.current !== null) return undefined;
      running.current = key;
      setPendingKey(key);
      setError(null);
      try {
        const result = await actionRef.current(key, ...args);
        if (mounted.current) optionsRef.current.onSuccess?.(key, result);
        return result;
      } catch (e: unknown) {
        const message =
          e instanceof Error
            ? e.message
            : (optionsRef.current.fallbackMessage ??
              "That did not complete. Try again.");
        if (mounted.current) {
          setError(message);
          optionsRef.current.onError?.(key, message);
        }
        return undefined;
      } finally {
        running.current = null;
        if (mounted.current) setPendingKey(null);
      }
    },
    [],
  );

  const isPending = useCallback(
    (key: string) => pendingKey === key,
    [pendingKey],
  );

  return {
    run,
    pendingKey,
    isPending,
    error,
    clearError: () => setError(null),
  };
}
