"use client";

import {
  ActivityIcon,
  BarChartIcon,
  GridIcon,
  HistoryIcon,
  UsersIcon,
} from "@/components/admin/icons";
import { useRequireRole } from "@/hooks/use-auth";
import { StaffShell, type StaffNavItem } from "./staff-shell";

const NAV: StaffNavItem[] = [
  { label: "Overview", href: "/superadmin/dashboard", icon: GridIcon },
  { label: "Institutes", href: "/superadmin/tenants", icon: UsersIcon },
  { label: "Usage", href: "/superadmin/usage", icon: BarChartIcon },
  { label: "Audit Log", href: "/superadmin/audit", icon: HistoryIcon },
];

/**
 * Superadmin console frame.
 *
 * Guarded by role rather than by presence alone: an admin who lands here would
 * otherwise see a console whose every request is refused. useRequireRole sends
 * them to their own home instead.
 */
export function SuperadminShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const user = useRequireRole(["SUPERADMIN"]);
  if (!user) return <ShellSkeleton />;

  return (
    <StaffShell
      title={title}
      nav={NAV}
      workspace="Platform owner"
      searchPlaceholder="Search institutes…"
      quickActions={[
        {
          label: "New institute",
          href: "/superadmin/tenants?new=1",
          hint: "Add a tenant",
        },
      ]}
    >
      {children}
    </StaffShell>
  );
}

/** Quiet placeholder while the role is being resolved. */
function ShellSkeleton() {
  return (
    <div
      aria-hidden
      className="flex h-screen items-center justify-center bg-admin-bg"
    >
      <span className="size-8 animate-pulse rounded-full bg-admin/20" />
    </div>
  );
}

export { ActivityIcon };
