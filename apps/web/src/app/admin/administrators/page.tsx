"use client";

import { Suspense } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { StaffRosterView } from "@/components/admin/staff-roster-view";

/**
 * `useSearchParams()` inside StaffRosterView (deep links from the Quick
 * Create menu) forces a client bail-out, which Next requires to sit behind a
 * Suspense boundary or the production prerender of this route fails.
 */
export default function AdministratorsPage() {
  return (
    <AdminShell title="Administrators">
      <Suspense fallback={null}>
        <StaffRosterView role="ADMIN" />
      </Suspense>
    </AdminShell>
  );
}
