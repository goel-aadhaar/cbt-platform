"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { PaginationBar } from "@/components/pagination-bar";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";

/**
 * The institute's own audit trail.
 *
 * `GET /audit-logs` has always allowed ADMIN and scoped the query to the
 * caller's institute — but the only page that called it was the superadmin
 * console, so an institute administrator could not review their own staff's
 * actions at all. That is the one audience the trail is contractually for.
 */
interface AuditEntry {
  id: string;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  outcome: "SUCCESS" | "FAILURE";
  statusCode: number | null;
  ip: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
  metadata: {
    path?: string;
    durationMs?: number;
    fields?: string[];
    values?: Record<string, unknown>;
  } | null;
}

const PAGE = 50;

/** Filters an admin actually reaches for, rather than the whole query surface. */
const QUICK_FILTERS: { label: string; action: string }[] = [
  { label: "Everything", action: "" },
  { label: "Question edits", action: "/questions" },
  { label: "Exam changes", action: "/exams" },
  { label: "Results", action: "/results" },
  { label: "Roster", action: "/students" },
  { label: "Staff & roles", action: "/staff" },
];

export default function AdminAuditPage() {
  // `loadedKey` records which query the rows in state belong to, so "loading"
  // is derived rather than set from inside the effect body — React 19 flags a
  // synchronous setState there as a cascading render.
  const [loaded, setLoaded] = useState<{
    key: string;
    items: AuditEntry[];
  } | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState("");
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      limit: String(PAGE),
      offset: String(offset),
      ...(action ? { action } : {}),
      ...(failuresOnly ? { outcome: "FAILURE" } : {}),
    });

    const key = params.toString();
    apiFetch<{ items: AuditEntry[]; total: number }>(`/audit-logs?${key}`, {
      token: getToken() ?? undefined,
    })
      .then((res) => {
        if (cancelled) return;
        setLoaded({ key, items: res.items });
        setTotal(res.total);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Could not load the audit log",
        );
        setLoaded({ key, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [offset, action, failuresOnly]);

  const currentKey = new URLSearchParams({
    limit: String(PAGE),
    offset: String(offset),
    ...(action ? { action } : {}),
    ...(failuresOnly ? { outcome: "FAILURE" } : {}),
  }).toString();
  const entries = loaded?.key === currentKey ? loaded.items : null;

  return (
    <AdminShell title="Audit Log">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-admin-muted">
          Every change made in your institute, by whom and when. Read-only.
        </p>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => {
                setAction(f.action);
                setOffset(0);
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-bold ${
                action === f.action
                  ? "bg-admin text-white"
                  : "border border-admin-line text-admin-ink hover:bg-admin-bg"
              }`}
            >
              {f.label}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm text-admin-ink">
            <input
              type="checkbox"
              checked={failuresOnly}
              onChange={(e) => {
                setFailuresOnly(e.target.checked);
                setOffset(0);
              }}
              className="size-4 accent-admin"
            />
            Refused attempts only
          </label>
        </div>

        <div className="rounded-2xl border border-admin-line/60 bg-white">
          <div className="border-b border-admin-line/60 px-5 py-4">
            <PaginationBar
              offset={offset}
              pageSize={PAGE}
              total={total}
              onOffsetChange={setOffset}
              prevLabel="Newer"
              nextLabel="Older"
              caption={`${total.toLocaleString("en-IN")} recorded ${total === 1 ? "action" : "actions"}`}
            />
          </div>

          {entries === null ? (
            <div className="flex flex-col gap-2 p-5">
              {Array.from({ length: 8 }, (_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-lg bg-admin-line/15"
                />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="p-10 text-center text-sm text-admin-muted">
              Nothing recorded for this filter yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-admin-line text-xs font-bold uppercase tracking-wide text-admin-muted">
                    <th className="px-5 py-3">When</th>
                    <th className="px-5 py-3">Who</th>
                    <th className="px-5 py-3">What changed</th>
                    <th className="px-5 py-3">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const changed = e.metadata?.fields ?? [];
                    const values = e.metadata?.values ?? {};
                    const open = expanded === e.id;
                    return (
                      <tr
                        key={e.id}
                        className="border-b border-admin-line/50 align-top"
                      >
                        <td className="whitespace-nowrap px-5 py-3 text-xs text-admin-muted">
                          {new Date(e.createdAt).toLocaleString("en-IN")}
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-semibold text-admin-ink">
                            {e.actor?.name ?? "—"}
                          </p>
                          <p className="text-xs text-admin-muted">
                            {e.actorRole ?? ""}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-mono text-xs text-admin-ink">
                            {e.action}
                          </p>
                          {/* The fields the caller set — this is what makes an
                              answer-key correction distinguishable from a typo
                              fix, which the trail previously could not do. */}
                          {changed.length > 0 && (
                            <p className="mt-1 text-xs text-admin-muted">
                              Changed: {changed.join(", ")}
                            </p>
                          )}
                          {Object.keys(values).length > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={() => setExpanded(open ? null : e.id)}
                                className="mt-1 text-xs font-semibold text-admin underline"
                              >
                                {open ? "Hide values" : "Show values"}
                              </button>
                              {open && (
                                <pre className="mt-2 max-w-md overflow-x-auto rounded-lg bg-admin-bg p-3 text-xs text-admin-ink">
                                  {JSON.stringify(values, null, 2)}
                                </pre>
                              )}
                            </>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                              e.outcome === "SUCCESS"
                                ? "bg-green-50 text-green-700"
                                : "bg-red-50 text-red-700"
                            }`}
                          >
                            {e.outcome === "SUCCESS"
                              ? (e.statusCode ?? "OK")
                              : `Refused ${e.statusCode ?? ""}`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
