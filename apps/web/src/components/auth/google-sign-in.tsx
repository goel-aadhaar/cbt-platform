"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/** Minimal shape of the Google Identity Services global we rely on. */
interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: Record<string, unknown>,
      ) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

/**
 * Google sign-in for staff.
 *
 * Renders Google's own button, which is a requirement of their terms and also
 * the only way to get a credential the backend can verify. The credential is
 * handed straight to /auth/google — the browser never decides who the user is
 * or what they may do; it only carries a signed assertion the server checks.
 *
 * Renders nothing when NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset, so a deployment
 * without Google configured simply shows password sign-in.
 */
export function GoogleSignIn({
  onCredential,
  disabled = false,
}: {
  onCredential: (credential: string) => void;
  disabled?: boolean;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Kept in a ref so re-renders never re-initialise the Google client. Written
  // in an effect rather than during render, which React forbids.
  const handler = useRef(onCredential);
  useEffect(() => {
    handler.current = onCredential;
  }, [onCredential]);

  const render = useCallback(() => {
    const gis = window.google;
    if (!gis || !holder.current || !CLIENT_ID) return;
    gis.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: (response) => {
        if (response.credential) handler.current(response.credential);
      },
      // No One Tap auto-select: on a shared exam machine, silently resuming
      // the last person's Google session is the wrong default.
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    gis.accounts.id.renderButton(holder.current, {
      theme: "outline",
      size: "large",
      width: 360,
      text: "signin_with",
      shape: "rectangular",
    });
    setReady(true);
  }, []);

  useEffect(() => {
    // The script may already be cached from a previous mount.
    if (window.google) render();
  }, [render]);

  if (!CLIENT_ID) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs font-semibold uppercase tracking-wide text-subtle">
          or
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={render}
        onError={() => setFailed(true)}
      />

      <div
        // Google's button is an iframe it owns; disabling is done by covering
        // it, since we cannot reach inside to set a disabled attribute.
        className={disabled ? "pointer-events-none opacity-50" : undefined}
      >
        <div ref={holder} className="flex justify-center [&>div]:!w-full" />
        {!ready && !failed && (
          <div className="h-11 animate-pulse rounded border border-line bg-surface" />
        )}
        {failed && (
          <p className="rounded border border-line bg-surface px-3 py-2 text-center text-xs text-muted">
            Google sign-in could not load. Use your email and password below.
          </p>
        )}
      </div>
    </div>
  );
}
