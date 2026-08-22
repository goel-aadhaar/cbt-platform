"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ComponentType, SVGProps } from "react";

import {
  BellIcon,
  HelpCircleIcon,
  LogOutIcon,
  ShieldCheckIcon,
} from "@/components/admin/icons";
import { useAuthUser } from "@/hooks/use-auth";
import { logout, type Role } from "@/lib/auth";

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
  children,
}: {
  title: string;
  nav: StaffNavItem[];
  /** Sub-heading under the user's name, e.g. "Institute workspace". */
  workspace: string;
  /** Where this console's profile lives. */
  profileHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-admin-bg text-admin-ink [font-family:var(--font-hanken)]">
      <StaffSidebar nav={nav} workspace={workspace} profileHref={profileHref} />
      <div className="flex min-w-0 flex-1 flex-col">
        <StaffTopbar title={title} profileHref={profileHref} />
        <main className="flex-1 overflow-auto px-8 py-6">{children}</main>
      </div>
    </div>
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

  async function handleLogout() {
    await logout();
    router.replace("/login?as=staff");
  }

  return (
    <aside className="flex h-screen w-[280px] shrink-0 flex-col border-r border-admin-line bg-white px-4 py-5">
      <div className="flex items-center gap-3 px-2">
        <Image
          src="/brand/codonmind-mark.png"
          alt=""
          width={40}
          height={40}
          className="size-10 object-contain"
        />
        <div className="leading-none">
          <p className="text-lg font-extrabold tracking-tight text-admin-ink">
            CODON MIND
          </p>
          <p className="text-[11px] font-semibold tracking-[0.2em] text-admin-muted">
            NEXUS
          </p>
        </div>
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

      <button
        type="button"
        onClick={handleLogout}
        className="mt-auto flex items-center gap-3 px-3 py-2 text-sm font-semibold text-admin-muted hover:text-admin-ink"
      >
        <LogOutIcon className="size-5" />
        Logout
      </button>
    </aside>
  );
}

function StaffTopbar({
  title,
  profileHref,
}: {
  title: string;
  profileHref: string;
}) {
  const user = useAuthUser();

  return (
    <header className="flex h-20 shrink-0 items-center gap-4 border-b border-admin-line bg-admin-bg px-8">
      <h1 className="text-xl font-bold text-admin-ink">{title}</h1>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-1 text-admin-muted">
          <IconButton label={roleLabel(user?.role)}>
            <ShieldCheckIcon className="size-5" />
          </IconButton>
          <IconButton label="Notifications">
            <BellIcon className="size-5" />
          </IconButton>
          <IconButton label="Help">
            <HelpCircleIcon className="size-5" />
          </IconButton>
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

function IconButton({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex size-10 items-center justify-center rounded-full hover:bg-white"
    >
      {children}
    </button>
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

function roleLabel(role?: Role | null): string {
  if (role === "SUPERADMIN") return "Signed in as Super Admin";
  if (role === "TEACHER") return "Signed in as Teacher";
  if (role === "ADMIN") return "Signed in as Administrator";
  return "Signed in";
}
