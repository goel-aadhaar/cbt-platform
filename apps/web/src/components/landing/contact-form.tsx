"use client";

import { useState } from "react";

import { submitContactForm } from "@/lib/contact";

/**
 * The public site's contact form (§ public site). Posts to `POST /contact`,
 * which emails the submission straight to CodonMind's inbox — there is no
 * form-response table to browse later, so a successful submit is the only
 * confirmation there ever is, and it has to be unambiguous.
 */
export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await submitContactForm({
        name: name.trim(),
        email: email.trim(),
        organization: organization.trim() || undefined,
        message: message.trim(),
      });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not send your message. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-site-line bg-white p-10 text-center">
        <p className="font-display text-[22px] text-site-ink">Message sent</p>
        <p className="text-[15px] leading-[1.6] text-site-muted">
          Thanks for reaching out — we&rsquo;ll get back to you shortly.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-5 rounded-3xl border border-site-line bg-white p-8 shadow-[0_8px_12px_rgba(15,23,42,0.03)]"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-site-ink">Name</span>
          <input
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="rounded-xl border border-site-line px-4 py-3 text-[14px] text-site-body outline-none focus:border-site-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-site-ink">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-xl border border-site-line px-4 py-3 text-[14px] text-site-body outline-none focus:border-site-accent"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-site-ink">
          Organization / Institute
        </span>
        <input
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          placeholder="Your institute's name (optional)"
          className="rounded-xl border border-site-line px-4 py-3 text-[14px] text-site-body outline-none focus:border-site-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-site-ink">Message</span>
        <textarea
          required
          minLength={10}
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us about your institute and what you're looking for."
          className="resize-none rounded-xl border border-site-line px-4 py-3 text-[14px] text-site-body outline-none focus:border-site-accent"
        />
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-[13px] text-danger"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex items-center justify-center rounded-full bg-site-ink px-7 py-3.5 text-[15px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Submit"}
      </button>
    </form>
  );
}
