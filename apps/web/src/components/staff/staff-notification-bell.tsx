"use client";

import Link from "next/link";

import { BellIcon } from "@/components/admin/icons";
import {
  unreadBadgeLabel,
  useUnreadAnnouncements,
} from "@/hooks/use-unread-announcements";

/**
 * The staff bell — same behaviour as the candidate's, same hook, different
 * chrome. Rendered only where the console actually receives notices (§2.9):
 * teachers do, admins author them instead, so the admin topbar has no bell
 * rather than one that could never light up.
 */
export function StaffNotificationBell({ href }: { href: string }) {
  const count = useUnreadAnnouncements(href);

  return (
    <Link
      href={href}
      aria-label={
        count > 0
          ? `Updates and announcements, ${count} unread`
          : "Updates and announcements"
      }
      title="Updates and announcements"
      className="relative flex size-10 items-center justify-center rounded-full hover:bg-white"
    >
      <BellIcon className="size-5" />
      {count > 0 && (
        <span
          // aria-hidden: the count is already in the link's accessible name,
          // so announcing it twice would just be noise.
          aria-hidden
          className="absolute right-1 top-1 flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-admin-bg"
        >
          {unreadBadgeLabel(count)}
        </span>
      )}
    </Link>
  );
}
