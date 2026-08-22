"use client";

import { useEffect, useState } from "react";

import { XIcon } from "@/components/admin/icons";
import { formatBytes } from "@/lib/media";
import { fetchInstituteUsage, type InstituteUsage } from "@/lib/platform";

/**
 * One tenant's consumption (§2.14).
 *
 * The institutes table answers "how big is this tenant". This answers the two
 * questions the table cannot: what is it costing, and is anyone still using it.
 * Storage is the first — media bytes are the only resource a tenant can run up
 * without the row counts moving, and the one the platform owner pays for
 * directly. Last activity is the second, and it is what tells a suspended-
 * looking tenant apart from an abandoned one.
 *
 * Loaded on open rather than with the list: it is several extra aggregates per
 * tenant, and nobody needs them for forty tenants at once.
 */
export function InstituteUsageModal({
  instituteId,
  instituteName,
  onClose,
}: {
  instituteId: string | null;
  instituteName?: string;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<{
    id: string;
    usage: InstituteUsage;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!instituteId) return;
    let cancelled = false;
    fetchInstituteUsage(instituteId)
      .then((usage) => {
        if (!cancelled) setLoaded({ id: instituteId, usage });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load usage.");
        }
      });
    return () => {
      cancelled = true;
      setError(null);
    };
  }, [instituteId]);

  if (!instituteId) return null;
  // Guarded on id so a previous tenant's figures never appear under a new name.
  const ready = loaded?.id === instituteId ? loaded.usage : null;
  const window = ready ? `${ready.windowDays}d` : "30d";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-admin-ink/30"
      />
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-admin-line/60 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-admin-ink">
              Usage &amp; consumption
            </h2>
            <p className="text-sm text-admin-muted">
              {ready?.institute.name ?? instituteName ?? "Loading…"}
              {ready ? ` · ${ready.institute.slug}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-admin-muted hover:text-admin-ink"
          >
            <XIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
            >
              {error}
            </p>
          )}

          {!ready && !error ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-xl bg-admin-line/15"
                />
              ))}
            </div>
          ) : ready ? (
            <div className="flex flex-col gap-6">
              <Group title="Storage">
                <Figure
                  label="Media consumed"
                  value={formatBytes(ready.storage.mediaBytes)}
                  hint={`${ready.storage.mediaCount.toLocaleString("en-IN")} file(s)`}
                  emphasis
                />
              </Group>

              <Group title="Students">
                <Figure
                  label="Total"
                  value={ready.students.total.toLocaleString("en-IN")}
                />
                <Figure label="Active" value={ready.students.active} />
                <Figure label="Invited" value={ready.students.pending} />
                <Figure label="Disabled" value={ready.students.disabled} />
              </Group>

              <Group title="Content">
                <Figure label="Exams" value={ready.content.exams} />
                <Figure
                  label={`Exams created (${window})`}
                  value={ready.content.examsInWindow}
                />
                <Figure label="Questions" value={ready.content.questions} />
                <Figure label="Staff" value={ready.staff.total} />
              </Group>

              <Group title="Activity">
                <Figure label="Attempts" value={ready.activity.attempts} />
                <Figure
                  label={`Attempts (${window})`}
                  value={ready.activity.attemptsInWindow}
                />
                <Figure
                  label="In progress"
                  value={ready.activity.liveAttempts}
                />
                <Figure
                  label="Last used"
                  value={
                    ready.activity.lastAttemptAt
                      ? new Date(
                          ready.activity.lastAttemptAt,
                        ).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Never"
                  }
                />
              </Group>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-admin-muted">
        {title}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

function Figure({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string | number;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        emphasis
          ? "border-admin/30 bg-admin-mint/20"
          : "border-admin-line/60 bg-white"
      }`}
    >
      <p className="text-xl font-bold text-admin-ink">
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </p>
      <p className="mt-0.5 text-xs text-admin-muted">{label}</p>
      {hint && <p className="mt-1 text-xs text-admin-subtle">{hint}</p>}
    </div>
  );
}
