"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useAuthUser } from "@/hooks/use-auth";
import { logout } from "@/lib/auth";
import { InstituteLogo } from "@/components/institute-logo";
import { RoleSwitcher } from "@/components/staff/role-switcher";
import {
  NavDrawerClose,
  sidebarPanelClass,
  useNavDrawer,
  useSidebarAriaHidden,
} from "@/components/nav-drawer";

import {
  ActivityIcon,
  BarChartIcon,
  BellIcon,
  ChevronDownIcon,
  ClipboardIcon,
  DatabaseIcon,
  FileTextIcon,
  GraduationCapIcon,
  GridIcon,
  LayersIcon,
  LogOutIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "./icons";
import type { ComponentType, SVGProps } from "react";

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface NavLink {
  label: string;
  href: string;
  icon: NavIcon;
}

/**
 * A grouped nav item — "Organization" used to be three flat, unrelated-
 * looking rows (Organization, Teachers, Administrators) even though they're
 * all "who and how this institute is set up". Grouped under one parent that
 * expands, matching how a person would actually describe the console:
 * "it's under Organization".
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

const NAV: NavEntry[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: GridIcon },
  {
    label: "Organization",
    icon: LayersIcon,
    children: [
      // Was its own top-level "Organization" item — the enrollment
      // hierarchy (programs/classes/batches) plus institute identity.
      { label: "Enrollments", href: "/admin/organization", icon: LayersIcon },
      { label: "Students", href: "/admin/students", icon: UsersIcon },
      {
        label: "Administrators",
        href: "/admin/administrators",
        icon: ShieldCheckIcon,
      },
      {
        label: "Teachers",
        href: "/admin/teachers",
        icon: GraduationCapIcon,
      },
    ],
  },
  { label: "Exams", href: "/admin/exams", icon: ClipboardIcon },
  { label: "Question Bank", href: "/admin/questions", icon: DatabaseIcon },
  {
    label: "Results & Reports",
    icon: BarChartIcon,
    children: [
      { label: "Results", href: "/admin/results", icon: BarChartIcon },
      { label: "Reports", href: "/admin/reports", icon: FileTextIcon },
    ],
  },
  { label: "Live Monitoring", href: "/admin/monitoring", icon: ActivityIcon },
  { label: "Announcements", href: "/admin/announcements", icon: BellIcon },
  // The trail was reachable by the API but by no page in this console, so an
  // institute's own administrator could not review their staff's actions.
  { label: "Audit Log", href: "/admin/audit", icon: ShieldCheckIcon },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthUser();
  const { open } = useNavDrawer();
  const hidden = useSidebarAriaHidden();
  /**
   * Manually toggled open state, per group (keyed by label) — ORed at
   * render time with "a child of this group is the current page", so
   * landing directly on /admin/teachers shows Organization already
   * expanded, with no click required to see why that row is highlighted.
   * Independent Sets, not one shared boolean: with two groups now
   * (Organization, Results & Reports), toggling one must never open or
   * close the other.
   */
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

  async function handleLogout() {
    await logout();
    router.replace("/login?as=staff");
  }

  return (
    <aside
      id="app-sidebar"
      data-open={open}
      aria-hidden={hidden || undefined}
      className={`${sidebarPanelClass} flex h-screen w-[280px] shrink-0 flex-col border-r border-admin-line bg-white px-4 py-5`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-2">
        <InstituteLogo size={40} className="size-10 object-contain" />
        <div className="leading-none">
          <p className="text-lg font-extrabold tracking-tight text-admin-ink">
            CODON MIND
          </p>
          <p className="text-[11px] font-semibold tracking-[0.2em] text-admin-muted">
            ADMIN CONSOLE
          </p>
        </div>
        <NavDrawerClose className="ml-auto text-admin-muted" />
      </div>

      {/* Workspace switcher */}
      {/* Was a dead button captioned "Dr. John Doe" regardless of who was
          signed in. Now it names the real user and opens their profile. */}
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-admin-line bg-white px-3 py-2.5 hover:bg-admin-bg">
        <Link
          href="/admin/profile"
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-admin text-sm font-bold text-white">
            {(user?.name ?? "")
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase() ?? "")
              .join("") || "—"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-admin-ink">
              {user?.name ?? "…"}
            </span>
            <span className="block text-xs text-admin-muted">
              Institute workspace
            </span>
          </span>
        </Link>
        {user?.role && (
          <RoleSwitcher activeRole={user.role} roles={user.roles} />
        )}
      </div>

      {/* Nav */}
      <nav className="mt-4 flex flex-col gap-1">
        {NAV.map((entry) => {
          if (isGroup(entry)) {
            const childActive = entry.children.some((c) => c.href === pathname);
            const expanded = expandedGroups.has(entry.label) || childActive;
            const Icon = entry.icon;
            return (
              <div key={entry.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.label)}
                  aria-expanded={expanded}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                    childActive
                      ? "text-admin"
                      : "text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
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
                  <div className="ml-4 flex flex-col gap-1 border-l border-admin-line py-1 pl-3">
                    {entry.children.map((child) => (
                      <NavRow
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
          return <NavRow key={entry.href} item={entry} pathname={pathname} />;
        })}
      </nav>

      {/* Need help */}
      <div className="mt-auto rounded-xl border border-admin-line bg-admin/[0.06] p-4">
        <p className="text-sm font-bold text-admin-ink">Need help?</p>
        <p className="mt-1 text-xs text-admin-muted">
          There&apos;s no admin docs site yet — this opens an email to support.
        </p>
        <a
          href="mailto:hello@codonmind.in"
          className="mt-3 block w-full rounded-lg border border-admin-line bg-white py-2 text-center text-xs font-semibold text-admin-ink hover:bg-admin-bg"
        >
          Email support
        </a>
      </div>

      {/* Logout */}
      <button
        type="button"
        onClick={handleLogout}
        className="mt-4 flex items-center gap-3 px-3 py-2 text-sm font-semibold text-admin-muted hover:text-admin-ink"
      >
        <LogOutIcon className="size-5" />
        Logout
      </button>
    </aside>
  );
}

/** One flat link row — used for both top-level items and a group's children. */
function NavRow({ item, pathname }: { item: NavLink; pathname: string }) {
  const active = pathname === item.href;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
        active
          ? "bg-admin/10 text-admin"
          : "text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
      }`}
    >
      <Icon className="size-5 shrink-0" />
      {item.label}
    </Link>
  );
}
