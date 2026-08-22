import Link from "next/link";

import { StudentContextChips } from "./student-context-chips";
import { StudentSettingsMenu } from "./student-settings-menu";
import { StudentSidebar } from "./student-sidebar";
import { BellIcon } from "./icons";

/**
 * One step in the breadcrumb trail. A bare string is a label with nowhere to
 * go; give it an `href` to make it a way back to that page.
 */
export type Crumb = string | { label: string; href: string };

const crumbLabel = (c: Crumb) => (typeof c === "string" ? c : c.label);

/**
 * Shared layout for all /student/* screens: dark-green sidebar + a top app bar
 * with breadcrumb + context chips (program / class / batch) + quick actions.
 *
 * `breadcrumb` names the trail after "Student Portal". Pass an empty array on
 * the Home screen, where the greeting lives in the content instead.
 */
export function StudentShell({
  breadcrumb = [],
  children,
}: {
  breadcrumb?: Crumb[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-admin-bg text-admin-ink [font-family:var(--font-hanken)]">
      <StudentSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-admin-line bg-white px-6">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-sm"
          >
            <Link
              href="/student"
              className="font-semibold text-admin-muted hover:text-admin hover:underline"
            >
              Codonmind Nexus
            </Link>
            {breadcrumb.map((crumb, i) => {
              const label = crumbLabel(crumb);
              // The last crumb is the page you are on: a link to here would go
              // nowhere, so it stays plain text even when an href was given.
              const isCurrent = i === breadcrumb.length - 1;
              const href = typeof crumb === "string" ? null : crumb.href;
              return (
                <span key={label} className="flex items-center gap-2">
                  <span className="text-admin-line">/</span>
                  {isCurrent || !href ? (
                    <span
                      aria-current={isCurrent ? "page" : undefined}
                      className={
                        isCurrent
                          ? "font-bold text-admin-ink"
                          : "font-semibold text-admin-muted"
                      }
                    >
                      {label}
                    </span>
                  ) : (
                    <Link
                      href={href}
                      className="font-semibold text-admin-muted hover:text-admin hover:underline"
                    >
                      {label}
                    </Link>
                  )}
                </span>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 md:flex">
              <StudentContextChips />
            </div>
            {/*
              The red dot used to be painted unconditionally, so every candidate
              was told they had something unread from the moment they signed in.
              Nothing records whether an announcement has been read — there is
              no read-state anywhere in the schema — so the badge could only
              ever have been a decoration that lied. The bell now simply goes
              where its contents live.
            */}
            <Link
              href="/student/updates"
              aria-label="Updates and announcements"
              className="flex size-9 items-center justify-center rounded-full text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
            >
              <BellIcon className="size-5" />
            </Link>
            <StudentSettingsMenu />
          </div>
        </header>
        <main className="flex-1 overflow-auto px-6 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
