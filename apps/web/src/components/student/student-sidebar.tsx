"use client";

import {
  NavDrawerClose,
  sidebarPanelClass,
  useNavDrawer,
  useSidebarAriaHidden,
} from "@/components/nav-drawer";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { ActionButton } from "@/components/action-button";
import { InstituteLogo } from "@/components/institute-logo";
import { useAsyncAction } from "@/hooks/use-async-action";
import { useMyInstitute } from "@/hooks/use-my-institute";
import { getUserSnapshot, logout, subscribeSession } from "@/lib/auth";

import {
  BarChartIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClipboardIcon,
  FileTextIcon,
  HelpCircleIcon,
  HomeIcon,
  LogOutIcon,
  MegaphoneIcon,
} from "./icons";
import type { ComponentType, SVGProps } from "react";

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface NavLink {
  label: string;
  href: string;
  icon: NavIcon;
  /** Exact-match only (used for the index route so it isn't always active). */
  exact?: boolean;
}

/**
 * A grouped nav item (§ Assessments — "Self Assessment" contains Practice
 * Library and My Assessments). Same shape as the admin sidebar's own
 * NavGroup; ported here because this sidebar previously had no nesting at
 * all — every prior row was flat.
 */
interface NavGroup {
  label: string;
  icon: NavIcon;
  children: NavLink[];
}

type NavEntry = NavLink | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

/**
 * Shared by the flat rows (`<a>`) and the group headers (`<button>`) so the
 * two cannot drift apart. `[font-family:inherit]` matters: `font-family` is
 * set on `body`, and a <button> takes the browser's own control font rather
 * than inheriting it unless something overrides that. Preflight normally
 * does, but only if it wins the cascade — which it does not reliably do on a
 * client-side navigation, leaving group headers in the UA font until the next
 * full reload. Same fix as admin-sidebar.tsx.
 */
const NAV_ROW_CLASS =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors [font-family:inherit]";

/**
 * An earlier product decision deliberately kept Exams and Practice Library
 * as separate top-level destinations rather than nesting Practice under
 * Exams (the original Figma). "Self Assessment" reverses that specifically
 * for Practice Library + the new My Assessments — the two things a student
 * does independently of a scheduled, proctored exam — while Exams itself
 * stays a top-level destination, unchanged.
 */
const NAV: NavEntry[] = [
  { label: "Home", href: "/student", icon: HomeIcon, exact: true },
  { label: "Exams", href: "/student/exams", icon: FileTextIcon },
  {
    label: "Self Assessment",
    icon: BookOpenIcon,
    children: [
      {
        label: "Practice Library",
        href: "/student/practice",
        icon: ClipboardIcon,
      },
      {
        label: "My Assessments",
        href: "/student/self-assessment/assessments",
        icon: CheckCircleIcon,
      },
    ],
  },
  { label: "Resources", href: "/student/resources", icon: FileTextIcon },
  {
    label: "Updates & Announcements",
    href: "/student/updates",
    icon: MegaphoneIcon,
  },
  {
    label: "Performance Reports",
    href: "/student/reports",
    icon: BarChartIcon,
  },
  { label: "Help & Support", href: "/student/help", icon: HelpCircleIcon },
];

export function StudentSidebar() {
  const pathname = usePathname();
  const { open } = useNavDrawer();
  const hidden = useSidebarAriaHidden();
  const router = useRouter();
  const { institute } = useMyInstitute();
  const user = useSyncExternalStore(
    subscribeSession,
    getUserSnapshot,
    () => null,
  );
  /** Manually toggled, per group — ORed at render time with "a child of this
   *  group is the current page" (same pattern as the admin sidebar), so
   *  landing directly on a Self Assessment child shows it already expanded. */
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleGroup = (label: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  /**
   * Signing out revokes the session server-side, so it is a round trip. Left
   * bare the button looked inert and a second click revoked a session that had
   * already gone. The redirect runs either way — a failed revoke should still
   * get the candidate off the screen.
   */
  const signOut = useAsyncAction(logout, {
    onSuccess: () => router.replace("/login"),
    onError: () => router.replace("/login"),
  });

  const displayName = user?.name ?? "Candidate";
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside
      id="app-sidebar"
      data-open={open}
      aria-hidden={hidden || undefined}
      className={`${sidebarPanelClass} flex h-screen w-[264px] shrink-0 flex-col bg-admin px-4 py-5 text-white`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-2">
        <span className="flex size-10 items-center justify-center rounded-lg bg-white/95">
          <InstituteLogo size={30} className="size-[30px] object-contain" />
        </span>
        <div className="min-w-0 flex-1 leading-none">
          <p className="truncate text-lg font-extrabold tracking-tight text-white">
            {institute?.name ?? "CODON MIND"}
          </p>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-white/70">
            STUDENT PORTAL
          </p>
        </div>
        <NavDrawerClose className="ml-auto text-white/80" />
      </div>

      {/* Nav */}
      <nav className="mt-7 flex flex-1 flex-col gap-1">
        {NAV.map((entry) => {
          if (isGroup(entry)) {
            const childActive = entry.children.some((c) =>
              pathname.startsWith(c.href),
            );
            const expanded = expandedGroups.has(entry.label) || childActive;
            const Icon = entry.icon;
            return (
              <div key={entry.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.label)}
                  aria-expanded={expanded}
                  className={`${NAV_ROW_CLASS} w-full ${
                    childActive
                      ? "text-white"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="flex-1 text-left">{entry.label}</span>
                  <ChevronDownIcon
                    className={`size-3.5 shrink-0 transition-transform ${
                      expanded ? "" : "-rotate-90"
                    }`}
                  />
                </button>
                {expanded && (
                  <div className="ml-4 flex flex-col gap-1 border-l border-white/15 py-1 pl-3">
                    {entry.children.map((child) => (
                      <StudentNavRow
                        key={child.href}
                        item={child}
                        pathname={pathname}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <StudentNavRow key={entry.href} item={entry} pathname={pathname} />
          );
        })}
      </nav>

      {/* User card + logout */}
      <div className="mt-4 rounded-2xl bg-white/10 p-3">
        <Link
          href="/student/profile"
          className="flex items-center gap-3 rounded-lg p-1 -m-1 hover:bg-white/10"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-white/95 text-sm font-bold text-admin">
            {initials || "AK"}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-bold text-white">
              {displayName}
            </span>
            <span className="block truncate text-xs text-white/70">
              {user?.email ?? "candidate@codonmind.in"}
            </span>
          </span>
        </Link>
        <ActionButton
          loading={signOut.pending}
          loadingText="Signing out…"
          onClick={() => void signOut.run()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 py-2 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-70"
        >
          <LogOutIcon className="size-4" />
          Logout
        </ActionButton>
      </div>
    </aside>
  );
}

/** One flat link row — used for both top-level items and a group's children. */
function StudentNavRow({
  item,
  pathname,
}: {
  item: NavLink;
  pathname: string;
}) {
  const active = item.exact
    ? pathname === item.href
    : pathname.startsWith(item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`${NAV_ROW_CLASS} ${
        active
          ? "bg-white text-admin shadow-sm"
          : "text-white/80 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon className="size-5 shrink-0" />
      {item.label}
    </Link>
  );
}
