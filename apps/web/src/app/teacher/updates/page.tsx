"use client";

import { useEffect, useState } from "react";

import { AnnouncementCard } from "@/components/announcements/announcement-card";
import { MegaphoneIcon } from "@/components/student/icons";
import { TeacherShell } from "@/components/staff/teacher-shell";
import {
  fetchMyAnnouncements,
  type StudentAnnouncement,
} from "@/lib/announcements";

/**
 * A teacher's own notices (§2.9).
 *
 * Same endpoint as the candidate feed — the server decides the audience from
 * the session, so this page asks for "mine" and never states who it is. That
 * is also what clears the bell: arriving here marks them seen.
 */
export default function TeacherUpdatesPage() {
  const [items, setItems] = useState<StudentAnnouncement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyAnnouncements()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Could not load your updates",
          );
          setItems([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TeacherShell title="Updates & Announcements">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-[-0.4px] text-admin-ink">
          Updates &amp; Announcements
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          Notices from your institute. Pinned items stay at the top.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {items === null ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-admin-line/40 bg-admin-line/10"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-admin-line bg-white p-12 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-admin/10 text-admin">
            <MegaphoneIcon className="size-6" />
          </span>
          <p className="mt-4 text-base font-bold text-admin-ink">
            No announcements yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-admin-muted">
            When your institute posts an update for staff, it will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((a) => (
            <li key={a.id}>
              <AnnouncementCard item={a} />
            </li>
          ))}
        </ul>
      )}
    </TeacherShell>
  );
}
