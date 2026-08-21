"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { getUserSnapshot, logout, subscribeSession } from "@/lib/auth";
import { consoleSearch, type SearchHit } from "@/lib/search";

import { HelpCircleIcon, SearchIcon } from "./icons";

/**
 * Admin top bar.
 *
 * Previously this rendered four controls that did nothing — a search input with
 * no handler, a "Verified" shield, a bell whose unread badge was the literal
 * "3", and a profile button hardcoded to "Admin / OWNER" (a role this system
 * does not have). The shield and bell are gone: neither has a backing feature,
 * and a control that cannot act is worse than no control. Search, help and the
 * profile menu are now real.
 */
export function AdminTopbar({ title }: { title: string }) {
  const router = useRouter();
  const user = useSyncExternalStore(
    subscribeSession,
    getUserSnapshot,
    () => null,
  );

  const [term, setTerm] = useState("");
  /**
   * Results are stored WITH the term they belong to, so "still searching" and
   * "these hits are stale" are both derived rather than tracked as separate
   * state — which keeps the effect below free of synchronous setState.
   */
  const [results, setResults] = useState<{ term: string; hits: SearchHit[] }>({
    term: "",
    hits: [],
  });
  const [openResults, setOpenResults] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const q = term.trim();
  const active = q.length >= 2;
  const hits = results.term === q ? results.hits : [];
  const searching = active && results.term !== q;

  // Debounced: the box would query the server on every keystroke otherwise.
  useEffect(() => {
    const query = term.trim();
    if (query.length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      consoleSearch(query)
        .then((r) => {
          if (!cancelled) setResults({ term: query, hits: r.hits });
        })
        .catch(() => {
          // A failed lookup shows "no matches" rather than an error banner —
          // search is an accelerator, not a workflow that can block the admin.
          if (!cancelled) setResults({ term: query, hits: [] });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term]);

  // Close either popover on an outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (searchRef.current && !searchRef.current.contains(t)) {
        setOpenResults(false);
      }
      if (menuRef.current && !menuRef.current.contains(t)) setMenuOpen(false);
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

  return (
    <header className="flex h-20 shrink-0 items-center gap-4 border-b border-admin-line bg-admin-bg px-8">
      <h1 className="text-xl font-bold text-admin-ink">{title}</h1>

      {/* Search */}
      <div
        ref={searchRef}
        className="relative mx-2 hidden max-w-md flex-1 items-center md:flex"
      >
        <SearchIcon className="pointer-events-none absolute left-4 size-4 text-admin-subtle" />
        <input
          type="search"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpenResults(true);
          }}
          onFocus={() => setOpenResults(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpenResults(false);
            // Enter opens the first hit — the common case after typing a name.
            if (e.key === "Enter" && hits[0]) {
              setOpenResults(false);
              router.push(hits[0].href);
            }
          }}
          placeholder="Search students, exams, questions…"
          aria-label="Search students, exams and questions"
          className="h-11 w-full rounded-full border border-admin-line bg-white pl-11 pr-4 text-sm text-admin-ink outline-none placeholder:text-admin-subtle focus:border-admin"
        />

        {openResults && active && (
          <div className="absolute left-0 top-12 z-50 w-full overflow-hidden rounded-xl border border-admin-line bg-white shadow-lg">
            {searching && (
              <p className="px-4 py-3 text-sm text-admin-muted">Searching…</p>
            )}
            {!searching && hits.length === 0 && (
              <p className="px-4 py-3 text-sm text-admin-muted">
                No students, exams or questions match “{q}”.
              </p>
            )}
            {!searching &&
              hits.map((h) => (
                <button
                  key={`${h.type}-${h.id}`}
                  type="button"
                  onClick={() => {
                    setOpenResults(false);
                    router.push(h.href);
                  }}
                  className="flex w-full items-center gap-3 border-b border-admin-line/40 px-4 py-2.5 text-left last:border-b-0 hover:bg-admin-bg"
                >
                  <span className="w-16 shrink-0 rounded bg-admin-surface px-1.5 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-admin-muted">
                    {h.type}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-admin-ink">
                      {h.title}
                    </span>
                    <span className="block truncate text-xs text-admin-subtle">
                      {h.subtitle}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/*
         * The "Verified" shield and the notifications bell used to live here.
         * Neither had a handler, and the bell's unread count was a hardcoded
         * "3" shown to every admin forever. There is no notifications feature
         * in the approved scope, so both were removed rather than faked.
         */}
        <a
          href="mailto:support@drsk.in?subject=DRSK%20admin%20console%20support"
          aria-label="Contact support"
          title="Email DRSK support"
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
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void logout().finally(() =>
                    router.replace("/login?as=staff"),
                  );
                }}
                className="block w-full px-4 py-2.5 text-left text-sm text-danger hover:bg-danger/5"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
