"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { StudentShell } from "@/components/student/student-shell";
import {
  ArrowRightIcon,
  BookmarkIcon,
  ChevronLeftIcon,
  ClockIcon,
  LightbulbIcon,
  XCircleIcon,
} from "@/components/student/icons";

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type State = "your-answer" | "correct" | "plain";

const OPTIONS: { key: string; text: string; state: State }[] = [
  { key: "A", text: "mg cosθ", state: "your-answer" },
  { key: "B", text: "mg / cosθ", state: "correct" },
  { key: "C", text: "mg sinθ", state: "plain" },
  { key: "D", text: "mg", state: "plain" },
];

const TOTAL = 30;

export default function PracticeSessionPage() {
  const params = useParams<{ subject: string }>();
  const subject = params.subject ?? "physics";
  const subjectName = titleCase(subject);
  const [current, setCurrent] = useState(12);

  return (
    <StudentShell breadcrumb={["Practice Library", subjectName, "Set"]}>
      {/* Question header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.5px] text-admin-ink">
            Question {current} of {TOTAL}
          </h1>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex items-center gap-1 rounded-full bg-[#ba1a1a]/10 px-2.5 py-1 text-xs font-semibold text-[#ba1a1a]">
              <XCircleIcon className="size-3.5" /> Incorrect
            </span>
            <span className="flex items-center gap-1 text-xs text-admin-muted">
              <ClockIcon className="size-3.5" /> Time spent: 1m 45s
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <IconButton label="Bookmark">
            <BookmarkIcon className="size-5" />
          </IconButton>
          <IconButton label="History">
            <ClockIcon className="size-5" />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Question + options */}
        <section className="rounded-2xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
          <p className="text-base leading-relaxed text-admin-ink">
            A block of mass <Mono>m</Mono> is placed on a smooth inclined plane
            of inclination <Mono>θ</Mono>. The whole system is accelerated
            horizontally so that the block does not slip on the wedge. The force
            exerted by the wedge on the block will be:
          </p>

          <div className="mt-5 space-y-3">
            {OPTIONS.map((opt) => (
              <OptionRow key={opt.key} option={opt} />
            ))}
          </div>

          {/* Nav */}
          <div className="mt-6 flex items-center justify-between border-t border-admin-line/40 pt-4">
            <button
              type="button"
              onClick={() => setCurrent((c) => Math.max(1, c - 1))}
              className="flex items-center gap-1.5 rounded-lg border border-admin-line px-4 py-2 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-40"
              disabled={current <= 1}
            >
              <ChevronLeftIcon className="size-4" /> Previous
            </button>
            {current >= TOTAL ? (
              <Link
                href={`/student/practice/${subject}/complete`}
                className="flex items-center gap-1.5 rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:opacity-95"
              >
                Finish <ArrowRightIcon className="size-4" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setCurrent((c) => Math.min(TOTAL, c + 1))}
                className="flex items-center gap-1.5 rounded-lg bg-admin px-4 py-2 text-sm font-bold text-white hover:opacity-95"
              >
                Next Question <ArrowRightIcon className="size-4" />
              </button>
            )}
          </div>
        </section>

        {/* Explanation */}
        <aside className="overflow-hidden rounded-2xl border border-admin-line/40 bg-white shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
          <div className="bg-admin/[0.06] px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-bold text-admin-ink">
              <LightbulbIcon className="size-5 text-admin" />
              Detailed Explanation
            </h2>
          </div>
          <div className="space-y-4 p-5">
            <p className="text-sm leading-relaxed text-admin-muted">
              Since the block does not slip on the wedge, it has the same
              horizontal acceleration <Mono>a</Mono> as the wedge. Let&apos;s
              analyze the forces acting on the block in the frame of reference
              of the ground.
            </p>

            <div className="rounded-xl bg-admin-bg p-4">
              <p className="mb-3 text-xs font-semibold text-admin-muted">
                Solution Review
              </p>
              <InclineDiagram />
            </div>

            <Step
              title="Step 1: Free Body Diagram"
              body="The forces are weight (mg) downwards and Normal reaction (N) perpendicular to the incline."
            />
            <Step
              title="Step 2: Resolving Forces"
              body="Resolve N horizontally and vertically: Vertical: N cosθ = mg. Horizontal: N sinθ = ma."
            />
            <Step
              title="Conclusion"
              body="From the vertical equation, the force exerted by the wedge on the block (which is the Normal force N) is mg / cosθ."
            />
          </div>
        </aside>
      </div>
    </StudentShell>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-admin-bg px-1 py-0.5 text-[0.9em] text-admin-ink [font-family:var(--font-courier-prime)]">
      {children}
    </span>
  );
}

