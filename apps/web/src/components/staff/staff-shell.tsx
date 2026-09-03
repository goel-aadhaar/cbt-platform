"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ComponentType, SVGProps } from "react";

import { HelpCircleIcon, LogOutIcon } from "@/components/admin/icons";
import { StaffNotificationBell } from "@/components/staff/staff-notification-bell";
import { useAuthUser } from "@/hooks/use-auth";
import { ActionButton } from "@/components/action-button";
import { InstituteLogo } from "@/components/institute-logo";
import { useAsyncAction } from "@/hooks/use-async-action";
import { useMyInstitute } from "@/hooks/use-my-institute";
import { logout } from "@/lib/auth";
import {
  NavDrawerBackdrop,
  NavDrawerClose,
  NavDrawerProvider,
  NavDrawerToggle,
  sidebarPanelClass,
  useNavDrawer,
  useSidebarAriaHidden,
} from "@/components/nav-drawer";

export interface StaffNavItem {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/**
 * Shared chrome for every staff console — admin, teacher and superadmin.
 *
 * One component rather than three copies, because the three consoles have to
 * stay visually identical and a copy only stays in step until someone edits it.
 * Everything role-specific arrives as props: the nav and the workspace label.
 */
export function StaffShell({
  title,
  nav,
  workspace,
  profileHref,
  helpHref,
  inboxHref,
  children,
}: {
  title: string;
  nav: StaffNavItem[];
  /** Sub-heading under the user's name, e.g. "Institute workspace". */
  workspace: string;
  /** Where this console's profile lives. */
  profileHref: string;
  /**
   * Where this console's Help & Support lives. A route for a console that
   * has a help page, or a mailto: for one that does not — it is rendered as a
   * plain anchor so both work without a special case.
   */
  helpHref: string;
  /**
   * This console's announcements feed, if it HAS one. Omitted for admins, who
   * author notices rather than receive them — a bell that can never light up
   * is worse than no bell.
   */
  inboxHref?: string;
  children: React.ReactNode;
}) {
  return (
    <NavDrawerProvider>
      <div className="flex h-screen overflow-hidden bg-admin-bg text-admin-ink [font-family:var(--font-hanken)]">
        <NavDrawerBackdrop />
        <StaffSidebar
          nav={nav}
          workspace={workspace}
          profileHref={profileHref}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <StaffTopbar
            title={title}
            profileHref={profileHref}
            helpHref={helpHref}
            inboxHref={inboxHref}
          />
          <main className="flex-1 overflow-auto px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
            {children}
          </main>
        </div>
      </div>
    </NavDrawerProvider>
  );
}

import { RoleSwitcher } from "./role-switcher";

function StaffSidebar({
  nav,
  workspace,
  profileHref,
}: {
  nav: StaffNavItem[];
  workspace: string;
  profileHref: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthUser();
  const { institute } = useMyInstitute();
  const { open } = useNavDrawer();
  const hidden = useSidebarAriaHidden();

  /** Same round trip as the other shells; see student-sidebar for the why. */
  const signOut = useAsyncAction(logout, {
    onSuccess: () => router.replace("/login?as=staff"),
    onError: () => router.replace("/login?as=staff"),
  });

  return (
    <aside
      id="app-sidebar"
      data-open={open}
      aria-hidden={hidden || undefined}
      className={`${sidebarPanelClass} flex h-screen w-[280px] shrink-0 flex-col border-r border-admin-line bg-white px-4 py-5`}
    >
      <div className="flex items-center gap-3 px-2">
        <InstituteLogo size={40} className="size-10 object-contain" />
        <div className="min-w-0 flex-1 leading-none">
          <p className="truncate text-lg font-extrabold tracking-tight text-admin-ink">
            {institute?.name ?? "CODON MIND"}
          </p>
          <p className="text-[11px] font-semibold tracking-[0.2em] text-admin-muted">
            NEXUS
          </p>
        </div>
        <NavDrawerClose className="ml-auto text-admin-muted" />
      </div>

      {/* Who is signed in. Real identity, not a placeholder — on a console that
          spans tenants and roles, "which account am I?" is a safety question.
          Clicking it opens the profile, which is where that question is
          answered in full. */}
      {/* The identity card is two clickable regions, not one. The avatar
          block is a link to the profile; the role chip is a real button that
          opens its own menu. Wrapping them together makes clicking the chip
          navigate to the profile first, defeating the switcher. */}
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-admin-line bg-white px-3 py-2.5 hover:bg-admin-bg">
        <Link
          href={profileHref}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-admin text-sm font-bold text-white">
            {initials(user?.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-admin-ink">
              {user?.name ?? "…"}
            </span>
            <span className="block truncate text-xs text-admin-muted">
              {workspace}
            </span>
          </span>
        </Link>
        {user?.role && (
          <RoleSwitcher activeRole={user.role} roles={user.roles} />
        )}
      </div>

      <nav className="mt-4 flex flex-col gap-1 overflow-y-auto">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-admin/10 text-admin"
                  : "text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
              }`}
            >
              <Icon className="size-5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <ActionButton
        loading={signOut.pending}
        loadingText="Signing out…"
        onClick={() => void signOut.run()}
        className="mt-auto flex items-center gap-3 px-3 py-2 text-sm font-semibold text-admin-muted hover:text-admin-ink disabled:opacity-60"
      >
        <LogOutIcon className="size-5" />
        Logout
      </ActionButton>
    </aside>
  );
}

function StaffTopbar({
  title,
  profileHref,
  helpHref,
  inboxHref,
}: {
  title: string;
  profileHref: string;
  helpHref: string;
  inboxHref?: string;
}) {
  const user = useAuthUser();

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-admin-line bg-admin-bg px-4 sm:gap-4 sm:px-6 lg:h-20 lg:px-8">
      <NavDrawerToggle className="text-admin-muted" />
      <h1 className="min-w-0 truncate text-base font-bold text-admin-ink sm:text-lg lg:text-xl">
        {title}
      </h1>

      <div className="ml-auto flex items-center gap-1 sm:gap-3">
        {/* Secondary to identity: these fold away on a phone rather than
            crowding out the profile control.

            There used to be a third control here showing the role, which did
            nothing when clicked. It is gone rather than wired up: the sidebar
            already carries a working role switcher for dual-role accounts, and
            the role is stated in full on the profile screen. */}
        <div className="hidden items-center gap-1 text-admin-muted sm:flex">
          {inboxHref && <StaffNotificationBell href={inboxHref} />}
          <a
            href={helpHref}
            aria-label="Help & Support"
            title="Help & Support"
            className="flex size-10 items-center justify-center rounded-full hover:bg-white"
          >
            <HelpCircleIcon className="size-5" />
          </a>
        </div>

        <Link
          href={profileHref}
          title="Your profile"
          className="flex size-9 items-center justify-center rounded-full border border-admin-line bg-white text-sm font-bold text-admin-ink hover:bg-admin-bg"
        >
          {initials(user?.name)}
        </Link>
      </div>
    </header>
  );
}

function initials(name?: string | null): string {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
