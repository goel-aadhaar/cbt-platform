import { redirect } from "next/navigation";

/**
 * My Assessments → Practice Test (§ Product Structure — old naming and
 * nesting removed). Practice Test is now a flat, top-level destination
 * rather than a child of "Self Assessment". Redirected rather than deleted
 * so an old bookmark or sidebar link still lands somewhere real.
 */
export default function MyAssessmentsRedirect() {
  redirect("/student/practice-test");
}
