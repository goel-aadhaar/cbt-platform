"use client";

import { ProfilePanels } from "@/components/profile/profile-panels";
import { SuperadminShell } from "@/components/staff/superadmin-shell";

/** Staff profile — the same screen every role gets, in this console's chrome. */
export default function ProfilePage() {
  return (
    <SuperadminShell title="My Profile">
      <ProfilePanels />
    </SuperadminShell>
  );
}
