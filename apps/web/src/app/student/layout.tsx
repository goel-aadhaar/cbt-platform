import { AuthGate } from "@/components/auth-gate";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGate>{children}</AuthGate>;
}
