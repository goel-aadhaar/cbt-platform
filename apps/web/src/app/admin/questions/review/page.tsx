"use client";

import { Suspense } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { ImportReview } from "@/components/admin/import-review";

/** Review what an upload created — check, fix and approve before publishing. */
export default function AdminImportReviewPage() {
  return (
    <AdminShell title="Review imported questions">
      <Suspense fallback={null}>
        <ImportReview role="ADMIN" />
      </Suspense>
    </AdminShell>
  );
}
