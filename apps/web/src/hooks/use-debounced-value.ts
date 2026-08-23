"use client";

import { useEffect, useState } from "react";

/**
 * The settled version of a fast-changing value — a typed search term.
 *
 * Three screens already hand-rolled this (students, tenants, staff roster);
 * the admin question bank did not, and re-queried the server on every
 * keystroke. Typing "kinematics" fired ten requests, nine of them already
 * obsolete before they returned.
 *
 * The delay is 250ms by default: long enough to swallow a burst of typing,
 * short enough that it never feels like lag.
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);
    // Each keystroke cancels the previous timer, so only the last one fires.
    return () => clearTimeout(id);
  }, [value, delay]);

  return settled;
}
