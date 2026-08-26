"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Send } from "lucide-react";

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
      <div className="form-success">
        <span>
          <CheckCircle2 size={24} aria-hidden="true" />
        </span>
        <h3>Message sent</h3>
        <p>Thanks for reaching out — we&rsquo;ll get back to you shortly.</p>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={submit}>
      <div className="form-heading">
        <span>
          <Send size={19} aria-hidden="true" />
        </span>
        <h3>Contact Form</h3>
      </div>
      <label>
        <span>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          type="text"
          autoComplete="name"
          minLength={2}
          required
        />
      </label>
      <label>
        <span>Email</span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          required
        />
      </label>
      <label>
        <span>Organization / Institute</span>
        <input
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          type="text"
          autoComplete="organization"
          placeholder="Optional"
        />
      </label>
      <label>
        <span>Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          minLength={10}
          required
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button button-primary submit-button"
        type="submit"
        disabled={submitting}
      >
        {submitting ? "Sending…" : "Submit"}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
    </form>
  );
}
