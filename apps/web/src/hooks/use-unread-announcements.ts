"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  fetchUnreadAnnouncementCount,
  markAnnouncementsSeen,
} from "@/lib/announcements";

/**
 * The unread-announcement count behind a notification bell, for whichever
 * portal is asking.
 *
 * Shared by the student and staff bells rather than written twice. They differ
 * only in icon, styling and destination; the behaviour below — where the count
 * comes from, and the moment it clears — is a rule about the feature, and two
 * copies of it would drift the first time one was edited.
 *
 * The count comes from the SERVER, not from anything remembered in this
 * browser, so it reads the same on a phone and a lab machine: someone who
 * clears one device's storage should not be told they are up to date.
 *
 * It clears on ARRIVAL at `inboxPath`, which is the moment "seen" actually
 * becomes true. Marking on click would clear it even if the navigation never
 * completed.
 */
export function useUnreadAnnouncements(inboxPath: string): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const onInboxPage = pathname?.startsWith(inboxPath) ?? false;

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
      if (onInboxPage) {
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
  }, [onInboxPage, refresh]);

  return count;
}

/**
 * Past 9 the exact number stops being useful and starts breaking the circle,
 * so it caps — the badge answers "how urgent", not "how many exactly".
 */
export function unreadBadgeLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}
