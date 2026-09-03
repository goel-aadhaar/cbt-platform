"use client";

import { ResourceBrowser } from "@/components/resources/resource-browser";
import { StudentShell } from "@/components/student/student-shell";

/**
 * Study material shared with this candidate's batch (§2.12).
 *
 * Navigated Subject > Chapter > Resource — the same component the teacher
 * console uses, because the browsing is identical and the server has already
 * decided what this student may see. Nothing here filters by batch: there is
 * no batch parameter to send, which is what makes another batch's material
 * unreachable rather than merely hidden.
 *
 * No actions passed, so no edit or delete controls render.
 */
export default function StudentResourcesPage() {
  return (
    <StudentShell breadcrumb={["Resources"]}>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          Resources
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          Notes, papers and lecture videos your teachers have shared.
        </p>
      </header>

      <ResourceBrowser emptyMessage="Nothing shared yet. Material your teachers upload will appear here." />
    </StudentShell>
  );
}
