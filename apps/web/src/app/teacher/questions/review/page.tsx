"use client";

import { Suspense } from "react";

import { ImportReview } from "@/components/admin/import-review";
import { TeacherShell } from "@/components/staff/teacher-shell";

/** Review what an upload created — check, fix and send for approval. */
export default function TeacherImportReviewPage() {
  return (
    <TeacherShell title="Review imported questions">
      <Suspense fallback={null}>
        <ImportReview role="TEACHER" />
      </Suspense>
    </TeacherShell>
  );
}
