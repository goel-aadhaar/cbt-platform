/**
 * Public contact form client — mirrors `apps/api/src/modules/contact`.
 * No authentication: a visitor filling this out is, by definition, not yet
 * signed in to anything.
 */

import { apiFetch } from "./api";

export interface ContactMessage {
  name: string;
  email: string;
  organization?: string;
  message: string;
}

/** POST /contact — delivers the message to CodonMind's inbox. */
export function submitContactForm(
  body: ContactMessage,
): Promise<{ received: true }> {
  return apiFetch("/contact", { method: "POST", body });
}
