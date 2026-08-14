"use client";

import { LoadingSpinner } from "@/components/loading-spinner";
import { useRequireRole } from "@/hooks/use-auth";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";

/**
 * Shared layout for all /admin/* screens: fixed sidebar + top app bar, with a
 * scrollable content area. `title` names the current section in the top bar.
 */
export function AdminShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  // A teacher or superadmin who lands here would meet refusals on most pages;
  // send them to their own console instead.
  const user = useRequireRole(["ADMIN"]);
  if (!user) {
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

  return (
    <div className="flex h-screen overflow-hidden bg-admin-bg text-admin-ink [font-family:var(--font-hanken)]">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar title={title} />
        <main className="flex-1 overflow-auto px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
