"use client";

import { useEffect, useState } from "react";

import { StudentShell } from "@/components/student/student-shell";
import { MegaphoneIcon, StarIcon } from "@/components/student/icons";
import {
  CATEGORY_LOOK,
  fetchMyAnnouncements,
  type StudentAnnouncement,
} from "@/lib/announcements";

/**
 * Updates & Announcements.
 *
 * The server has already filtered this to published, unexpired notices aimed
 * at the student's own batch — the client does no visibility logic of its own.
 */
export default function StudentUpdatesPage() {
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
    <StudentShell breadcrumb={["Updates & Announcements"]}>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
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
            When your institute posts an update, it will appear here.
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
    </StudentShell>
  );
}

function AnnouncementCard({ item }: { item: StudentAnnouncement }) {
  const look = CATEGORY_LOOK[item.category] ?? CATEGORY_LOOK.GENERAL;
  return (
    <article
      className={`rounded-2xl border bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)] ${
        item.pinned ? "border-admin/40" : "border-admin-line/40"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {item.pinned && (
          <span className="inline-flex items-center gap-1 rounded-full bg-admin/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-admin">
            <StarIcon className="size-3" />
            Pinned
          </span>
        )}
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${look.className}`}
        >
          {look.label}
        </span>
        <span className="ml-auto text-xs text-admin-muted">
          {new Date(item.publishedAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>

      <h2 className="mt-3 text-lg font-bold text-admin-ink">{item.title}</h2>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-admin-ink">
        {item.body}
      </p>
      <p className="mt-3 text-xs text-admin-muted">
        Posted by {item.createdBy.name}
      </p>
    </article>
  );
}
