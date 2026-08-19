"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuthUser } from "@/hooks/use-auth";
import { logout } from "@/lib/auth";
import { RoleSwitcher } from "@/components/staff/role-switcher";

import {
  ActivityIcon,
  BarChartIcon,
  BellIcon,
  ClipboardIcon,
  DatabaseIcon,
  FileTextIcon,
  GraduationCapIcon,
  GridIcon,
  LayersIcon,
  LogOutIcon,
  TemplateIcon,
  UploadIcon,
  UserIcon,
  UsersIcon,
} from "./icons";
import type { ComponentType, SVGProps } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: GridIcon },
  {
    label: "Organization",
    href: "/admin/organization",
    icon: LayersIcon,
  },
  { label: "Students", href: "/admin/students", icon: UsersIcon },
  { label: "Exams", href: "/admin/exams", icon: ClipboardIcon },
  {
    label: "Exam Categories",
    href: "/admin/exam-categories",
    icon: TemplateIcon,
  },
  { label: "Question Bank", href: "/admin/questions", icon: DatabaseIcon },
  { label: "Results", href: "/admin/results", icon: BarChartIcon },
  { label: "Reports", href: "/admin/reports", icon: FileTextIcon },
  { label: "Live Monitoring", href: "/admin/monitoring", icon: ActivityIcon },
  { label: "Announcements", href: "/admin/announcements", icon: BellIcon },
  { label: "Imports", href: "/admin/imports", icon: UploadIcon },
  { label: "Teachers", href: "/admin/teachers", icon: GraduationCapIcon },
  { label: "My Profile", href: "/admin/profile", icon: UserIcon },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthUser();

  async function handleLogout() {
    await logout();
    router.replace("/login?as=staff");
  }

  return (
    <aside className="flex h-screen w-[280px] shrink-0 flex-col border-r border-admin-line bg-white px-4 py-5">
      {/* Logo */}
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
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = pathname === href;
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

      {/* Need help */}
      <div className="mt-auto rounded-xl border border-admin-line bg-admin/[0.06] p-4">
        <p className="text-sm font-bold text-admin-ink">Need help?</p>
        <p className="mt-1 text-xs text-admin-muted">
          There&apos;s no admin docs site yet — this opens an email to support.
        </p>
        <a
          href="mailto:support@drsk.in"
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
