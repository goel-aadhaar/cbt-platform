"use client";

import { useEffect, useRef, useState } from "react";

import { MoreVerticalIcon } from "./icons";

export interface RowAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * Per-row "⋮" menu for admin tables (Students, Teachers, ...). Mirrors the
 * click-outside-to-close pattern already used by AdminTopbar's Quick Create
 * menu — there was no shared component for it, so every table's Actions
 * column rendered a dead button instead.
 */
export function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Row actions"
        className="rounded-md p-1 text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
      >
        <MoreVerticalIcon className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-admin-line/60 bg-white py-1 shadow-lg"
        >
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
              className={`block w-full px-4 py-2 text-left text-sm font-medium hover:bg-admin-bg disabled:cursor-not-allowed disabled:opacity-40 ${
                a.danger ? "text-danger" : "text-admin-ink"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
