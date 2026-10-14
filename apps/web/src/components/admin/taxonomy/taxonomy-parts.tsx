"use client";

import { useEffect, useRef, useState } from "react";

import {
  ArrowRightIcon,
  AtomIcon,
  BookOpenIcon,
  CheckIcon,
  FileIcon,
  FlaskIcon,
  GraduationCapIcon,
  HierarchyIcon,
  InfoIcon,
  LeafIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  TagIcon,
} from "../icons";
import { RowActionsMenu, type RowAction } from "../row-actions-menu";

export type Level = "class" | "subject" | "unit" | "chapter" | "topic";

export const LEVELS: Level[] = ["class", "subject", "unit", "chapter", "topic"];

export const LEVEL_LABEL: Record<Level, string> = {
  class: "Class",
  subject: "Subject",
  unit: "Unit",
  chapter: "Chapter",
  topic: "Topic",
};

const STEP_CAPTION: Record<Level, string> = {
  class: "Select the class",
  subject: "Add subjects under the class",
  unit: "Add units under the subject",
  chapter: "Add chapters under a unit",
  topic: "Add topics under a chapter",
};

const STRUCTURE_EXAMPLE: Record<Level, string> = {
  class: "Class 11",
  subject: "Biology",
  unit: "Human Physiology",
  chapter: "Respiratory System",
  topic: "Mechanism of Breathing",
};

export function LevelIcon({
  level,
  className,
}: {
  level: Level;
  className?: string;
}) {
  if (level === "class") return <GraduationCapIcon className={className} />;
  if (level === "subject") return <BookOpenIcon className={className} />;
  if (level === "unit") return <FileIcon className={className} />;
  if (level === "chapter") return <FileIcon className={className} />;
  return <TagIcon className={className} />;
}

export function SubjectIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const n = name.toLowerCase();
  if (n.includes("physic")) return <AtomIcon className={className} />;
  if (n.includes("chem")) return <FlaskIcon className={className} />;
  if (n.includes("bio") || n.includes("botan") || n.includes("zoolog")) {
    return <LeafIcon className={className} />;
  }
  return <BookOpenIcon className={className} />;
}

/* ---------------------------------------------------------------- *
 * Stepper                                                          *
 * ---------------------------------------------------------------- */

