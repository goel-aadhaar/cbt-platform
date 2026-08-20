import type { ExamStats } from "@/lib/exam-stats";
import type { PreflightResult } from "@/lib/exam-preflight";

/**
 * The "Pre-Flight Check" panel (§ exam authoring) — shown before a teacher
 * submits and before an admin approves, so both moments show the same
 * summary + the same warnings/errors computed by the same shared functions
 * (`computeExamStats`, `runPreflightChecks`).
 */
export function PreFlightPanel({
  stats,
  preflight,
}: {
  stats: ExamStats;
  preflight: PreflightResult;
}) {
  const { errors, warnings } = preflight;
  const clean = errors.length === 0 && warnings.length === 0;

  return (
    <div className="rounded-xl border border-admin-line/60 bg-white">
      <div className="border-b border-admin-line/60 px-4 py-3">
        <p className="text-sm font-bold text-admin-ink">Pre-Flight Check</p>
      </div>
      <ul className="flex flex-col gap-1.5 px-4 py-3 text-sm">
        <Row ok>{stats.totalQuestions} question(s) configured</Row>
        <Row ok>{stats.totalMarks} total marks</Row>
        <Row ok>Duration: {stats.durationMinutes} minutes</Row>
        <Row ok>{stats.totalSections} section(s)</Row>
        {errors.map((e, i) => (
          <Row key={`e${i}`} tone="error">
            {e.message}
          </Row>
        ))}
        {warnings.map((w, i) => (
          <Row key={`w${i}`} tone="warning">
            {w.message}
          </Row>
        ))}
      </ul>
      <div
        className={`border-t px-4 py-2.5 text-xs font-bold ${
          errors.length > 0
            ? "border-danger/30 bg-danger/5 text-danger"
            : warnings.length > 0
              ? "border-warn/30 bg-warn/10 text-warn"
              : "border-admin/30 bg-admin/5 text-admin"
        }`}
      >
        {errors.length > 0
          ? `${errors.length} error${errors.length === 1 ? "" : "s"} — fix before continuing`
          : warnings.length > 0
            ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"} — review recommended`
            : clean
              ? "All checks passed"
              : ""}
      </div>
    </div>
  );
}

function Row({
  children,
  ok,
  tone,
}: {
  children: React.ReactNode;
  ok?: boolean;
  tone?: "error" | "warning";
}) {
  const icon = ok ? "✓" : tone === "error" ? "✗" : "⚠";
  const color = ok
    ? "text-admin"
    : tone === "error"
      ? "text-danger"
      : "text-warn";
  return (
    <li className={`flex items-start gap-2 ${color}`}>
      <span className="font-bold">{icon}</span>
      <span className="text-admin-ink">{children}</span>
    </li>
  );
}
