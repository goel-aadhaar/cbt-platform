"use client";

import Link from "next/link";

import { BellIcon } from "@/components/student/icons";
import {
  unreadBadgeLabel,
  useUnreadAnnouncements,
} from "@/hooks/use-unread-announcements";

const INBOX = "/student/updates";

/**
 * The bell, with a count of announcements the candidate has not seen.
 *
 * Where the count comes from and when it clears now live in
 * useUnreadAnnouncements, shared with the staff bell — the two behave
 * identically by construction rather than by both being maintained.
 */
export function NotificationBell() {
  const count = useUnreadAnnouncements(INBOX);

  return (
    <Link
      href={INBOX}
      aria-label={
        count > 0
          ? `Updates and announcements, ${count} unread`
          : "Updates and announcements"
      }
      className="relative flex size-9 items-center justify-center rounded-full text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
    >
      <BellIcon className="size-5" />
      {count > 0 && (
        <span
          // aria-hidden: the count is already in the link's accessible name, so
          // announcing it twice would just be noise.
          aria-hidden
          className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-white"
        >
          {unreadBadgeLabel(count)}
        </span>
      )}
    </Link>
  );
}
