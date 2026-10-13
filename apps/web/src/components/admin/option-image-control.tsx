"use client";

import { useId, useRef, useState } from "react";

import { AuthedImage } from "@/components/authed-image";
import {
  IMAGE_TYPES,
  mediaFileUrl,
  uploadMedia,
  validateImageFile,
} from "@/lib/media";

import { ImageIcon } from "./icons";

/**
 * Add / replace / remove the image on one answer option.
 *
 * Renders as flex items of the option row (`contents`): the button sits beside
 * the text input, and the thumbnail panel wraps onto its own line beneath the
 * row. Replacing or removing only detaches the key from the option; the file
 * stays in the media library.
 */
export function OptionImageControl({
  optionKey,
  mediaKey,
  onChange,
}: {
  optionKey: string;
  mediaKey?: string;
  onChange: (mediaKey: string | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose() {
    inputRef.current?.click();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const item = await uploadMedia(file, undefined, "IMAGE");
      onChange(item.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload the image.");
    } finally {
      setUploading(false);
    }
  }

  const btn =
    "inline-flex items-center gap-1.5 rounded-lg border border-admin-line px-2.5 py-1.5 text-xs font-bold text-admin-muted hover:border-admin/50 hover:text-admin disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="contents">
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        hidden
        aria-label={`Image file for option ${optionKey}`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void onFile(file);
        }}
      />
      {!mediaKey && (
        <button
          type="button"
          onClick={choose}
          disabled={uploading}
          title={`Add an image to option ${optionKey}`}
          aria-label={`Add image to option ${optionKey}`}
          aria-describedby={error ? errorId : undefined}
          className={`${btn} shrink-0`}
        >
          <ImageIcon className="size-4" />
          {uploading ? "Uploading…" : "Add image"}
        </button>
      )}
      <p aria-live="polite" className="sr-only">
        {uploading ? `Uploading image for option ${optionKey}` : ""}
      </p>
      {(mediaKey || error) && (
        <div className="order-last flex w-full flex-col gap-1.5 pl-11">
          {mediaKey && (
            <div className="flex items-center gap-3">
              <AuthedImage
                url={mediaFileUrl(mediaKey)}
                alt={`Option ${optionKey} image`}
                className="h-20 max-w-40 rounded border border-admin-line bg-white object-contain"
                fallback={
                  <div className="flex h-20 w-40 items-center justify-center rounded border border-danger/40 bg-danger/5 px-2 text-center text-xs text-danger">
                    Image unavailable — remove or replace it
                  </div>
                }
              />
              <div className="flex flex-col items-start gap-1.5">
                <button
                  type="button"
                  onClick={choose}
                  disabled={uploading}
                  aria-label={`Replace image of option ${optionKey}`}
                  className={btn}
                >
                  {uploading ? "Uploading…" : "Replace"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    onChange(undefined);
                  }}
                  disabled={uploading}
                  aria-label={`Remove image of option ${optionKey}`}
                  className={`${btn} hover:border-danger/50 hover:text-danger`}
                >
                  Remove
                </button>
              </div>
            </div>
          )}
          {error && (
            <p id={errorId} role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
