import Image from "next/image";

import {
  type ExamMeta,
  type ExamQuestion,
  type QuestionStatus,
  type Subject,
} from "@/lib/exam-data";

import { PaletteSquare, statusLabel } from "./palette-square";

interface ExamSidebarProps {
  meta: ExamMeta;
  /** Formatted HH:MM:SS. */
  remaining: string;
  /** Highlight the timer red when time is running out. */
  timeLow: boolean;
  subject: Subject;
  onSubjectChange: (s: Subject) => void;
  /** Tab labels, in paper order — the exam's actual sections, not a fixed set. */
  subjects: Subject[];
  questions: ExamQuestion[];
  statuses: QuestionStatus[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function ExamSidebar({
  meta,
  remaining,
  timeLow,
  subject,
  onSubjectChange,
  subjects,
  questions,
  statuses,
  currentIndex,
  onSelect,
}: ExamSidebarProps) {
  // Global indices of the questions belonging to the active subject.
  const subjectIndices = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => q.subject === subject)
    .map(({ i }) => i);

  const count = (s: QuestionStatus) =>
    subjectIndices.filter((i) => statuses[i] === s).length;

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-line bg-surface-2">
      {/* Candidate info + timer */}
      <div className="border-b border-line bg-surface px-4 pb-4 pt-4">
        <div className="flex gap-4">
          <div className="size-16 shrink-0 overflow-hidden border border-line bg-fill">
            <Image
              src={meta.candidatePhoto}
              alt={meta.candidateName}
              width={64}
              height={64}
              className="size-full object-cover"
            />
          </div>
          <dl className="grid grid-cols-[64px_1fr] gap-x-2 text-xs leading-4">
            <dt className="font-semibold text-muted">Name:</dt>
            <dd className="font-bold text-ink">{meta.candidateName}</dd>
            <dt className="font-semibold text-muted">Exam:</dt>
            <dd className="font-semibold text-ink">{meta.examName}</dd>
            <dt className="font-semibold text-muted">Subject:</dt>
            <dd className="font-semibold text-ink">{meta.paper}</dd>
            <dt className="font-semibold text-muted">ID:</dt>
            <dd className="font-mono text-ink">{meta.candidateId}</dd>
          </dl>
        </div>
        <div className="mt-2 flex items-center justify-between border border-line bg-surface-3 p-[9px]">
          <span className="text-sm font-bold text-ink">Time Remaining:</span>
          <span
            className={`border px-[9px] py-[5px] text-xl font-bold tracking-[2px] ${
              timeLow
                ? "border-danger bg-danger/10 text-danger"
                : "border-line bg-surface text-brand"
            }`}
          >
            {remaining}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 border-b border-line bg-surface px-2 py-2 text-xs text-muted">
        <LegendItem status="not-visited" n={count("not-visited")} />
        <LegendItem status="not-answered" n={count("not-answered")} />
        <LegendItem status="answered" n={count("answered")} />
        <div className="col-span-2">
          <LegendItem
            status="marked"
            n={count("marked")}
            note="(will NOT be evaluated)"
          />
        </div>
        <div className="col-span-2">
          <LegendItem
            status="answered-marked"
            n={count("answered-marked")}
            note="(will be considered for evaluation)"
          />
        </div>
      </div>

      {/* Section tabs — hidden for a single-section paper, where they'd be noise. */}
      <div
        className={`flex border-b border-line bg-surface-3 ${
          subjects.length < 2 ? "hidden" : ""
        }`}
      >
        {subjects.map((s) => {
          const activeTab = s === subject;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onSubjectChange(s)}
              className={`flex-1 border-r border-line py-2 text-center text-xs last:border-r-0 ${
                activeTab
                  ? "bg-brand font-bold text-white"
                  : "font-semibold text-ink hover:bg-fill"
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* Question grid */}
      <div className="flex-1 overflow-auto bg-surface p-2">
        <p className="px-1 text-xs font-bold text-ink">Choose a Question</p>
        {/* Auto-fill rather than a fixed 5 columns: at 360px the old grid gave
            ~62px cells and five per row, so a 90-question paper meant a lot of
            scrolling. Sized to the widest realistic label (three digits) and
            packed as tightly as the panel allows — about eight per row. */}
        <div className="mt-2 grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(34px,1fr))]">
          {subjectIndices.map((globalIdx, localIdx) => (
            <PaletteSquare
              key={globalIdx}
              n={localIdx + 1}
              status={statuses[globalIdx]}
              active={globalIdx === currentIndex}
              onClick={() => onSelect(globalIdx)}
              className="text-xs"
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function LegendItem({
  status,
  n,
  note,
}: {
  status: QuestionStatus;
  n: number;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <PaletteSquare
        n={n}
        status={status}
        className="size-[30px] shrink-0 text-xs"
      />
      <span className="font-semibold leading-tight">
        {statusLabel(status)}
        {note && <span className="block text-[10px] text-subtle">{note}</span>}
      </span>
    </div>
  );
}
