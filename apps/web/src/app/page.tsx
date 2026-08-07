import { redirect } from "next/navigation";

// The student portal opens on the login screen. Once a session/role router
// exists this can branch to the dashboard for an already-authenticated student.
export default function Home() {
  redirect("/login");
}
