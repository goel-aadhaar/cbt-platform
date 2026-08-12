import { redirect } from "next/navigation";

/** The superadmin console opens on the platform overview. */
export default function SuperadminHome() {
  redirect("/superadmin/dashboard");
}
