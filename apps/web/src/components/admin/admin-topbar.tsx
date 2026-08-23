"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { getUserSnapshot, logout, subscribeSession } from "@/lib/auth";

import { HelpCircleIcon } from "./icons";
import { ActionButton } from "@/components/action-button";
import { useAsyncAction } from "@/hooks/use-async-action";

/**
 * Admin top bar: page title, support, profile menu.
 *
 * It used to carry four controls that did nothing — a search input with no
 * handler, a "Verified" shield, a bell whose unread badge was the literal "3",
 * and a profile button hardcoded to a role this system does not have. Those
 * were removed or wired up as they were found.
 *
 * The global search went too, at the platform owner's request. It worked, but
 * it duplicated the search each console screen already has over its own data —
 * students, questions and exams all filter in place — and a second box that
 * searches everything from the chrome is a different, vaguer promise sitting
 * above the one people actually use. `consoleSearch()` and `GET /search` are
 * untouched, so bringing it back is a matter of rendering it again.
 */
export function AdminTopbar({ title }: { title: string }) {
  const router = useRouter();
  const user = useSyncExternalStore(
    subscribeSession,
    getUserSnapshot,
    () => null,
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the profile menu on an outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const initials =
    (user?.name ?? "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?";

  /**
   * Signing out is a server round-trip that revokes the session. Left bare the
   * menu item looked inert, and a second click fired a second revoke against a
   * session that was already gone. The redirect runs either way — a failed
   * revoke should still get the user off the screen.
   */
  const signOut = useAsyncAction(logout, {
    onSuccess: () => {
      setMenuOpen(false);
      router.replace("/login?as=staff");
    },
    onError: () => {
      setMenuOpen(false);
      router.replace("/login?as=staff");
    },
  });

  return (
    <header className="flex h-20 shrink-0 items-center gap-4 border-b border-admin-line bg-admin-bg px-8">
      <h1 className="text-xl font-bold text-admin-ink">{title}</h1>

      <div className="ml-auto flex items-center gap-3">
        {/*
         * The "Verified" shield and the notifications bell used to live here.
         * Neither had a handler, and the bell's unread count was a hardcoded
         * "3" shown to every admin forever. There is no notifications feature
         * in the approved scope, so both were removed rather than faked.
         */}
        <a
          href="mailto:hello@codonmind.in?subject=Codonmind%20Nexus%20admin%20console%20support"
          aria-label="Contact support"
          title="Email Codonmind Nexus support"
          className="flex size-9 items-center justify-center rounded-full text-admin-muted hover:bg-white"
        >
          <HelpCircleIcon className="size-5" />
        </a>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-white"
          >
            <span className="flex size-9 items-center justify-center rounded-full border border-admin-line bg-white text-sm font-bold text-admin-ink">
              {initials}
            </span>
            <span className="text-left leading-none">
              <span className="block max-w-40 truncate text-sm font-bold text-admin-ink">
                {user?.name ?? "Signed out"}
              </span>
              <span className="block text-[11px] font-semibold tracking-wide text-admin-subtle">
                {user?.role ?? "—"}
              </span>
            </span>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-admin-line bg-white shadow-lg"
            >
              <div className="border-b border-admin-line/60 px-4 py-3">
                <p className="truncate text-sm font-bold text-admin-ink">
                  {user?.name ?? "—"}
                </p>
                <p className="truncate text-xs text-admin-subtle">
                  {user?.email ?? "—"}
                </p>
              </div>
              <Link
                href="/admin/profile"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 text-sm text-admin-ink hover:bg-admin-bg"
              >
                My profile
              </Link>
              <ActionButton
                role="menuitem"
                loading={signOut.pending}
                loadingText="Signing out…"
                onClick={() => void signOut.run()}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-danger hover:bg-danger/5 disabled:opacity-60"
              >
                Log out
              </ActionButton>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