export function Stepper({
  current,
  onGoTo,
}: {
  /** 1-based step the admin is choosing from; earlier steps are complete. */
  current: number;
  onGoTo: (level: Level) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-admin-line/60 bg-white px-5 py-4">
      <ol className="flex min-w-[58rem] items-center gap-3">
        {LEVELS.map((level, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          const circle = (
            <span
              className={
                "flex size-11 shrink-0 items-center justify-center rounded-full text-base font-bold " +
                (done || active
                  ? "bg-admin text-white"
                  : "bg-admin-surface text-admin-subtle")
              }
            >
              {done ? <CheckIcon className="size-5" strokeWidth={3} /> : n}
            </span>
          );
          const text = (
            <span className="flex min-w-0 flex-col text-left">
              <span
                className={
                  "text-sm font-bold " +
                  (done || active ? "text-admin-ink" : "text-admin-subtle")
                }
              >
                {LEVEL_LABEL[level]}
              </span>
              <span className="text-xs text-admin-subtle">
                {STEP_CAPTION[level]}
              </span>
            </span>
          );
          return (
            <li key={level} className="contents">
              {done ? (
                <button
                  type="button"
                  onClick={() => onGoTo(level)}
                  className="flex shrink-0 items-center gap-3 rounded-xl hover:opacity-80"
                >
                  {circle}
                  {text}
                </button>
              ) : (
                <div
                  aria-current={active ? "step" : undefined}
                  className="flex shrink-0 items-center gap-3"
                >
                  {circle}
                  {text}
                </div>
              )}
              {n < LEVELS.length && (
                <span
                  aria-hidden
                  className={
                    "h-px min-w-6 flex-1 " +
                    (done ? "bg-admin" : "bg-admin-line")
                  }
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function StepHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-admin-muted">
      <InfoIcon className="size-4 shrink-0" />
      {children}
    </p>
  );
}

/* ---------------------------------------------------------------- *
 * Cards                                                            *
 * ---------------------------------------------------------------- */

export function CardShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={
        "rounded-2xl border border-admin-line/60 bg-white p-5 sm:p-6 " +
        className
      }
    >
      {children}
    </section>
  );
}

export function AddButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-admin px-4 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
    >
      <PlusIcon className="size-4" /> {label}
    </button>
  );
}

export function SearchBox({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-admin-line bg-white px-3.5 py-2.5 focus-within:border-admin">
      <SearchIcon className="size-4 shrink-0 text-admin-subtle" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-admin-ink outline-none placeholder:text-admin-subtle"
      />
    </label>
  );
}

export function ItemCard({
  icon,
  name,
  meta,
  selected,
  archived,
  busy,
  selectable = true,
  actions,
  onSelect,
}: {
  icon: React.ReactNode;
  name: string;
  meta?: string;
  selected?: boolean;
  archived?: boolean;
  busy?: boolean;
  selectable?: boolean;
  actions?: RowAction[];
  onSelect?: () => void;
}) {
  return (
    <li
      className={
        "flex items-center gap-1 rounded-xl border pr-2 transition-colors " +
        (selected
          ? "border-admin/40 bg-admin-mint/20"
          : "border-admin-line/60 bg-white hover:border-admin/40") +
        (archived ? " opacity-70" : "")
      }
    >
      <button
        type="button"
        disabled={!selectable || busy}
        aria-pressed={selectable ? !!selected : undefined}
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3.5 px-4 py-3.5 text-left disabled:cursor-default"
      >
        {selectable &&
          (selected ? (
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-admin text-white">
              <CheckIcon className="size-3.5" strokeWidth={3} />
            </span>
          ) : (
            <span
              aria-hidden
              className="size-6 shrink-0 rounded-full border-2 border-admin-line bg-white"
            />
          ))}
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-admin-surface text-admin-ink">
          {icon}
        </span>
        <span className="flex min-w-0 flex-col">
          <span
            className={
              "truncate text-sm font-bold text-admin-ink " +
              (archived ? "line-through" : "")
            }
          >
            {name}
            {archived && (
              <span className="ml-2 text-xs font-normal no-underline">
                (archived)
              </span>
            )}
          </span>
          {meta && (
            <span className="truncate text-xs text-admin-muted">{meta}</span>
          )}
        </span>
      </button>
      {actions && <RowActionsMenu actions={actions} />}
    </li>
  );
}

export function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[4.5rem] animate-pulse rounded-xl bg-admin-surface"
        />
      ))}
    </div>
  );
}

export function Illustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 140" fill="none" className={className} aria-hidden>
      <circle cx="80" cy="74" r="58" fill="#95f5d1" fillOpacity="0.22" />
      <path
        d="M126 22l5-8M134 30l9-4M122 14l1-7"
        stroke="#328675"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <g stroke="#006049" strokeWidth="2.5" strokeLinejoin="round">
        <path d="M44 98l36 10 40-10v10l-40 10-36-10z" fill="#ffffff" />
        <path d="M44 86l36 10 40-10v12l-40 10-36-10z" fill="#d9efe7" />
        <path d="M48 70l32 9 36-9v14l-36 10-32-10z" fill="#ffffff" />
        <path d="M54 52l28 8 30-8v14l-30 8-28-8z" fill="#d9efe7" />
        <path d="M54 52l28-8 30 8-30 8z" fill="#ffffff" />
      </g>
    </svg>
  );
}

