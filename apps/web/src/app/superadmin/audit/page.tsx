"use client";

import { useEffect, useState } from "react";

import { PaginationBar } from "@/components/pagination-bar";
import { Panel, StatusPill } from "@/components/staff/charts";
import { SuperadminShell } from "@/components/staff/superadmin-shell";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";

interface AuditEntry {
  id: string;
  instituteId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  outcome: "SUCCESS" | "FAILURE";
  statusCode: number | null;
  ip: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}

const PAGE = 50;

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setEntries(null);
      try {
        const res = await apiFetch<{ items: AuditEntry[]; total: number }>(
          `/audit-logs?limit=${PAGE}&offset=${offset}`,
          { token: getToken() ?? undefined },
        );
        if (cancelled) return;
        setEntries(res.items);
        setTotal(res.total);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Could not load the audit log",
        );
        setEntries([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [offset]);

  return (
    <SuperadminShell title="Audit Log">
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <Panel
        title={`${total.toLocaleString("en-IN")} recorded actions`}
        subtitle="Every mutating request across the platform (§2.13)"
        action={
          <PaginationBar
            offset={offset}
            pageSize={PAGE}
            total={total}
            onOffsetChange={setOffset}
            prevLabel="Newer"
            nextLabel="Older"
            caption={null}
          />
        }
      >
        {entries === null ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-admin-line/15"
              />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-admin-line p-8 text-center text-sm text-admin-muted">
            Nothing recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-admin-line text-xs font-bold uppercase tracking-wide text-admin-muted">
                  <th className="px-3 py-3">When</th>
                  <th className="px-3 py-3">Actor</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-admin-line/50">
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-admin-muted">
                      {new Date(e.createdAt).toLocaleString("en-IN")}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-admin-ink">
                        {e.actor?.name ?? "—"}
                      </p>
                      <p className="text-xs text-admin-muted">
                        {e.actorRole ?? ""}
                      </p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-admin-ink">
                      {e.action}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill
                        tone={e.outcome === "SUCCESS" ? "good" : "bad"}
                      >
                        {e.outcome === "SUCCESS"
                          ? `${e.statusCode ?? "OK"}`
                          : `Failed ${e.statusCode ?? ""}`}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </SuperadminShell>
  );
}
