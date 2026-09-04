"use client";

import { useEffect, useMemo, useState } from "react";

import { type BatchOption } from "@/components/batch-picker";
import { useOrgCatalogue } from "@/hooks/use-org-catalogue";
import {
  listBatches,
  listClasses,
  listPrograms,
  type BatchRow,
  type ClassRow,
  type Program,
} from "@/lib/admin";

/**
 * Programme → class → batch, in the one place every screen can share.
 *
 * The names are only unique within their parent — `@@unique([programId, name])`
 * on a class, `@@unique([classId, name])` on a batch — so two programmes can
 * each own a "Class 12" and each of those a "23b1". Anywhere that offers a flat
 * list of batches is therefore asking an administrator to pick between
 * identically-labelled options, and the consequences are not cosmetic: the
 * wrong batch on an exam sends a paper to the wrong cohort, and the wrong batch
 * on a roster import enrols a whole year group into someone else's programme.
 *
 * Two shapes are needed, because the screens differ:
 *  - `useAcademicCascade` for the single-select case, where narrowing by
 *    programme and class is how you find the one batch you mean.
 *  - `useBatchPaths` for the multi-select case, where a checkbox list has to
 *    stay a checkbox list; there each batch is labelled with its full path
 *    instead, which disambiguates without taking the list apart.
 */

/** One step of the cascade. */
export function Picker({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: { id: string; name: string }[];
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-semibold text-admin-ink">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm outline-none focus:border-admin disabled:cursor-not-allowed disabled:bg-admin-bg disabled:text-admin-muted"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface AcademicCascade {
  programs: Program[];
  classes: ClassRow[];
  batches: BatchRow[];
  programId: string;
  classId: string;
  batchId: string;
  setBatchId: (id: string) => void;
  pickProgram: (id: string) => void;
  pickClass: (id: string) => void;
  /** Placeholders that say whether a level is empty or merely locked. */
  programPlaceholder: string;
  classPlaceholder: string;
  batchPlaceholder: string;
  /** Restore the whole cascade to nothing chosen. */
  clear: () => void;
  error: string | null;
}

/**
 * The single-select cascade: each level loads only once its parent is chosen.
 *
 * `active` gates the requests so a closed drawer is not fetching catalogues.
 */
export function useAcademicCascade(active: boolean): AcademicCascade {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [programId, setProgramId] = useState("");
  const [classId, setClassId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    listPrograms()
      .then((p) => !cancelled && setPrograms(p))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load programs."),
      );
    return () => {
      cancelled = true;
    };
  }, [active]);

  // The cleanup matters: on a quick change of mind the earlier request must not
  // land after the later one and repopulate the list from the wrong parent.
  useEffect(() => {
    if (!active || !programId) return;
    let cancelled = false;
    listClasses(programId)
      .then((c) => !cancelled && setClasses(c))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load classes."),
      );
    return () => {
      cancelled = true;
    };
  }, [active, programId]);

  useEffect(() => {
    if (!active || !classId) return;
    let cancelled = false;
    listBatches(classId)
      .then((b) => !cancelled && setBatches(b))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load batches."),
      );
    return () => {
      cancelled = true;
    };
  }, [active, classId]);

  /**
   * Choosing a parent invalidates everything under it.
   *
   * Cleared in the handler rather than from an effect: an id belonging to the
   * previous programme must never survive into a render, however briefly,
   * because that id is what the screen would submit.
   */
  function pickProgram(id: string) {
    setProgramId(id);
    setClasses([]);
    setClassId("");
    setBatches([]);
    setBatchId("");
  }

  function pickClass(id: string) {
    setClassId(id);
    setBatches([]);
    setBatchId("");
  }

  return {
    programs,
    classes,
    batches,
    programId,
    classId,
    batchId,
    setBatchId,
    pickProgram,
    pickClass,
    programPlaceholder:
      programs.length === 0 ? "No programs yet" : "Select program",
    classPlaceholder: !programId
      ? "Choose a program first"
      : classes.length === 0
        ? "No classes in this program"
        : "Select class",
    batchPlaceholder: !classId
      ? "Choose a class first"
      : batches.length === 0
        ? "No batches in this class"
        : "Select batch",
    clear: () => {
      setProgramId("");
      setClassId("");
      setClasses([]);
      setBatches([]);
      setBatchId("");
    },
    error,
  };
}

/**
 * Full paths for a flat batch list — "Jee › Class 12 › 23b1".
 *
 * For the multi-select screens, where turning a checkbox list into a cascade
 * would be the wrong trade: assigning a teacher to four batches across two
 * classes is a normal thing to do, and a cascade makes it four separate
 * journeys. Labelling each row with where it sits removes the ambiguity while
 * leaving the list intact.
 *
 * Falls back to the bare name if the parents cannot be resolved, which is
 * better than rendering "undefined › undefined › 23b1".
 *
 * Backed by the shared org catalogue (§ duplicate-fetch fix) — six call
 * sites (this drawer, the exam scheduler, the exam builder, the staff roster
 * and its drawers, admin announcements) each used to run their own
 * `listPrograms()`+`listClasses()` on mount; now they all read the one
 * shared cache. `active` is kept for API compatibility with those call sites
 * but no longer gates a fetch of its own.
 */
export function useBatchPaths(active: boolean): {
  path: (batch: { id: string; name: string; classId: string }) => string;
  loaded: boolean;
} {
  void active;
  const catalogue = useOrgCatalogue();

  const byId = useMemo(() => {
    const classById = new Map((catalogue?.classes ?? []).map((c) => [c.id, c]));
    const programById = new Map(
      (catalogue?.programs ?? []).map((p) => [p.id, p]),
    );
    return { classById, programById };
  }, [catalogue]);

  return {
    loaded: (catalogue?.classes.length ?? 0) > 0,
    path: (batch) => {
      const cls = byId.classById.get(batch.classId);
      const program = cls ? byId.programById.get(cls.programId) : undefined;
      if (!cls || !program) return batch.name;
      return `${program.name} › ${cls.name} › ${batch.name}`;
    },
  };
}

/**
 * Admin-side batches as {@link BatchOption}s, with their program and class
 * resolved from the shared catalogue.
 *
 * The teacher-side equivalent needs no hook: `/staff/me/batches` returns the
 * path on each row, because `/programs` and `/classes` are ADMIN-only and a
 * teacher could never join them here.
 */
export function useBatchOptions(batches: BatchRow[]): BatchOption[] {
  const catalogue = useOrgCatalogue();

  return useMemo(() => {
    const classById = new Map((catalogue?.classes ?? []).map((c) => [c.id, c]));
    const programById = new Map(
      (catalogue?.programs ?? []).map((p) => [p.id, p]),
    );
    return batches.map((b) => {
      const cls = classById.get(b.classId);
      const program = cls ? programById.get(cls.programId) : undefined;
      return {
        id: b.id,
        name: b.name,
        classId: b.classId,
        className: cls?.name ?? null,
        programId: program?.id ?? null,
        programName: program?.name ?? null,
      };
    });
  }, [batches, catalogue]);
}
