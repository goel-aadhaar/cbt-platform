"use client";

import {
  NavDrawerClose,
  sidebarPanelClass,
  useNavDrawer,
  useSidebarAriaHidden,
} from "@/components/nav-drawer";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

import { ActionButton } from "@/components/action-button";
import { InstituteLogo } from "@/components/institute-logo";
import { useAsyncAction } from "@/hooks/use-async-action";
import { useMyInstitute } from "@/hooks/use-my-institute";
import { getUserSnapshot, logout, subscribeSession } from "@/lib/auth";

import {
  BarChartIcon,
  CheckCircleIcon,
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
 * Shared by every row so none of them can drift from another in size/weight —
 * see admin-sidebar.tsx, which had the same pair of hand-maintained copies at
 * one point. Rows rendering in a different size and weight was an unlayered
 * `button { font: inherit }` in home.css beating Tailwind's utilities, not
 * anything in this file.
 */
const NAV_ROW_CLASS =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors";

/**
 * Exactly three exam/practice destinations, flat (§ Product Structure):
 *
 *  CBT           — Computer Based Test, the strict examination environment.
 *                  Was "Exams"/"Mock Test"; the route and exam kind
 *                  (MOCK_TEST) are unchanged, only the label is new.
 *  DPP           — Daily Practice Paper, replacing "Practice Library". Was
 *                  an ad-hoc "pick a subject and pull questions" pool; is now
 *                  named, teacher-curated papers.
 *  Practice Test — teacher-managed flexible practice, was "My Assessments"
 *                  nested under a "Self Assessment" group. The nesting is
 *                  gone along with the old ad-hoc practice pool it was
 *                  paired with — a flat top-level entry is what the product
 *                  spec explicitly calls for ("no confusing naming, no
 *                  duplicate categories").
 */
const NAV: NavLink[] = [
  { label: "Home", href: "/student", icon: HomeIcon, exact: true },
  { label: "CBT", href: "/student/exams", icon: FileTextIcon },
  { label: "DPP", href: "/student/dpp", icon: ClipboardIcon },
  {
    label: "Practice Test",
    href: "/student/practice-test",
    icon: CheckCircleIcon,
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
        {NAV.map((entry) => (
          <StudentNavRow key={entry.href} item={entry} pathname={pathname} />
        ))}
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

/** One flat nav row. */
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
