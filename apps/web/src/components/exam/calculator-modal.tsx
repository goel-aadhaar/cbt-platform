"use client";

import { useCallback, useEffect, useState } from "react";

import { CalculatorIcon } from "@/components/icons";

type Op = "+" | "−" | "×" | "÷";

function apply(a: number, op: Op, b: number): number {
  switch (op) {
    case "+":
      return a + b;
    case "−":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? NaN : a / b;
  }
}

/**
 * Standard 4-function on-screen calculator (§2.2 — the teacher's "Allow
 * calculator" toggle on exam creation had nothing to open: the button was
 * present but wired to nothing). Immediate-execution model, same as a
 * physical exam-hall calculator — no expression parsing, no memory.
 */
export function CalculatorModal({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState("0");
  const [pendingValue, setPendingValue] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<Op | null>(null);
  const [overwrite, setOverwrite] = useState(true);

  const dismiss = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  function inputDigit(d: string) {
    setDisplay((prev) => {
      if (overwrite) return d === "." ? "0." : d;
      if (d === "." && prev.includes(".")) return prev;
      if (prev.length >= 14) return prev;
      return prev === "0" && d !== "." ? d : prev + d;
    });
    setOverwrite(false);
  }

  function chooseOp(op: Op) {
    const value = parseFloat(display);
    if (pendingOp && !overwrite) {
      const result = apply(pendingValue ?? 0, pendingOp, value);
      setDisplay(formatResult(result));
      setPendingValue(result);
    } else {
      setPendingValue(value);
    }
    setPendingOp(op);
    setOverwrite(true);
  }

  function equals() {
    if (pendingOp === null) return;
    const value = parseFloat(display);
    const result = apply(pendingValue ?? 0, pendingOp, value);
    setDisplay(formatResult(result));
    setPendingValue(null);
    setPendingOp(null);
    setOverwrite(true);
  }

  function clear() {
    setDisplay("0");
    setPendingValue(null);
    setPendingOp(null);
    setOverwrite(true);
  }

  function backspace() {
    if (overwrite) return;
    setDisplay((prev) => (prev.length <= 1 ? "0" : prev.slice(0, -1) || "0"));
  }

  function toggleSign() {
    setDisplay((prev) =>
      prev.startsWith("-") ? prev.slice(1) : prev === "0" ? prev : "-" + prev,
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calculator-title"
    >
      <div className="w-full max-w-xs border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line bg-surface-2 px-5 py-3">
          <h2
            id="calculator-title"
            className="flex items-center gap-2 text-base font-bold uppercase text-ink"
          >
            <CalculatorIcon className="size-4 shrink-0" />
            Calculator
          </h2>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="text-sm font-semibold text-muted hover:text-ink"
          >
            Close
          </button>
        </div>

        <div className="px-5 pt-4">
          <div
            className="overflow-hidden text-ellipsis whitespace-nowrap border border-line bg-surface-2 px-3 py-4 text-right font-mono text-2xl text-ink"
            aria-live="polite"
          >
            {display}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5 p-5">
          <CalcBtn label="C" tone="muted" onClick={clear} />
          <CalcBtn label="±" tone="muted" onClick={toggleSign} />
          <CalcBtn label="⌫" tone="muted" onClick={backspace} />
          <CalcBtn label="÷" tone="op" onClick={() => chooseOp("÷")} />

          <CalcBtn label="7" onClick={() => inputDigit("7")} />
          <CalcBtn label="8" onClick={() => inputDigit("8")} />
          <CalcBtn label="9" onClick={() => inputDigit("9")} />
          <CalcBtn label="×" tone="op" onClick={() => chooseOp("×")} />

          <CalcBtn label="4" onClick={() => inputDigit("4")} />
          <CalcBtn label="5" onClick={() => inputDigit("5")} />
          <CalcBtn label="6" onClick={() => inputDigit("6")} />
          <CalcBtn label="−" tone="op" onClick={() => chooseOp("−")} />

          <CalcBtn label="1" onClick={() => inputDigit("1")} />
          <CalcBtn label="2" onClick={() => inputDigit("2")} />
          <CalcBtn label="3" onClick={() => inputDigit("3")} />
          <CalcBtn label="+" tone="op" onClick={() => chooseOp("+")} />

          <CalcBtn label="0" wide onClick={() => inputDigit("0")} />
          <CalcBtn label="." onClick={() => inputDigit(".")} />
          <CalcBtn label="=" tone="equals" onClick={equals} />
        </div>
      </div>
    </div>
  );
}

function formatResult(n: number): string {
  if (Number.isNaN(n)) return "Error";
  if (!Number.isFinite(n)) return "Error";
  // Trim float noise (0.1 + 0.2) without losing precision that matters.
  const rounded = Math.round(n * 1e10) / 1e10;
  return String(rounded);
}

function CalcBtn({
  label,
  onClick,
  tone = "digit",
  wide = false,
}: {
  label: string;
  onClick: () => void;
  tone?: "digit" | "muted" | "op" | "equals";
  wide?: boolean;
}) {
  const toneCls =
    tone === "equals"
      ? "bg-ink text-white hover:opacity-95"
      : tone === "op"
        ? "bg-surface-2 text-ink hover:bg-fill font-bold"
        : tone === "muted"
          ? "bg-surface-2 text-muted hover:bg-fill"
          : "bg-white text-ink border border-line hover:bg-fill";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${wide ? "col-span-2" : ""} px-3 py-3 text-base font-semibold ${toneCls}`}
    >
      {label}
    </button>
  );
}
