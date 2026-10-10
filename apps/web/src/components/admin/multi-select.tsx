"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Compact checkbox dropdown for filter bars — a native <select multiple>
 * needs ctrl-click and reads badly in a toolbar. The button sits at the same
 * height as the sibling <select> filters and highlights once something is
 * picked.
 */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isDisabled = disabled || options.length === 0;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.filter((o) => value.includes(o.id));
  const summary =
    selected.length === 0
      ? "All"
      : selected.length === 1
        ? selected[0].name
        : `${selected.length} selected`;

  const toggle = (id: string) =>
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
    );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open && !isDisabled}
        disabled={isDisabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-10 max-w-[220px] items-center gap-1 rounded-lg border px-2.5 text-sm outline-none focus:border-admin disabled:opacity-40 ${
          selected.length > 0
            ? "border-admin bg-admin/5 font-semibold text-admin"
            : "border-admin-line bg-white text-admin-ink"
        }`}
      >
        <span className="truncate">
          {label}: {summary}
        </span>
        <span aria-hidden className="text-[10px] text-admin-subtle">
          ▾
        </span>
      </button>

      {open && !isDisabled && (
        <div
          role="listbox"
          aria-label={label}
          aria-multiselectable
          className="absolute left-0 top-full z-30 mt-1 flex max-h-72 min-w-[220px] max-w-[320px] flex-col overflow-hidden rounded-lg border border-admin-line bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-admin-line/60 px-3 py-1.5 text-xs">
            <span className="font-semibold text-admin-muted">
              {selected.length} of {options.length} selected
            </span>
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => onChange([])}
              className="font-semibold text-admin-2 hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Clear
            </button>
          </div>
          <ul className="overflow-auto py-1">
            {options.map((o) => {
              const checked = value.includes(o.id);
              return (
                <li key={o.id} role="option" aria-selected={checked}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-admin-ink hover:bg-admin-bg">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.id)}
                      className="size-4 accent-[var(--color-admin,#2563eb)]"
                    />
                    <span className="truncate">{o.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
