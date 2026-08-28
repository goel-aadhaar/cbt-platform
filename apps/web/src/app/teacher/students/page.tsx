"use client";

import { useEffect, useState } from "react";

import { PaginationBar } from "@/components/pagination-bar";
import { Panel, StatusPill } from "@/components/staff/charts";
import { TeacherShell } from "@/components/staff/teacher-shell";
import { listStudents, type StudentListItem } from "@/lib/students";

const PAGE = 50;

/**
 * Roster, read-only.
 *
 * A teacher needs to know who is in a cohort to make sense of a report, but
 * adding, editing and removing students belong to an administrator — the API
 * refuses those for teachers, so this page does not offer them.
 *
 * Paged rather than searched: the API has no student search, and a box that
 * filtered only the loaded page would quietly lie about what it had looked at.
 */
export default function TeacherStudentsPage() {
  const [rows, setRows] = useState<StudentListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setRows(null);
      try {
        const res = await listStudents({ limit: PAGE, offset });
        if (cancelled) return;
        setRows(res.items);
        setTotal(res.total);
        setError(null);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load the roster");
        setRows([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [offset]);

  return (
    <TeacherShell title="Students">
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <Panel
        title="Students"
        subtitle="Read-only — the roster is managed by an administrator"
        action={
          <PaginationBar
            offset={offset}
            pageSize={PAGE}
            total={total}
            onOffsetChange={setOffset}
            itemLabel="students"
          />
        }
      >
        {rows === null ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-admin-line/15"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-admin-line p-8 text-center text-sm text-admin-muted">
            No students on the roster yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr className="border-b border-admin-line text-xs font-bold uppercase tracking-wide text-admin-muted">
                  <th className="px-3 py-3">Roll number</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Batch</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-b border-admin-line/50">
                    <td className="px-3 py-3 font-mono text-xs text-admin-ink">
                      {s.rollNumber}
                    </td>
                    <td className="px-3 py-3 font-semibold text-admin-ink">
                      {s.name}
                    </td>
                    <td className="px-3 py-3 text-admin-muted">
                      {s.batch?.name ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill
                        tone={s.status === "ACTIVE" ? "good" : "muted"}
                      >
                        {s.status}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </TeacherShell>
  );
}
