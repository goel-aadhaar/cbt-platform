import { redirect } from "next/navigation";

/** The teacher console opens on the dashboard. */
export default function TeacherHome() {
  redirect("/teacher/dashboard");
}
