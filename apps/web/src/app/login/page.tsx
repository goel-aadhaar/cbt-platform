import { Suspense } from "react";

import { LoginScreen } from "./login-screen";

/**
 * The single sign-in entry point for every role.
 *
 * LoginScreen reads ?as= to skip the audience picker when a guard bounced a
 * staff session here, and useSearchParams needs a Suspense boundary above it.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-white" />}>
      <LoginScreen />
    </Suspense>
  );
}
