"use client";

import { useEffect, useMemo, useState } from "react";

import {
  fetchBlueprintChapters,
  pickByBlueprint,
  type BlueprintChapter,
  type BlueprintPickResult,
} from "@/lib/admin";
import {
  compareBlueprint,
  draftToPayload,
  evenSplit,
  MAX_BLUEPRINT_TOTAL,
  parseDraft,
  type DraftBlueprint,
} from "@/lib/exam-blueprint";
import type { QuestionListItem } from "@/lib/questions";

import { BlueprintComparisonTable } from "./exam-blueprint-compare";

const smallInput =
  "rounded-lg border border-admin-line bg-white px-2.5 py-1.5 text-sm text-admin-ink outline-none focus:border-admin disabled:bg-admin-bg disabled:text-admin-subtle";

/**
 * "Chapter weightage" for one section of the exam builder: tick chapters, give
 * each a percentage, auto-pick a matching set of approved questions, then keep
 * editing by hand. The target is saved on the section; the live table below
 * the inputs shows how the questions actually in the section compare.
 *
 * Mount it with a `key` that includes the subject, so switching section loads
 * that subject's chapters from scratch.
 */
export function ExamBlueprintPanel({
  subject,
  blueprint,
  onChange,
  marksCorrect,
  questions,
  hasManualPicks,
  excludeQuestionIds,
  onApplyPick,
}: {
  subject: { id: string; name: string };
  blueprint: DraftBlueprint | null;
  onChange: (next: DraftBlueprint | null) => void;
  marksCorrect: number;
  /** The section's questions as they stand now (the "actual" side). */
  questions: QuestionListItem[];
  hasManualPicks: boolean;
  /** Questions already used in the exam's other sections. */
  excludeQuestionIds: string[];
  /** Replace the section's questions with the picked ones. */
  onApplyPick: (result: BlueprintPickResult) => void;
}) {
  const [chapters, setChapters] = useState<BlueprintChapter[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [lastPick, setLastPick] = useState<BlueprintPickResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBlueprintChapters(subject.id)
      .then((rows) => {
        if (!cancelled) setChapters(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Could not load the chapters.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [subject.id]);

  const names = useMemo(
    () => new Map((chapters ?? []).map((c) => [c.chapterId, c.name])),
    [chapters],
  );
  const parsed = useMemo(
    () => (blueprint ? parseDraft(blueprint) : null),
    [blueprint],
  );
  const payload = useMemo(() => draftToPayload(blueprint), [blueprint]);
  const comparison = useMemo(
    () => (payload ? compareBlueprint(payload, questions, names) : null),
    [payload, questions, names],
  );

  if (!blueprint || !parsed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-admin-line p-4">
        <p className="text-sm text-admin-muted">
          <span className="font-semibold text-admin-ink">
            Chapter weightage (optional).
          </span>{" "}
          Choose chapters and a percentage for each — e.g. 40% from one chapter,
          20% from another — and let the builder pick the questions.
        </p>
        <button
          type="button"
          onClick={() =>
            onChange({
              total: questions.length > 0 ? String(questions.length) : "",
              items: [],
            })
          }
          className="shrink-0 rounded-lg border border-admin px-4 py-2 text-sm font-semibold text-admin hover:bg-admin/5"
        >
          Set chapter weightage
        </button>
      </div>
    );
  }

  const ticked = new Map(blueprint.items.map((i) => [i.chapterId, i]));
  const countFor = (chapterId: string) => {
    const idx = parsed.items.findIndex((i) => i.chapterId === chapterId);
    return idx === -1 ? 0 : parsed.counts[idx];
  };

  function setItems(items: DraftBlueprint["items"]) {
    onChange({ ...blueprint!, items });
  }

  function toggle(chapterId: string) {
    if (ticked.has(chapterId)) {
      setItems(blueprint!.items.filter((i) => i.chapterId !== chapterId));
    } else {
      setItems([...blueprint!.items, { chapterId, percent: "" }]);
    }
  }

  function setPercent(chapterId: string, percent: string) {
    setItems(
      blueprint!.items.map((i) =>
        i.chapterId === chapterId ? { ...i, percent } : i,
      ),
    );
  }

  function applyEvenSplit() {
    const shares = evenSplit(blueprint!.items.length);
    setItems(
      blueprint!.items.map((i, idx) => ({
        ...i,
        percent: String(shares[idx]),
      })),
    );
  }

  async function autoPick() {
    if (parsed!.problem) return;
    if (
      hasManualPicks &&
      !window.confirm(
        "This section already has questions. Auto-pick replaces them with a new selection. Continue?",
      )
    ) {
      return;
    }
    setPicking(true);
    setPickError(null);
    try {
      const result = await pickByBlueprint({
        subjectId: subject.id,
        total: parsed!.total,
        items: parsed!.items,
        excludeQuestionIds,
      });
      setLastPick(result);
      onApplyPick(result);
    } catch (e) {
      setPickError(
        e instanceof Error ? e.message : "Could not pick questions.",
      );
    } finally {
      setPicking(false);
    }
  }

  const nameOf = (id: string) => names.get(id) ?? "this chapter";

  return (
    <div className="rounded-xl border border-admin-line/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-admin-line/60 px-4 py-2.5">
        <p className="text-xs font-bold uppercase tracking-wide text-admin-muted">
          Chapter weightage — {subject.name}
        </p>
        <button
          type="button"
          onClick={() => {
            setLastPick(null);
            setPickError(null);
            onChange(null);
          }}
          className="text-xs font-semibold text-admin-muted hover:text-danger"
        >
          Remove weightage
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-admin-ink">
              Questions in this section
            </span>
            <input
              type="number"
              min={1}
              max={MAX_BLUEPRINT_TOTAL}
              step={1}
              value={blueprint.total}
              onChange={(e) =>
                onChange({ ...blueprint, total: e.target.value })
              }
              className={`${smallInput} w-32`}
            />
          </label>
          <button
            type="button"
            onClick={applyEvenSplit}
            disabled={blueprint.items.length < 2}
            className="rounded-lg border border-admin-line px-3 py-1.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-40"
          >
            Even split
          </button>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              blueprint.items.length === 0
                ? "bg-admin-bg text-admin-muted"
                : Math.abs(parsed.sum - 100) <= 0.01
                  ? "bg-admin/10 text-admin"
                  : "bg-warn/15 text-warn"
            }`}
          >
            Total {parsed.sum}%
            {blueprint.items.length > 0 &&
              Math.abs(parsed.sum - 100) > 0.01 &&
              " — must be 100%"}
          </span>
        </div>

        {loadError && (
          <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {loadError}
          </p>
        )}
        {!loadError && chapters === null && (
          <p className="text-sm text-admin-muted">Loading chapters…</p>
        )}
        {chapters && chapters.length === 0 && (
          <p className="text-sm text-admin-muted">
            {subject.name} has no chapters yet. An administrator adds them in
            the Question Bank taxonomy.
          </p>
        )}
        {chapters && chapters.length > 0 && (
          <div className="max-h-72 overflow-auto rounded-lg border border-admin-line/60">
            <ul className="divide-y divide-admin-line/40">
              {chapters.map((c) => {
                const item = ticked.get(c.chapterId);
                const count = countFor(c.chapterId);
                const over = item ? count > c.approvedCount : false;
                const unavailable = c.approvedCount === 0 && !item;
                return (
                  <li
                    key={c.chapterId}
                    className="flex flex-wrap items-center gap-3 px-3 py-2"
                  >
                    <label
                      className={`flex min-w-0 flex-1 items-center gap-2 text-sm ${
                        unavailable
                          ? "cursor-not-allowed text-admin-subtle"
                          : "cursor-pointer text-admin-ink"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(item)}
                        disabled={unavailable}
                        onChange={() => toggle(c.chapterId)}
                        className="size-4 accent-admin"
                      />
                      <span className="truncate">{c.name}</span>
                      <span className="shrink-0 text-xs text-admin-subtle">
                        {c.approvedCount} approved
                      </span>
                    </label>
                    {item && (
                      <>
                        <label className="flex items-center gap-1 text-sm text-admin-muted">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="any"
                            aria-label={`${c.name} percentage`}
                            value={item.percent}
                            onChange={(e) =>
                              setPercent(c.chapterId, e.target.value)
                            }
                            className={`${smallInput} w-20 text-right`}
                          />
                          %
                        </label>
                        <span
                          className={`w-24 text-right text-sm tabular-nums ${
                            over
                              ? "font-semibold text-warn"
                              : "text-admin-muted"
                          }`}
                        >
                          {count} question{count === 1 ? "" : "s"}
                        </span>
                        {over && (
                          <span className="basis-full text-xs text-warn">
                            {c.name}: wanted {count}, only {c.approvedCount}{" "}
                            approved question
                            {c.approvedCount === 1 ? "" : "s"}.
                          </span>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void autoPick()}
            disabled={picking || parsed.problem !== null}
            title={parsed.problem ?? undefined}
            className="rounded-lg bg-admin px-5 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-40"
          >
            {picking
              ? "Picking…"
              : parsed.problem === null
                ? `Auto-pick ${parsed.total} question${parsed.total === 1 ? "" : "s"}`
                : "Auto-pick"}
          </button>
          {parsed.problem && (
            <span className="text-xs font-semibold text-admin-muted">
              {parsed.problem}
            </span>
          )}
        </div>
        <p className="-mt-2 text-xs text-admin-muted">
          Auto-pick chooses random approved questions, skipping any already used
          in another section. You can still remove or add questions below.
        </p>

        {pickError && (
          <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {pickError}
          </p>
        )}
        {lastPick && lastPick.shortfalls.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            {lastPick.shortfalls.map((s) => (
              <li key={s.chapterId}>
                {nameOf(s.chapterId)}: wanted {s.wanted}, only {s.available}{" "}
                approved question{s.available === 1 ? "" : "s"} available (not
                used in another section). Other chapters were not topped up.
              </li>
            ))}
          </ul>
        )}

        {comparison && questions.length > 0 ? (
          <BlueprintComparisonTable
            comparison={comparison}
            marksCorrect={marksCorrect}
          />
        ) : (
          comparison && (
            <p className="text-xs text-admin-muted">
              Target: {comparison.targetTotal} × +{marksCorrect} ={" "}
              {comparison.targetTotal * marksCorrect} marks. Auto-pick or add
              questions to compare against this target.
            </p>
          )
        )}
      </div>
    </div>
  );
}
