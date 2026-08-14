"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { switchRole, type Role } from "@/lib/auth";

const ROLE_LABEL: Record<Role, string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  ADMIN: "Administrator",
  SUPERADMIN: "Super Admin",
};

/**
 * In-console role switcher.
 *
 * Appears for every account that holds more than one role. The active role is
 * always the currently-acting one; the others are real, validated options the
 * user can pick right now without re-authenticating.
 *
 * Picking one calls POST /auth/session/switch (the server validates the pick
 * against the account's own roles and the approval workflow refuses
 * self-approval regardless of which role was reached). The page reloads so the
 * nav re-renders for the new role rather than showing stale controls.
 */
export function RoleSwitcher({
  activeRole,
  roles,
}: {
  activeRole: Role;
  roles: Role[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popover = useRef<HTMLDivElement>(null);

  // Click outside to close. Stopping default on the trigger so the click
  // doesn't also navigate the parent.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popover.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = useCallback(
    async (role: Role) => {
      setBusy(true);
      setError(null);
      try {
        await switchRole(role);
        // Refresh rather than replace — the role guard in each shell sees the
        // new role in storage and bounces to the correct home if the user has
        // wandered out of their new role's console. Doing it ourselves risks
        // a race where the new console renders against the old JWT.
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not switch role");
      } finally {
        setBusy(false);
        setOpen(false);
      }
    },
    [router],
  );

  // Single-role accounts: the badge is just informational, no switcher.
  if (roles.length <= 1) {
    return (
      <span className="rounded-full bg-admin-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-admin-muted">
        {ROLE_LABEL[activeRole]}
      </span>
    );
  }

  return (
    <div className="relative" ref={popover}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-full bg-admin-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-admin-muted hover:bg-admin-line/40"
      >
        {ROLE_LABEL[activeRole]}
        <span className="text-admin-muted/70">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-admin-line/60 bg-white py-1 shadow-lg"
        >
          {roles.map((role) => (
            <button
              key={role}
              type="button"
              role="menuitem"
              disabled={busy || role === activeRole}
              onClick={() => void choose(role)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-admin-bg disabled:opacity-50"
            >
              <span className="font-semibold text-admin-ink">
                {ROLE_LABEL[role]}
              </span>
              {role === activeRole && (
                <span className="text-xs font-bold text-admin">·</span>
              )}
            </button>
          ))}
          {error && (
            <p className="border-t border-admin-line/60 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
