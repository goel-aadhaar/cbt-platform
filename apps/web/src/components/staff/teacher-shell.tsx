"use client";

import {
  BarChartIcon,
  ClipboardIcon,
  DatabaseIcon,
  GridIcon,
  UsersIcon,
} from "@/components/admin/icons";
import { useRequireRole } from "@/hooks/use-auth";
import { StaffShell, type StaffNavItem } from "./staff-shell";

/**
 * Teacher nav. Deliberately shorter than the admin's: a teacher authors and
 * reports, so anything they cannot act on (imports, staff, live monitoring,
 * publishing) is absent rather than present-and-refused.
 */
const NAV: StaffNavItem[] = [
  { label: "Dashboard", href: "/teacher/dashboard", icon: GridIcon },
  { label: "Question Bank", href: "/teacher/questions", icon: DatabaseIcon },
  { label: "My Exams", href: "/teacher/exams", icon: ClipboardIcon },
  { label: "Student Reports", href: "/teacher/reports", icon: BarChartIcon },
  { label: "Students", href: "/teacher/students", icon: UsersIcon },
];

export function TeacherShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const user = useRequireRole(["TEACHER"]);
  if (!user) {
    return (
      <div
        aria-hidden
        className="flex h-screen items-center justify-center bg-admin-bg"
      >
        <span className="size-8 animate-pulse rounded-full bg-admin/20" />
      </div>
    );
  }

  return (
    <StaffShell
      title={title}
      nav={NAV}
      workspace="Teacher workspace"
      searchPlaceholder="Search questions, exams…"
      quickActions={[
        {
          label: "New question",
          href: "/teacher/questions?new=1",
          hint: "Add to the question bank",
        },
        {
          label: "New exam",
          href: "/teacher/exams?new=1",
          hint: "Build a paper and send for approval",
        },
      ]}
    >
      {children}
    </StaffShell>
  );
}
