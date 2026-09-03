"use client";

import {
  ActivityIcon,
  BarChartIcon,
  BellIcon,
  CheckCircleIcon,
  ClipboardIcon,
  DatabaseIcon,
  FileTextIcon,
  GridIcon,
  HelpCircleIcon,
  UserIcon,
  UsersIcon,
} from "@/components/admin/icons";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useRequireRole } from "@/hooks/use-auth";
import { StaffShell, type StaffNavItem } from "./staff-shell";

/**
 * Teacher nav. Deliberately shorter than the admin's: a teacher authors and
 * reports, so anything they cannot act on (imports, staff, publishing) is
 * absent rather than present-and-refused. Live Monitoring IS present — a
 * teacher may invigilate their own assigned batches (§ batch-scoped teacher
 * access), just not the whole institute's.
 */
const NAV: StaffNavItem[] = [
  { label: "Dashboard", href: "/teacher/dashboard", icon: GridIcon },
  { label: "Question Bank", href: "/teacher/questions", icon: DatabaseIcon },
  { label: "My Exams", href: "/teacher/exams", icon: ClipboardIcon },
  {
    label: "Assessments",
    href: "/teacher/assessments",
    icon: CheckCircleIcon,
  },
  { label: "Student Reports", href: "/teacher/reports", icon: BarChartIcon },
  { label: "Students", href: "/teacher/students", icon: UsersIcon },
  { label: "Resources", href: "/teacher/resources", icon: FileTextIcon },
  {
    label: "Live Monitoring",
    href: "/teacher/monitoring",
    icon: ActivityIcon,
  },
  {
    label: "Updates & Announcements",
    href: "/teacher/updates",
    icon: BellIcon,
  },
  { label: "My Profile", href: "/teacher/profile", icon: UserIcon },
  // Last, matching the candidate portal: reached deliberately, not stumbled
  // into. Also on the topbar, which is where someone stuck mid-task looks.
  { label: "Help & Support", href: "/teacher/help", icon: HelpCircleIcon },
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
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingSpinner size={32} />
        </div>
      </div>
    );
  }

  return (
    <StaffShell
      title={title}
      nav={NAV}
      profileHref="/teacher/profile"
      helpHref="/teacher/help"
      inboxHref="/teacher/updates"
      workspace="Teacher workspace"
    >
      {children}
    </StaffShell>
  );
}
