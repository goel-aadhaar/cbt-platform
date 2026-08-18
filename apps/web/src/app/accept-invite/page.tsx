import { Suspense } from "react";

import { AcceptInviteScreen } from "./accept-invite-screen";

/**
 * Reads ?token= from the invite email's link, so useSearchParams needs a
 * Suspense boundary above it — same convention as /login.
 */
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <AcceptInviteScreen />
    </Suspense>
  );
}
