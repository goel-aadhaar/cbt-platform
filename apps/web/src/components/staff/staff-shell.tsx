"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ComponentType, SVGProps } from "react";

import {
  BellIcon,
  ChevronDownIcon,
  HelpCircleIcon,
  LogOutIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "@/components/admin/icons";
import { useAuthUser } from "@/hooks/use-auth";
import { logout, type Role } from "@/lib/auth";

export interface StaffNavItem {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface StaffQuickAction {
  label: string;
  href: string;
  hint: string;
}

/**
 * Shared chrome for every staff console — admin, teacher and superadmin.
 *
 * One component rather than three copies, because the three consoles have to
 * stay visually identical and a copy only stays in step until someone edits it.
 * Everything role-specific arrives as props: the nav, the workspace label and
 * the quick-create menu.
 */
export function StaffShell({
  title,
  nav,
  workspace,
  quickActions = [],
  searchPlaceholder = "Search…",
  profileHref,
  children,
}: {
  title: string;
  nav: StaffNavItem[];
  /** Sub-heading under the user's name, e.g. "Institute workspace". */
  workspace: string;
  quickActions?: StaffQuickAction[];
  searchPlaceholder?: string;
  /** Where this console's profile lives. */
  profileHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-admin-bg text-admin-ink [font-family:var(--font-hanken)]">
      <StaffSidebar nav={nav} workspace={workspace} profileHref={profileHref} />
      <div className="flex min-w-0 flex-1 flex-col">
        <StaffTopbar
          title={title}
          quickActions={quickActions}
          searchPlaceholder={searchPlaceholder}
          profileHref={profileHref}
        />
        <main className="flex-1 overflow-auto px-8 py-6">{children}</main>
      </div>
    </div>
  );
}

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
          src="/brand/drsk-logo.png"
          alt="DR. SK'S Biology"
          width={40}
          height={40}
          className="size-10 object-contain"
        />
        <div className="leading-none">
          <p className="text-lg font-extrabold tracking-tight text-admin-ink">
            DR. SK&apos;S
          </p>
          <p className="text-[11px] font-semibold tracking-[0.2em] text-admin-muted">
            BIOLOGY
          </p>
        </div>
      </div>

      {/* Who is signed in. Real identity, not a placeholder — on a console that
          spans tenants and roles, "which account am I?" is a safety question.
          Clicking it opens the profile, which is where that question is
          answered in full. */}
      <Link
        href={profileHref}
        className="mt-5 flex items-center gap-3 rounded-xl border border-admin-line bg-white px-3 py-2.5 text-left hover:bg-admin-bg"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-admin text-sm font-bold text-white">
          {initials(user?.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-admin-ink">
            {user?.name ?? "…"}
          </span>
          <span className="block truncate text-xs text-admin-muted">
            {workspace}
          </span>
        </span>
      </Link>

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
  quickActions,
  searchPlaceholder,
  profileHref,
}: {
  title: string;
  quickActions: StaffQuickAction[];
  searchPlaceholder: string;
  profileHref: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const user = useAuthUser();

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

      <div className="relative mx-2 hidden max-w-md flex-1 items-center md:flex">
        <SearchIcon className="pointer-events-none absolute left-4 size-4 text-admin-subtle" />
        <input
          type="search"
          placeholder={searchPlaceholder}
          className="h-11 w-full rounded-full border border-admin-line bg-white pl-11 pr-4 text-sm text-admin-ink outline-none placeholder:text-admin-subtle focus:border-admin"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        {quickActions.length > 0 && (
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
                {quickActions.map((a) => (
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
        )}

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
