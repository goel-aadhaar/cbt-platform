"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import {
  fetchMyProfile,
  getUserSnapshot,
  subscribeSession,
  type MyProfile,
} from "@/lib/auth";

/**
 * The candidate's own programme, class and batch, in the top bar.
 *
 * A student belongs to exactly one of each — the chain is Student → Batch →
 * Class → Program — so these three chips fully describe where they sit in the
 * institute, and every list they see (exams, practice, announcements) is scoped
 * by them. Until now they were the literal strings "NEET", "Class 12" and
 * "Batch A", which happened to be right for whoever the design was drawn from
 * and wrong for everyone else. A candidate reading them had no way to tell.
 *
 * `GET /auth/me/profile` already returns the three names resolved from the real
 * relations, so there is nothing to add on the server.
 */

/**
 * One in-flight (or settled) request per signed-in account.
 *
 * StudentShell wraps all fifteen /student/* screens, so without this every
 * navigation would re-request a profile that cannot have changed. Keyed by user
 * id rather than shared outright: signing in as someone else on the same tab
 * must not inherit the previous candidate's enrolment.
 */
let cache: { userId: string; profile: Promise<MyProfile> } | null = null;

function profileFor(userId: string): Promise<MyProfile> {
  if (cache?.userId !== userId) {
    const profile = fetchMyProfile();
    // A failed request must not be cached as the answer forever — an expired
    // token is transient, and the next screen should be free to try again.
    void profile.catch(() => {
      if (cache?.profile === profile) cache = null;
    });
    cache = { userId, profile };
  }
  return cache.profile;
}

export function StudentContextChips() {
  const user = useSyncExternalStore(
    subscribeSession,
    getUserSnapshot,
    () => null,
  );
  const [loaded, setLoaded] = useState<{
    userId: string;
    student: MyProfile["student"];
  } | null>(null);

  // Whose enrolment this is, checked during render rather than cleared from the
  // effect: signing out, or switching account, must not leave the previous
  // candidate's batch on screen for the frame before an effect can run.
  const enrolment =
    loaded && user && loaded.userId === user.id ? loaded.student : null;

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    let cancelled = false;
    profileFor(userId)
      .then((profile) => {
        if (!cancelled) setLoaded({ userId, student: profile.student });
      })
      // Deliberately silent: these chips are context, not content. A candidate
      // who cannot load them can still sit the exam, and the screen's own data
      // fetch is what surfaces a dead session.
      .catch(() => {
        if (!cancelled) setLoaded({ userId, student: null });
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Nothing rather than placeholders: three chips that flicker through
  // skeletons on every navigation are worse than three that simply appear, and
  // a staff account opening a student screen has no enrolment to show at all.
  if (!enrolment) return null;

  return (
    <>
      <ContextChip>{enrolment.program}</ContextChip>
      <ContextChip>{enrolment.class}</ContextChip>
      <ContextChip>{enrolment.batch}</ContextChip>
    </>
  );
}

function ContextChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-admin-line bg-admin-bg px-3 py-1 text-xs font-semibold text-admin-muted">
      {children}
    </span>
  );
}
