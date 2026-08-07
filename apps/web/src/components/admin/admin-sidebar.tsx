"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { logout } from "@/lib/auth";

import {
  ActivityIcon,
  BarChartIcon,
  ChevronDownIcon,
  ClipboardIcon,
  DatabaseIcon,
  FileTextIcon,
  GraduationCapIcon,
  GridIcon,
  LogOutIcon,
  SettingsIcon,
  UploadIcon,
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
  { label: "Students", href: "/admin/students", icon: UsersIcon },
  { label: "Exams", href: "/admin/exams", icon: ClipboardIcon },
  { label: "Question Bank", href: "/admin/questions", icon: DatabaseIcon },
  { label: "Results", href: "/admin/results", icon: BarChartIcon },
  { label: "Reports", href: "/admin/reports", icon: FileTextIcon },
  { label: "Live Monitoring", href: "/admin/monitoring", icon: ActivityIcon },
  { label: "Imports", href: "/admin/imports", icon: UploadIcon },
  { label: "Teachers", href: "/admin/teachers", icon: GraduationCapIcon },
  { label: "Settings", href: "/admin/settings", icon: SettingsIcon },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/admin/login");
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
      <button
        type="button"
        className="mt-5 flex items-center gap-3 rounded-xl border border-admin-line bg-white px-3 py-2.5 text-left hover:bg-admin-bg"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-admin text-sm font-bold text-white">
          SK
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-admin-ink">
            Dr. John Doe
          </span>
          <span className="block text-xs text-admin-muted">
            Institute workspace
          </span>
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-admin-muted" />
      </button>

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
          View docs or contact support for assistance.
        </p>
        <button
          type="button"
          className="mt-3 w-full rounded-lg border border-admin-line bg-white py-2 text-xs font-semibold text-admin-ink hover:bg-admin-bg"
        >
          Open guide
        </button>
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
