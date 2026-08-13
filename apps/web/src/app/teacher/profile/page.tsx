"use client";

import { ProfilePanels } from "@/components/profile/profile-panels";
import { TeacherShell } from "@/components/staff/teacher-shell";

/** Staff profile — the same screen every role gets, in this console's chrome. */
export default function ProfilePage() {
  return (
    <TeacherShell title="My Profile">
      <ProfilePanels />
    </TeacherShell>
  );
}
