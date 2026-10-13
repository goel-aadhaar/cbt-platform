"use client";

import { useState } from "react";

import { AuthedImage } from "@/components/authed-image";
import { ImageLightbox } from "@/components/image-lightbox";

/** "A".."Z" for an option, from its key when it is a single letter. */
export function optionLetter(key: string | undefined, index: number): string {
  if (key && /^[A-Za-z]$/.test(key)) return key.toUpperCase();
  return String.fromCharCode(65 + (index % 26));
}

/** Where a student-facing option image lives: the server-resolved URL, else the key route. */
export function optionImageUrl(option: {
  mediaKey?: string | null;
  mediaUrl?: string | null;
}): string | null {
  if (option.mediaUrl) return option.mediaUrl;
  if (option.mediaKey)
    return `/media/file/${encodeURIComponent(option.mediaKey)}`;
  return null;
}

/**
 * An image with an "Enlarge" button that opens it in an in-page lightbox.
 *
 * The button stops propagation, so placing this inside something clickable
 * (an option row) does not trigger that click.
 */
export function EnlargeableImage({
  url,
  alt,
  caption,
  enlargeLabel,
  imageClassName,
  placeholderClassName,
}: {
  url: string;
  alt: string;
  caption: string;
  enlargeLabel: string;
  imageClassName: string;
  placeholderClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block max-w-full align-top">
      <AuthedImage
        url={url}
        alt={alt}
        className={imageClassName}
        placeholderClassName={placeholderClassName}
        showRetry
      />
      <button
        type="button"
        aria-label={enlargeLabel}
        title="Enlarge"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="absolute right-1.5 top-1.5 flex size-8 items-center justify-center rounded bg-black/60 text-white shadow hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-indigo"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </button>
      {open && (
        <ImageLightbox
          url={url}
          caption={caption}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
