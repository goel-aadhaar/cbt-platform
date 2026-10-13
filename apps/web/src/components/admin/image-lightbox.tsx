"use client";

import { useEffect, useRef, useState } from "react";

import { AuthedImage } from "@/components/authed-image";
import { mediaFileUrl } from "@/lib/media";

import { XIcon } from "./icons";

function Lightbox({
  mediaKey,
  alt,
  onClose,
}: {
  mediaKey: string;
  alt: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <button
        ref={closeRef}
        type="button"
        aria-label="Close image"
        onClick={onClose}
        className="absolute right-5 top-5 rounded-full bg-white p-2 text-admin-ink shadow hover:bg-admin-surface"
      >
        <XIcon className="size-5" />
      </button>
      <div
        className="max-h-full max-w-full rounded-lg bg-white p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <AuthedImage
          url={mediaFileUrl(mediaKey)}
          alt={alt}
          className="max-h-[85vh] max-w-[90vw] object-contain"
          fallback={
            <p className="px-8 py-6 text-sm text-admin-muted">
              Image unavailable
            </p>
          }
        />
      </div>
    </div>
  );
}

/**
 * A staff-side image that opens full size in a lightbox when clicked. Used for
 * option images in every read-only question view and in the authoring preview.
 */
export function ZoomableImage({
  mediaKey,
  alt,
  className = "max-h-40",
}: {
  mediaKey: string;
  alt: string;
  /** Height cap and any extra sizing for the thumbnail. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Click to enlarge"
        aria-label={`Enlarge: ${alt}`}
        className="block max-w-full cursor-zoom-in rounded border border-admin-line bg-white p-1 hover:border-admin/50"
      >
        <AuthedImage
          url={mediaFileUrl(mediaKey)}
          alt={alt}
          className={`${className} max-w-full object-contain`}
          fallback={
            <span className="block px-3 py-2 text-xs text-admin-muted">
              Image unavailable
            </span>
          }
        />
      </button>
      {open && (
        <Lightbox
          mediaKey={mediaKey}
          alt={alt}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
