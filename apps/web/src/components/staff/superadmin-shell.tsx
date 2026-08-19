"use client";

import {
  ActivityIcon,
  BarChartIcon,
  GridIcon,
  HistoryIcon,
  UserIcon,
  UsersIcon,
} from "@/components/admin/icons";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useRequireRole } from "@/hooks/use-auth";
import { StaffShell, type StaffNavItem } from "./staff-shell";

const NAV: StaffNavItem[] = [
  { label: "Overview", href: "/superadmin/dashboard", icon: GridIcon },
  { label: "Institutes", href: "/superadmin/tenants", icon: UsersIcon },
  { label: "Usage", href: "/superadmin/usage", icon: BarChartIcon },
  { label: "Audit Log", href: "/superadmin/audit", icon: HistoryIcon },
  { label: "My Profile", href: "/superadmin/profile", icon: UserIcon },
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
      profileHref="/superadmin/profile"
      workspace="Platform owner"
      searchPlaceholder="Search institutes…"
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size={32} />
      </div>
    </div>
  );
}

export { ActivityIcon };