export function EmptyState({
  title,
  caption,
  cta,
  onCta,
  disabled,
  children,
}: {
  title: string;
  caption: string;
  cta?: string;
  onCta?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <Illustration className="h-36 w-40" />
      <p className="mt-2 text-lg font-bold text-admin-ink">{title}</p>
      <p className="mt-1 text-sm text-admin-muted">{caption}</p>
      {cta && onCta && (
        <div className="mt-5">
          <AddButton label={cta} onClick={onCta} disabled={disabled} />
        </div>
      )}
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * Taxonomy Structure                                               *
 * ---------------------------------------------------------------- */

export function StructureCard({
  names,
  current,
}: {
  /** Selected name per level, "" while nothing is chosen there. */
  names: Record<Level, string>;
  current: number;
}) {
  return (
    <CardShell className="!p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-3 text-base font-bold text-admin-ink">
          <HierarchyIcon className="size-5 text-admin" />
          Taxonomy Structure
        </h2>
        <p className="text-xs text-admin-muted">
          Your questions will be organized in this hierarchy.
        </p>
      </div>
      <ol className="mt-4 grid grid-cols-1 items-center gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
        {LEVELS.map((level, i) => {
          const n = i + 1;
          const picked = names[level] !== "";
          const locked = n > current;
          return (
            <li key={level} className="contents">
              <div
                className={
                  "relative flex items-center gap-3 rounded-xl border px-4 py-3 " +
                  (picked
                    ? "border-admin/50 bg-admin-mint/20"
                    : locked
                      ? "border-admin-line/60 bg-admin-bg/60"
                      : "border-admin/50 bg-white")
                }
              >
                <LevelIcon
                  level={level}
                  className={
                    "size-6 shrink-0 " +
                    (locked ? "text-admin-subtle" : "text-admin")
                  }
                />
                <span className="flex min-w-0 flex-col">
                  <span
                    className={
                      "text-sm font-bold " +
                      (locked ? "text-admin-muted" : "text-admin-ink")
                    }
                  >
                    {LEVEL_LABEL[level]}
                  </span>
                  <span className="truncate text-xs text-admin-muted">
                    {picked ? names[level] : `e.g. ${STRUCTURE_EXAMPLE[level]}`}
                  </span>
                </span>
                {picked ? (
                  <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-admin text-white">
                    <CheckIcon className="size-3" strokeWidth={3} />
                  </span>
                ) : locked ? (
                  <LockIcon
                    aria-label="Locked"
                    className="absolute right-3 top-3 size-4 text-admin-subtle"
                  />
                ) : null}
              </div>
              {n < LEVELS.length && (
                <ArrowRightIcon
                  aria-hidden
                  className="mx-auto hidden size-5 text-admin-subtle xl:block"
                />
              )}
            </li>
          );
        })}
      </ol>
    </CardShell>
  );
}

/* ---------------------------------------------------------------- *
 * Modals                                                           *
 * ---------------------------------------------------------------- */

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-bold text-admin-ink">{title}</p>
        {subtitle && (
          <p className="mt-1 text-xs text-admin-muted">{subtitle}</p>
        )}
        {children}
      </div>
    </div>
  );
}

function errorText(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

/** Add / rename form. `onSubmit` throws to surface a server message inline. */
export function NameModal({
  title,
  subtitle,
  label,
  placeholder,
  initial = "",
  context,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  label: string;
  placeholder?: string;
  initial?: string;
  /** A fixed, read-only line shown above the field, e.g. the parent class. */
  context?: { label: string; value: string };
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (trimmed === initial) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(errorText(err, "Could not save that name."));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={busy ? () => {} : onClose}
    >
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        {context && (
          <p className="flex items-baseline gap-2 rounded-lg bg-admin-surface px-3 py-2.5 text-sm">
            <span className="text-xs font-bold text-admin-muted">
              {context.label}
            </span>
            <span className="min-w-0 truncate font-semibold text-admin-ink">
              {context.value}
            </span>
          </p>
        )}
        <label className="flex flex-col gap-1.5 text-xs font-bold text-admin-muted">
          {label}
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            maxLength={120}
            className="rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm font-normal text-admin-ink outline-none focus:border-admin"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-admin-line px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
          >
            {busy ? "Saving…" : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export interface MoveChoice {
  id: string;
  label: string;
}

/**
 * Generic "Move to ..." picker. `noneLabel` adds a "no parent" option (shown
 * only while the item currently has a parent) that submits `null`.
 */
export function MoveModal({
  title,
  subtitle,
  selectLabel,
  placeholder,
  noneLabel,
  currentId,
  options,
  errorFallback,
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  selectLabel: string;
  placeholder: string;
  noneLabel: string;
  currentId: string | null;
  options: MoveChoice[];
  errorFallback: string;
  onClose: () => void;
  onSubmit: (targetId: string | null) => Promise<void>;
}) {
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(target === NO_PARENT ? null : target);
    } catch (err) {
      setError(errorText(err, errorFallback));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={busy ? () => {} : onClose}
    >
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <select
          autoFocus
          aria-label={selectLabel}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm text-admin-ink outline-none focus:border-admin"
        >
          <option value="">{placeholder}</option>
          {currentId && <option value={NO_PARENT}>{noneLabel}</option>}
          {options
            .filter((o) => o.id !== currentId)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
        </select>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-admin-line px-4 py-2.5 text-sm font-semibold text-admin-ink hover:bg-admin-bg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !target}
            className="rounded-lg bg-admin px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
          >
            {busy ? "Moving…" : "Move"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const NO_PARENT = "__none__";
