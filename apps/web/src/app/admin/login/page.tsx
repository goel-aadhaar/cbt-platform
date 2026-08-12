import { redirect } from "next/navigation";

/**
 * Staff sign-in moved into the single /login flow. This stays as a redirect so
 * bookmarks and anything still pointing at the old URL keep working, landing on
 * the staff branch rather than the audience picker.
 */
export default function AdminLoginPage() {
  redirect("/login?as=staff");
}
