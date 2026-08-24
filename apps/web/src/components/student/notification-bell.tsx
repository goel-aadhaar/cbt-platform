"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { BellIcon } from "@/components/student/icons";
import {
  fetchUnreadAnnouncementCount,
  markAnnouncementsSeen,
} from "@/lib/announcements";

/**
 * The bell, with a count of announcements the candidate has not seen.
 *
 * The count comes from the server rather than from anything remembered in this
 * browser, so it reads the same on a phone and a lab machine — a candidate who
 * clears one device's storage should not be told they are up to date.
 *
 * It clears itself when they arrive at the announcements page, which is the
 * moment "seen" actually becomes true. Marking on click would clear it even if
 * the navigation never completed.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const onUpdatesPage = pathname?.startsWith("/student/updates") ?? false;

  const refresh = useCallback(async () => {
    try {
      const { count: n } = await fetchUnreadAnnouncementCount();
      setCount(n);
    } catch {
      // A failed count is not worth a banner: the bell simply shows no badge.
      // Every other call on the page surfaces a real error if the session died.
      setCount(0);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (onUpdatesPage) {
        // Reading the page IS seeing them. Clear server-side, then show zero.
        try {
          await markAnnouncementsSeen();
          if (!cancelled) setCount(0);
        } catch {
          if (!cancelled) void refresh();
        }
        return;
      }
      if (!cancelled) await refresh();
    };

    const id = setTimeout(() => void run(), 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [onUpdatesPage, refresh]);

  /**
   * Past 9 the exact number stops being useful and starts breaking the circle,
   * so it caps — the badge answers "how urgent", not "how many exactly".
   */
  const label = count > 9 ? "9+" : String(count);

  return (
    <Link
      href="/student/updates"
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
          {label}
        </span>
      )}
    </Link>
  );
}
