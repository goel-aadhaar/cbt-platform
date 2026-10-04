/**
 * Technical-support contact shown on the sign-in screen.
 *
 * The one place to change it: the login footer reads these values and nothing
 * else. Set `email` to `null` to hide the email line.
 */
export const SUPPORT_CONTACT: {
  /** As displayed. The dial link is derived from it (digits and a leading +). */
  phone: string;
  hours: string;
  email: string | null;
} = {
  phone: "8414843028",
  hours: "10:00 AM to 6:00 PM",
  email: "hello@codonmind.in",
};

/** `tel:` href for a displayed number: "+91 84148-43028" → "tel:+918414843028". */
export function telHref(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}
