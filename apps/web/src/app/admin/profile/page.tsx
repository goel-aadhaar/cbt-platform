"use client";

import { ProfilePanels } from "@/components/profile/profile-panels";
import { AdminShell } from "@/components/admin/admin-shell";

/** Staff profile — the same screen every role gets, in this console's chrome. */
export default function ProfilePage() {
  return (
    <AdminShell title="My Profile">
      <ProfilePanels />
    </AdminShell>
  );
}
