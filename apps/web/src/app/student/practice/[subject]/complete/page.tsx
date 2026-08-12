import { redirect } from "next/navigation";

/**
 * The session screen now renders its own summary once the last question is
 * answered, so this route only exists to catch old links/bookmarks.
 */
export default async function PracticeCompleteRedirect({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const { subject } = await params;
  redirect(`/student/practice/${subject}`);
}
