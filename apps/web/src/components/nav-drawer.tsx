"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

/**
 * Turns a console's permanent sidebar into an off-canvas drawer on small
 * screens, without a second copy of the navigation.
 *
 * The three consoles (admin, staff, student) each own a sidebar that is 264-280px
 * wide and `shrink-0`. That is right on a desktop and unusable on a phone,
 * where it leaves roughly 80px for the page itself. The obvious fix — render a
 * separate mobile menu — would mean two navigations to keep in step, and they
 * only stay in step until someone edits one.
 *
 * So the SAME <aside> is reused: `sidebarPanelClass` switches it from a static
 * flex child at `lg` and up to a fixed, translated panel below that. Desktop
 * markup and appearance are untouched; the element simply changes how it is
 * positioned.
 *
 * Usage — wrap the shell, spread the class onto the existing aside, and drop
 * the toggle into the header:
 *
 *     <NavDrawerProvider>
 *       <aside className={`${sidebarPanelClass} …existing classes`}>
 *       <NavDrawerToggle />
 *     </NavDrawerProvider>
 */

interface NavDrawerValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const NavDrawerContext = createContext<NavDrawerValue | null>(null);

function useNavDrawer(): NavDrawerValue {
  const ctx = useContext(NavDrawerContext);
  // A toggle rendered outside the provider would silently do nothing, which is
  // the kind of bug that only shows up on a phone. Fail loudly instead.
  if (!ctx) {
    throw new Error("NavDrawer components must be inside <NavDrawerProvider>");
  }
  return ctx;
}

/**
 * Positioning for the sidebar element itself.
 *
 * Every off-canvas rule is written under `max-lg:`, so at `lg` and up those
 * declarations are not merely overridden — they are never emitted for that
 * viewport at all, and the sidebar is the ordinary static flex child it has
 * always been.
 *
 * The first attempt paired unprefixed `data-[open=false]:-translate-x-full`
 * with `lg:translate-x-0` to undo it. Both are single-class utilities of equal
 * specificity, so which one wins comes down to the order Tailwind happens to
 * emit them in — and the data-attribute variant sorted last, leaving the
 * DESKTOP sidebar translated 280px off the left edge. Scoping the rules to the
 * breakpoint removes the contest instead of trying to win it.
 *
 * `-translate-x-full` rather than `hidden` keeps the panel in the DOM and in
 * the tab order's natural place, and gives the open/close a real transition.
 * It is paired with `invisible` when closed so the off-screen links cannot be
 * reached by keyboard or announced by a screen reader while hidden.
 */
export const sidebarPanelClass =
  "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 " +
  "max-lg:transition-transform max-lg:duration-200 max-lg:ease-out " +
  "max-lg:data-[open=false]:invisible max-lg:data-[open=false]:-translate-x-full " +
  "max-lg:data-[open=true]:visible max-lg:data-[open=true]:translate-x-0";

export function NavDrawerProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  /**
   * Tapping a nav link should navigate AND close. Rather than wiring an
   * onClick onto every link in three sidebars — or resetting state from an
   * effect, which renders the drawer open for a frame before closing it — the
   * open state records WHICH route it was opened on. Any navigation therefore
   * makes it closed by derivation, with no second render.
   */
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn !== null && openedOn === pathname;

  const setOpen = useCallback(
    (next: boolean) => setOpenedOn(next ? pathname : null),
    [pathname],
  );

  /* Escape closes, matching every other dismissible surface in the app. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  /**
   * Stop the page behind the drawer from scrolling under it. Only while open
   * and only below `lg` — at desktop widths the drawer is never open, but a
   * viewport can cross the breakpoint while it is, so the class is applied to
   * <body> and removed on cleanup rather than being left to a media query.
   */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <NavDrawerContext.Provider value={{ open, setOpen }}>
      {children}
    </NavDrawerContext.Provider>
  );
}

/**
 * The dimmed backdrop. Rendered by the shell as a sibling of the sidebar so it
 * sits under the panel (z-40) and over the content.
 */
export function NavDrawerBackdrop() {
  const { open, setOpen } = useNavDrawer();
  return (
    <div
      // Not a <button>: it is a dismiss affordance, not a control anyone should
      // land on while tabbing. Escape and the in-panel close button are the
      // keyboard routes out.
      aria-hidden
      onClick={() => setOpen(false)}
      data-open={open}
      className={
        "fixed inset-0 z-40 bg-admin-ink/50 transition-opacity duration-200 lg:hidden " +
        (open ? "opacity-100" : "pointer-events-none invisible opacity-0")
      }
    />
  );
}

/** Hamburger for the header. Hidden once the sidebar is permanent. */
export function NavDrawerToggle({ className = "" }: { className?: string }) {
  const { open, setOpen } = useNavDrawer();
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls="app-sidebar"
      aria-label={open ? "Close navigation menu" : "Open navigation menu"}
      className={
        "-ml-1 flex size-10 shrink-0 items-center justify-center rounded-lg " +
        "hover:bg-black/5 lg:hidden " +
        className
      }
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className="size-6"
        aria-hidden
      >
        <path d="M3 6h18M3 12h18M3 18h18" />
      </svg>
    </button>
  );
}

/**
 * Close button that lives INSIDE the drawer panel.
 *
 * The hamburger is behind the backdrop once the drawer is open, so without
 * this there is no visible way back out on a touch device — only Escape, which
 * a phone has no key for.
 */
export function NavDrawerClose({ className = "" }: { className?: string }) {
  const { open, setOpen } = useNavDrawer();
  const ref = useRef<HTMLButtonElement>(null);

  /**
   * Move focus into the panel when it opens so the keyboard follows the eye,
   * and so the next Tab walks the navigation rather than resuming behind the
   * backdrop.
   */
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => setOpen(false)}
      aria-label="Close navigation menu"
      className={
        "flex size-9 items-center justify-center rounded-lg hover:bg-black/10 lg:hidden " +
        className
      }
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className="size-5"
        aria-hidden
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

/**
 * `aria-hidden` for the sidebar while it is closed on mobile, so its links are
 * not announced from off-screen — but never at desktop widths, where it is
 * visible and must stay in the accessibility tree.
 */
export function useSidebarAriaHidden(): boolean {
  const { open } = useNavDrawer();
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    // Matches Tailwind's `lg`. Read once and on change rather than on resize,
    // which fires continuously while a window is dragged.
    const mq = window.matchMedia("(min-width: 64rem)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return !isDesktop && !open;
}

export { useNavDrawer };
