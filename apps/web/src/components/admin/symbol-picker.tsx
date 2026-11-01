"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { SYMBOL_GROUPS } from "@/lib/symbol-bank";

const PANEL_WIDTH = 344;
const PANEL_HEIGHT = 300;
const GUTTER = 8;

/**
 * Insert Symbol, like the one in Word or Google Docs.
 *
 * Rendered in a portal with fixed positioning because the author drawer's body
 * scrolls, which would clip an absolutely positioned panel. Every button keeps
 * the mouse from taking focus, so the editor's cursor stays where the author
 * left it and several symbols can go in one after another.
 */
export function SymbolPicker({
  onInsert,
  compact,
}: {
  onInsert: (symbol: string, keepPanelFocus: boolean) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState(SYMBOL_GROUPS[0].id);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Opened from the keyboard: focus has to move into the panel, or the symbols
  // cannot be reached at all. Opened by mouse it stays in the editor.
  const focusPanel = useRef(false);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(PANEL_WIDTH, window.innerWidth - GUTTER * 2);
    const left = Math.max(
      GUTTER,
      Math.min(rect.left, window.innerWidth - width - GUTTER),
    );
    // Below the whole field rather than the button, so the panel never covers
    // the line the symbols are going into.
    const field = triggerRef.current?.closest("[data-question-editor]");
    const below = (field?.getBoundingClientRect() ?? rect).bottom + 6;
    const top =
      below + PANEL_HEIGHT > window.innerHeight - GUTTER
        ? Math.max(GUTTER, rect.top - PANEL_HEIGHT - 6)
        : below;
    setPosition({ top, left, width });
  }, []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    if (focusPanel.current) {
      panelRef.current?.querySelector<HTMLElement>("[data-symbol]")?.focus();
    }
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        close(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close(focusPanel.current);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, close, place]);

  const group = SYMBOL_GROUPS.find((g) => g.id === groupId) ?? SYMBOL_GROUPS[0];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title="Insert symbol"
        aria-label="Insert symbol"
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          if (open) {
            close(false);
            return;
          }
          // `detail` is 0 for a click that came from the keyboard.
          focusPanel.current = e.detail === 0;
          place();
          setOpen(true);
        }}
        className={`flex items-center justify-center gap-1 rounded px-1.5 text-xs font-semibold ${
          compact ? "h-6" : "h-7"
        } ${
          open
            ? "bg-admin/15 text-admin"
            : "text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
        }`}
      >
        <span aria-hidden className="text-sm leading-none">
          Ω
        </span>
        {!compact && <span>Symbols</span>}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Insert symbol"
            style={position}
            className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-admin-line bg-white shadow-2xl [font-family:var(--font-hanken)]"
          >
            <div
              role="tablist"
              aria-label="Symbol groups"
              className="flex flex-wrap gap-1 border-b border-admin-line/60 p-1.5"
            >
              {SYMBOL_GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={g.id === group.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setGroupId(g.id)}
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    g.id === group.id
                      ? "bg-admin/15 text-admin"
                      : "text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              aria-label={group.label}
              className="grid max-h-56 grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1 overflow-y-auto p-2"
            >
              {group.symbols.map(([symbol, name]) => (
                <button
                  key={`${symbol}-${name}`}
                  type="button"
                  data-symbol
                  title={name}
                  aria-label={`Insert ${name}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    onInsert(
                      symbol,
                      !!panelRef.current?.contains(document.activeElement),
                    )
                  }
                  className="flex h-9 items-center justify-center rounded border border-admin-line/60 text-base text-admin-ink hover:border-admin hover:bg-admin-bg"
                >
                  {symbol}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
