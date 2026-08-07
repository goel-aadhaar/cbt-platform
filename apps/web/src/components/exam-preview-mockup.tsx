import { TimerAlertIcon } from "./icons";

/**
 * Decorative isometric preview of the exam interface shown on the login screen's
 * right panel (Figma node 9:1855). Pure presentational markup — skewed/rotated
 * to sit at an angle. Marked aria-hidden since it carries no information.
 */
export function ExamPreviewMockup() {
  return (
    <div
      aria-hidden
      className="flex h-[563px] max-w-[672px] w-[976px] items-center justify-center"
    >
      <div className="[transform:skewX(-30deg)_rotate(30deg)_scaleY(0.87)]">
        <div className="flex h-[477px] w-[650px] flex-col overflow-hidden rounded border border-line bg-white p-px shadow-[-35px_25px_55px_-12px_rgba(0,0,0,0.5)]">
          {/* Header */}
          <div className="flex h-12 w-full items-center justify-between border-b border-line bg-surface px-4">
            <div className="flex items-start gap-4">
              <div className="h-4 w-24 rounded-[2px] bg-fill" />
              <div className="h-4 w-32 rounded-[2px] bg-fill" />
            </div>
            <div className="flex items-center gap-2 rounded-[2px] border border-danger/20 bg-[#ffdad6] px-3 py-[5px]">
              <TimerAlertIcon className="h-[14px] w-3 text-[#93000a]" />
              <span className="font-mono text-sm font-bold leading-5 text-[#93000a]">
                02:45:10
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-1">
            {/* Question area */}
            <div className="flex flex-1 flex-col gap-4 border-r border-line px-4 py-4">
              <div className="h-24 w-full rounded-[2px] border border-line bg-surface-2" />
              <div className="flex flex-col gap-2 pt-4">
                <Option filled="w-[286px]" />
                <Option selected filled="w-[254px]" />
                <Option filled="w-[305px]" />
                <Option filled="w-[190px]" />
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-line pt-4">
                <div className="h-8 w-24 rounded-[2px] border border-line bg-surface" />
                <div className="h-8 w-32 rounded-[2px] bg-brand" />
              </div>
            </div>

            {/* Question palette */}
            <div className="flex w-48 flex-col bg-white p-2">
              <div className="pb-4 pt-2">
                <div className="h-4 w-full rounded-[2px] bg-fill" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <PaletteSquare n={1} className="bg-success text-white" />
                <PaletteSquare n={2} className="bg-success text-white" />
                <PaletteSquare n={3} className="bg-[#ff9800] text-white" />
                <PaletteSquare n={4} className="bg-[#9c27b0] text-white" />
                <PaletteSquare
                  n={5}
                  className="border border-line bg-fill text-muted"
                />
                <PaletteSquare
                  n={6}
                  className="border border-line bg-fill text-muted"
                />
                <PaletteSquare
                  n={7}
                  className="border border-line bg-fill text-muted"
                />
                <PaletteSquare
                  n={8}
                  className="border border-line bg-fill text-muted"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Option({ filled, selected }: { filled: string; selected?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {selected ? (
        <span className="flex size-4 items-center justify-center rounded-full border border-brand bg-brand text-[10px] leading-none text-white">
          ●
        </span>
      ) : (
        <span className="size-4 rounded-full border border-subtle" />
      )}
      <span className={`h-4 rounded-[2px] bg-fill ${filled}`} />
    </div>
  );
}

function PaletteSquare({ n, className }: { n: number; className: string }) {
  return (
    <div
      className={`flex aspect-square items-center justify-center rounded-[2px] text-xs font-bold leading-4 ${className}`}
    >
      {n}
    </div>
  );
}