function OptionRow({
  option,
}: {
  option: { key: string; text: string; state: State };
}) {
  const isYour = option.state === "your-answer";
  const isCorrect = option.state === "correct";
  return (
    <div
      className={`relative flex items-center gap-3 rounded-xl border-2 px-4 py-4 ${
        isYour
          ? "border-[#ba1a1a] bg-[#ba1a1a]/[0.04]"
          : isCorrect
            ? "border-admin bg-admin/[0.04]"
            : "border-admin-line/60 bg-white"
      }`}
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          isYour
            ? "bg-[#ba1a1a] text-white"
            : isCorrect
              ? "bg-admin text-white"
              : "bg-admin-bg text-admin-muted"
        }`}
      >
        {option.key}
      </span>
      <span
        className={`flex-1 [font-family:var(--font-courier-prime)] ${
          option.state === "plain" ? "text-admin-muted" : "text-admin-ink"
        }`}
      >
        {option.text}
      </span>
      {isYour && (
        <>
          <span className="absolute -top-2.5 right-3 rounded bg-[#ba1a1a] px-1.5 py-0.5 text-[10px] font-bold text-white">
            Your Answer
          </span>
          <span className="text-[#ba1a1a]">✕</span>
        </>
      )}
      {isCorrect && (
        <>
          <span className="absolute -top-2.5 right-3 rounded bg-admin px-1.5 py-0.5 text-[10px] font-bold text-white">
            Correct Answer
          </span>
          <span className="text-admin">✓</span>
        </>
      )}
    </div>
  );
}

function Step({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-r-lg border-l-2 border-admin bg-admin-bg py-3 pl-4 pr-3">
      <p className="text-sm font-bold text-admin-ink">{title}</p>
      <p className="mt-0.5 text-sm text-admin-muted">{body}</p>
    </div>
  );
}

/** Simple inclined-plane free-body sketch (stands in for the Figma figure). */
function InclineDiagram() {
  return (
    <svg
      viewBox="0 0 260 150"
      className="h-auto w-full"
      role="img"
      aria-label="Inclined plane free-body diagram"
    >
      <line
        x1="20"
        y1="130"
        x2="240"
        y2="130"
        stroke="#3e4944"
        strokeWidth="2"
      />
      <polygon
        points="40,130 210,130 210,60"
        fill="#e1e3e4"
        stroke="#3e4944"
        strokeWidth="1.5"
      />
      {/* block */}
      <rect
        x="150"
        y="72"
        width="26"
        height="26"
        transform="rotate(-22 163 85)"
        fill="#bdc9c2"
        stroke="#3e4944"
        strokeWidth="1.5"
      />
      {/* Normal */}
      <line
        x1="163"
        y1="85"
        x2="140"
        y2="45"
        stroke="#006049"
        strokeWidth="2"
        markerEnd="url(#arrow-g)"
      />
      <text x="128" y="42" fill="#006049" fontSize="11" fontStyle="italic">
        N
      </text>
      {/* mg */}
      <line
        x1="163"
        y1="85"
        x2="163"
        y2="122"
        stroke="#006049"
        strokeWidth="2"
        markerEnd="url(#arrow-g)"
      />
      <text x="168" y="118" fill="#006049" fontSize="11" fontStyle="italic">
        mg
      </text>
      {/* angle */}
      <text x="60" y="126" fill="#3e4944" fontSize="11" fontStyle="italic">
        θ
      </text>
      <defs>
        <marker
          id="arrow-g"
          markerWidth="8"
          markerHeight="8"
          refX="4"
          refY="4"
          orient="auto"
        >
          <path d="M0 0 L8 4 L0 8 z" fill="#006049" />
        </marker>
      </defs>
    </svg>
  );
}

function IconButton({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-10 items-center justify-center rounded-lg border border-admin-line text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
    >
      {children}
    </button>
  );
}
