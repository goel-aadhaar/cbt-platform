"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AuthedImage } from "@/components/authed-image";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;

/**
 * In-page image viewer.
 *
 * Deliberately a plain DOM overlay: no Fullscreen API, no new tab/window.
 * The exam's proctoring counts a hidden document or a fullscreen exit as a
 * violation, and neither can happen from an element inside the page.
 *
 * Zoom uses the CSS `zoom` property rather than a transform so the scaled
 * image takes real layout space and the overflow container scrolls to every
 * edge (a transform only extends scrolling to the right/bottom).
 */
export function ImageLightbox({
  url,
  caption,
  onClose,
}: {
  url: string;
  caption: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled])",
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!dialogRef.current?.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  const ctrl =
    "flex h-9 min-w-9 items-center justify-center rounded bg-white/15 px-3 text-sm font-semibold text-white hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40 disabled:hover:bg-white/15";

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={caption}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/80 p-3"
      onClick={(e) => {
        // React events bubble through the portal to the opener's ancestors
        // (e.g. an option row that selects on click).
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="mb-3 flex max-w-[92vw] flex-wrap items-center justify-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="px-1 text-sm font-semibold text-white">{caption}</span>
        <button
          type="button"
          className={ctrl}
          disabled={zoom <= MIN_ZOOM}
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
          aria-label="Zoom out"
        >
          Zoom out
        </button>
        <button
          type="button"
          className={ctrl}
          disabled={zoom >= MAX_ZOOM}
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
          aria-label="Zoom in"
        >
          Zoom in
        </button>
        <button
          type="button"
          className={ctrl}
          disabled={zoom === MIN_ZOOM}
          onClick={() => setZoom(MIN_ZOOM)}
          aria-label="Fit to screen"
        >
          Fit
        </button>
        <button
          ref={closeRef}
          type="button"
          className={ctrl}
          onClick={onClose}
          aria-label="Close image viewer"
        >
          Close
        </button>
      </div>

      <div
        className="flex max-h-[84vh] max-w-[92vw] overflow-auto rounded bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="m-auto" style={{ zoom }}>
          <AuthedImage
            url={url}
            alt={caption}
            className="block max-h-[84vh] max-w-[92vw] object-contain"
            placeholderClassName="h-64 w-[min(80vw,24rem)]"
            showRetry
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
