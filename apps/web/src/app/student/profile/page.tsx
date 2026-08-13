"use client";

import { ProfilePanels } from "@/components/profile/profile-panels";
import { StudentShell } from "@/components/student/student-shell";

/**
 * A candidate's own profile.
 *
 * Previously a static mock-up: it showed a fictional person's name, email,
 * phone and home address to whoever was signed in. Everything here now comes
 * from /auth/me/profile, and the fields the platform does not store (date of
 * birth, address) are gone rather than invented.
 */
export default function StudentProfilePage() {
  return (
    <StudentShell breadcrumb={["Profile"]}>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          My Profile
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          Your details as your institute holds them.
        </p>
      </header>
      <ProfilePanels />
    </StudentShell>
  );
}
