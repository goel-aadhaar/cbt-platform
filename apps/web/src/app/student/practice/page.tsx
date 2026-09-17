import { redirect } from "next/navigation";

/**
 * Practice Library → DPP (§ Product Structure — old naming removed).
 *
 * The ad-hoc "pick a subject and pull curated questions" flow this route
 * used to serve no longer exists on the backend — DPP replaced it with
 * named, teacher-curated papers. Redirected rather than deleted so an old
 * bookmark or sidebar link still lands somewhere real instead of a 404.
 */
export default function PracticeLibraryRedirect() {
  redirect("/student/dpp");
}
