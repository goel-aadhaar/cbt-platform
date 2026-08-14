"use client";

import { CSSProperties } from "react";

/**
 * The platform's loading spinner.
 *
 * Eight dots in a ring, each `admin` shade stepping paler by quadrant. The
 * whole ring rotates with a CSS animation — no JS, no timers, the rotation
 * keeps going on tab switches and resumes at the right frame afterwards.
 *
 * The four "frames" the Figma design shows are simply 45° rotations of the
 * same ring; this single animated SVG covers all of them and everything in
 * between. Reproducing the design as a static SVG honouring the brand
 * palette, rather than the four sample bitmaps the Figma export produced.
 *
 * Honors `prefers-reduced-motion`: the ring stops spinning and the dots
 * pulse instead, so a vestibular-sensitive user still sees clear motion.
 *
 * Sizes: `size` is the SVG box in pixels; the visible dot ring is twice
 * that, so picking a size is the same as picking the diameter.
 */
export function LoadingSpinner({ size = 32 }: { size?: number }) {
  const style = {
    "--spinner-size": `${size}px`,
  } as CSSProperties;

  return (
    <div
      className="loading-spinner"
      role="status"
      aria-label="Loading"
      style={style}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <circle cx="50" cy="14" r="9" className="dot d1" />
        <circle cx="86" cy="50" r="9" className="dot d2" />
        <circle cx="50" cy="86" r="9" className="dot d3" />
        <circle cx="14" cy="50" r="9" className="dot d4" />
        <circle
          cx="69.5"
          cy="20.5"
          r="9"
          className="dot d1"
          transform="rotate(45 69.5 20.5)"
        />
        <circle
          cx="79.5"
          cy="69.5"
          r="9"
          className="dot d2"
          transform="rotate(45 79.5 69.5)"
        />
        <circle
          cx="30.5"
          cy="79.5"
          r="9"
          className="dot d3"
          transform="rotate(45 30.5 79.5)"
        />
        <circle
          cx="20.5"
          cy="30.5"
          r="9"
          className="dot d4"
          transform="rotate(45 20.5 30.5)"
        />
      </svg>
    </div>
  );
}
