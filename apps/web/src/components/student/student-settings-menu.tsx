"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SettingsIcon } from "./icons";

/**
 * The settings control in the student top bar.
 *
 * It was a button with no handler — it looked like a control, and clicking it
 * did nothing at all. It now opens the two screens a candidate actually needs
 * from here: their own profile, which the sidebar never links to at all, and
 * help.
 *
 * Dismissal follows the staff top bar's menu: a mousedown anywhere outside
 * closes it. Escape closes it too and returns focus to the button, which the
 * staff menu does not do and should — a keyboard user who opens this has no
 * other way back out.
 */
const ITEMS = [
  { label: "Profile", href: "/student/profile" },
  { label: "Help & Support", href: "/student/help" },
];

export function StudentSettingsMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex size-9 items-center justify-center rounded-full hover:bg-admin-bg hover:text-admin-ink ${
          open ? "bg-admin-bg text-admin-ink" : "text-admin-muted"
        }`}
      >
        <SettingsIcon className="size-5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-48 overflow-hidden rounded-xl border border-admin-line bg-white shadow-lg"
        >
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-admin-ink hover:bg-admin-bg"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
