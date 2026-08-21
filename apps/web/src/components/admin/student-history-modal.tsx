"use client";

import { useEffect, useState } from "react";

import { getStudentHistory, type StudentHistoryEntry } from "@/lib/admin";

import { XIcon } from "./icons";

/**
 * One candidate's full exam record.
 *
 * `GET /students/:id/history` was implemented from the start and never called
 * by anything — an administrator could see a student's current status but not
 * how they had actually performed over time, which is the question a parent or
 * a class teacher asks first.
 *
 * Held results are shown too, marked as such: an admin is entitled to see a
 * score before the candidate is, and hiding it here would make the list
 * silently disagree with the results console.
 */
export function StudentHistoryModal({
  studentId,
  studentName,
  onClose,
}: {
  studentId: string | null;
  studentName?: string;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<{
    id: string;
    student: { rollNumber: string; name: string };
    results: StudentHistoryEntry[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    getStudentHistory(studentId)
      .then((res) => {
        if (cancelled) return;
        setLoaded({
          id: studentId,
          student: res.student,
          results: res.results,
        });
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Could not load the history.",
        );
        setLoaded({
          id: studentId,
          student: { rollNumber: "", name: studentName ?? "" },
          results: [],
        });
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, studentName]);

  if (!studentId) return null;
  const ready = loaded?.id === studentId ? loaded : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-admin-ink/30"
      />
      <div className="relative flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-admin-line/60 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-admin-ink">Exam history</h2>
            <p className="text-sm text-admin-muted">
              {ready?.student.name ?? studentName ?? "Loading…"}
              {ready?.student.rollNumber
                ? ` · ${ready.student.rollNumber}`
                : ""}
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
              className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          {!ready ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-lg bg-admin-line/15"
                />
              ))}
            </div>
          ) : ready.results.length === 0 ? (
            <p className="rounded-xl border border-dashed border-admin-line p-10 text-center text-sm text-admin-muted">
              This student has not sat any evaluated exam yet.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-admin-line text-xs font-bold uppercase tracking-wide text-admin-muted">
                  <th className="py-2">Exam</th>
                  <th className="py-2">Score</th>
                  <th className="py-2">Rank</th>
                  <th className="py-2">Percentile</th>
                  <th className="py-2">Visible to student</th>
                </tr>
              </thead>
              <tbody>
                {ready.results.map((r) => (
                  <tr key={r.id} className="border-b border-admin-line/50">
                    <td className="py-3">
                      <p className="font-semibold text-admin-ink">
                        {r.exam.title}
                      </p>
                      <p className="text-xs text-admin-muted">
                        {new Date(r.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </td>
                    <td className="py-3 font-semibold text-admin-ink">
                      {r.totalScore} / {r.maxScore}
                    </td>
                    <td className="py-3">
                      {r.overallRank ? `#${r.overallRank}` : "—"}
                    </td>
                    <td className="py-3">
                      {r.percentile == null ? "—" : r.percentile.toFixed(2)}
                    </td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          r.published
                            ? "bg-green-50 text-green-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {r.published ? "Published" : "Held"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
