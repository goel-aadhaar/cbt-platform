"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  BellIcon,
  ChevronDownIcon,
  HelpCircleIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "./icons";

/**
 * Quick-create menu. Each entry deep-links to the page that owns the real
 * flow (the drawers live there and need that page's data), rather than
 * duplicating the wizards in the top bar.
 */
const QUICK_ACTIONS: { label: string; href: string; hint: string }[] = [
  {
    label: "New exam category",
    href: "/admin/exam-categories",
    hint: "Papers are authored by teachers",
  },
  {
    label: "Add student",
    href: "/admin/students?new=1",
    hint: "Send an invite",
  },
  {
    label: "Import students",
    href: "/admin/students?import=1",
    hint: "Bulk CSV upload",
  },
  {
    label: "Invite teacher",
    href: "/admin/teachers?new=1",
    hint: "Staff invitation",
  },
];

export function AdminTopbar({ title }: { title: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  return (
    <header className="flex h-20 shrink-0 items-center gap-4 border-b border-admin-line bg-admin-bg px-8">
      <h1 className="text-xl font-bold text-admin-ink">{title}</h1>

      {/* Search */}
      <div className="relative mx-2 hidden max-w-md flex-1 items-center md:flex">
        <SearchIcon className="pointer-events-none absolute left-4 size-4 text-admin-subtle" />
        <input
          type="search"
          placeholder="Search students, exams, questions..."
          className="h-11 w-full rounded-full border border-admin-line bg-white pl-11 pr-14 text-sm text-admin-ink outline-none placeholder:text-admin-subtle focus:border-admin"
        />
        <kbd className="absolute right-3 rounded border border-admin-line bg-admin-bg px-1.5 py-0.5 text-[11px] font-semibold text-admin-subtle">
          ⌘ K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-admin-line bg-white px-4 py-2 text-sm font-semibold text-admin-ink hover:bg-white/70"
        >
          Session 2024-25
          <ChevronDownIcon className="size-4 text-admin-muted" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-full bg-admin px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
          >
            <PlusIcon className="size-4" />
            Quick Create
            <ChevronDownIcon className="size-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-admin-line/60 bg-white py-1 shadow-lg"
            >
              {QUICK_ACTIONS.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 hover:bg-admin-bg"
                >
                  <span className="block text-sm font-semibold text-admin-ink">
                    {a.label}
                  </span>
                  <span className="block text-xs text-admin-muted">
                    {a.hint}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-admin-muted">
          <IconButton label="Verified">
            <ShieldCheckIcon className="size-5" />
          </IconButton>
          <IconButton label="Notifications">
            <span className="relative">
              <BellIcon className="size-5" />
              <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-admin text-[10px] font-bold text-white">
                3
              </span>
            </span>
          </IconButton>
          <IconButton label="Help">
            <HelpCircleIcon className="size-5" />
          </IconButton>
        </div>

        <button
          type="button"
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-white"
        >
          <span className="flex size-9 items-center justify-center rounded-full border border-admin-line bg-white text-sm font-bold text-admin-ink">
            A
          </span>
          <span className="text-left leading-none">
            <span className="block text-sm font-bold text-admin-ink">
              Admin
            </span>
            <span className="block text-[11px] font-semibold tracking-wide text-admin-subtle">
              OWNER
            </span>
          </span>
          <ChevronDownIcon className="size-4 text-admin-muted" />
        </button>
      </div>
    </header>
  );
}

function IconButton({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-full hover:bg-white"
    >
      {children}
    </button>
  );
}
