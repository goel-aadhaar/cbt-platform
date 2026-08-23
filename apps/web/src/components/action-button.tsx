"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { LoadingSpinner } from "@/components/loading-spinner";

/**
 * A button that says when it is working.
 *
 * Deliberately carries NO styling of its own. This app has 300-odd buttons in
 * a dozen shapes — filled, outline, danger, icon-only, link-like — and none of
 * them come from a shared component. A Button that imposed a look would mean
 * restyling every call site, which is a redesign, not the interaction fix this
 * is. So `className` passes straight through and each site keeps exactly the
 * appearance it has today; all this adds is the behaviour:
 *
 *  - swaps the label for `loadingText` while working, so the feedback names the
 *    action ("Saving…") instead of a generic "Loading…";
 *  - shows the platform spinner, tinted to inherit the button's own text colour
 *    so it reads on a filled background;
 *  - disables itself, which both prevents the second click and greys the
 *    control so the state is visible without reading;
 *  - sets `aria-busy`, because a screen reader gets nothing from a spinner;
 *  - holds its width steady, so a row of buttons does not jump when one of them
 *    grows from "Save" to "Saving…".
 *
 * The caller still owns the async work. `loading` should be wired to real
 * promise state — `useAsyncAction`'s `pending` — never to a timer.
 */
export interface ActionButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  loading?: boolean;
  /**
   * What to say while working. Name the action in progress: "Saving…",
   * "Deleting…", "Signing in…". Omit it on an icon-only button, where the
   * spinner replaces the icon and there is no room for words.
   */
  loadingText?: string;
  children: ReactNode;
  /** Spinner size in px. Defaults to something that sits on one text line. */
  spinnerSize?: number;
}

export function ActionButton({
  loading = false,
  loadingText,
  children,
  spinnerSize = 14,
  disabled,
  className = "",
  type = "button",
  ...rest
}: ActionButtonProps) {
  const label = loading && loadingText ? loadingText : children;

  return (
    <button
      {...rest}
      type={type}
      // Disabled while loading regardless of what the caller passed, so a
      // second click cannot start a second request.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={className}
      style={{
        // Keeps the label from collapsing the button as text changes width.
        // `min-width` rather than a fixed width: a button that is already wide
        // enough is untouched, and one that would shrink cannot.
        ...(loading ? { minWidth: "var(--action-button-w, auto)" } : null),
        ...rest.style,
      }}
      ref={(node) => {
        // Record the resting width once, before the label ever changes, and
        // pin it only while loading. Measuring at click time would be too late
        // — the label has already been swapped by then.
        if (node && !loading) {
          const w = node.getBoundingClientRect().width;
          if (w > 0) node.style.setProperty("--action-button-w", `${w}px`);
        }
      }}
    >
      {loading && (
        <LoadingSpinner
          size={spinnerSize}
          tone="current"
          // The visible text already says what is happening; announcing
          // "Loading" as well would have a screen reader say it twice.
          label={loadingText ? "" : "Working"}
          className="shrink-0"
        />
      )}
      {label}
    </button>
  );
}
