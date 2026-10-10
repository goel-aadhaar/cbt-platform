import {
  compareBlueprint,
  type BlueprintComparison,
  type SectionBlueprint,
} from "@/lib/exam-blueprint";

/**
 * Target-vs-actual chapter mix for one section. Used live in the builder, on
 * the builder's Review step and in the admin's review workspace, so the
 * teacher and the reviewer read the same table.
 */
export function BlueprintComparisonTable({
  comparison,
  marksCorrect,
}: {
  comparison: BlueprintComparison;
  marksCorrect: number;
}) {
  const { rows, targetTotal, actualTotal, deviations } = comparison;
  const matches = deviations.length === 0 && targetTotal === actualTotal;

  return (
    <div className="overflow-hidden rounded-lg border border-admin-line/60">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-bg/60 text-[11px] font-bold uppercase tracking-wide text-admin-muted">
            <tr>
              <th className="px-3 py-2">Chapter</th>
              <th className="px-3 py-2 text-right">Target %</th>
              <th className="px-3 py-2 text-right">Target Qs</th>
              <th className="px-3 py-2 text-right">Actual Qs</th>
              <th className="px-3 py-2 text-right">Actual %</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-admin-line/40">
            {rows.map((r) => (
              <tr key={r.chapterId || "none"}>
                <td className="px-3 py-2 text-admin-ink">{r.chapter}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.planned ? `${r.targetPercent}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.planned ? r.targetCount : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.actualCount}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.actualPercent}%
                </td>
                <td
                  className={`px-3 py-2 text-xs font-semibold ${
                    r.delta === 0 ? "text-admin" : "text-warn"
                  }`}
                >
                  {!r.planned
                    ? "Not in target"
                    : r.delta === 0
                      ? "On target"
                      : r.delta < 0
                        ? `${-r.delta} short`
                        : `${r.delta} over`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p
        className={`border-t border-admin-line/60 px-3 py-2 text-xs ${
          matches ? "bg-admin/5 text-admin" : "bg-warn/10 text-warn"
        }`}
      >
        Target {targetTotal} × +{marksCorrect} = {targetTotal * marksCorrect}{" "}
        marks · Built {actualTotal} × +{marksCorrect} ={" "}
        {actualTotal * marksCorrect} marks
      </p>
    </div>
  );
}

export interface BlueprintSummarySection {
  name: string;
  marksCorrect: number;
  blueprint: SectionBlueprint | null;
  questions: { chapterId?: string | null; chapter?: string | null }[];
}

/**
 * Every section that carries a weightage, with its table. Renders nothing for
 * a paper that has none, so it is safe to drop in unconditionally.
 */
export function ExamBlueprintSummary({
  sections,
}: {
  sections: BlueprintSummarySection[];
}) {
  const withBlueprint = sections.filter((s) => s.blueprint);
  if (withBlueprint.length === 0) return null;

  return (
    <div className="rounded-xl border border-admin-line/60 bg-white">
      <div className="border-b border-admin-line/60 px-4 py-3">
        <p className="text-sm font-bold text-admin-ink">
          Chapter weightage — target vs built
        </p>
        <p className="mt-0.5 text-xs text-admin-muted">
          What the author aimed for in each section, against the questions that
          are actually in it.
        </p>
      </div>
      <div className="flex flex-col gap-4 px-4 py-3">
        {withBlueprint.map((s, i) => (
          <div key={`${s.name}-${i}`} className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-admin-ink">
              {s.name || "Untitled section"}
            </p>
            {s.blueprint && (
              <BlueprintComparisonTable
                comparison={compareBlueprint(s.blueprint, s.questions)}
                marksCorrect={s.marksCorrect}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
