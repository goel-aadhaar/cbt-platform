"use client";

import { useState } from "react";

import { ChevronDownIcon } from "@/components/admin/icons";

export interface Faq {
  q: string;
  a: string;
  category: string;
}

const SUPPORT_EMAIL = "hello@codonmind.in";

/**
 * Help & Support for a staff console.
 *
 * Renders the INNER content only — each console wraps it in its own shell, so
 * this never has to know which one it is inside.
 *
 * There is no ticketing backend on this platform, so the form opens a
 * pre-filled email to the real support address rather than showing a "ticket
 * created" confirmation that nothing received. Same decision the candidate
 * help screen made, and the reason the copy says so out loud.
 */
export function HelpAndSupport({
  faqs,
  categories,
  subjectTag,
}: {
  faqs: Faq[];
  categories: string[];
  /** Distinguishes which console a support email came from. */
  subjectTag: string;
}) {
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(faqs[0]?.q ?? null);
  const [ticketType, setTicketType] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const term = search.trim().toLowerCase();
  const visible = faqs.filter(
    (f) =>
      (category === "All" || f.category === category) &&
      (!term ||
        f.q.toLowerCase().includes(term) ||
        f.a.toLowerCase().includes(term)),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subject = `[${subjectTag}] ${ticketType || "General"} support request`;
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(description)}`;
    setSubmitted(true);
  }

  return (
    <>
      <div className="relative mb-6 max-w-3xl">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-admin-muted">
          ⌕
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search for answers..."
          className="h-12 w-full rounded-xl border border-admin-line bg-white pl-11 pr-4 text-sm outline-none focus:border-admin"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.7fr_1fr]">
        <section className="rounded-2xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
          <div className="mb-4 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  category === c
                    ? "bg-admin text-white"
                    : "bg-admin-bg text-admin-muted hover:text-admin-ink"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="divide-y divide-admin-line/40">
            {visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-admin-muted">
                No questions match that search.
              </p>
            ) : (
              visible.map((f) => {
                const expanded = open === f.q;
                return (
                  <div key={f.q} className="py-1">
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : f.q)}
                      aria-expanded={expanded}
                      className="flex w-full items-center justify-between gap-4 py-3 text-left"
                    >
                      <span className="font-semibold text-admin-ink">
                        {f.q}
                      </span>
                      <ChevronDownIcon
                        className={`size-4 shrink-0 text-admin-muted transition-transform ${
                          expanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {expanded && (
                      <p className="border-l-2 border-admin pb-4 pl-4 text-sm leading-relaxed text-admin-muted">
                        {f.a}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
            <h2 className="text-lg font-semibold text-admin-ink">
              Still need help?
            </h2>
            <div className="mt-4 space-y-3">
              <ContactRow
                icon="✉"
                title="Email Support"
                value={SUPPORT_EMAIL}
              />
              <ContactRow
                icon="☎"
                title="WhatsApp / Phone"
                value="+91 98765 43210"
              />
            </div>
            <p className="mt-3 rounded-lg bg-admin-bg px-3 py-2.5 text-xs text-admin-muted">
              ⓘ Typical response time: within 24 hours
            </p>
          </section>

          <section className="rounded-2xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
            <h2 className="text-lg font-semibold text-admin-ink">Email Us</h2>
            <p className="mt-1 text-xs text-admin-muted">
              There&apos;s no ticket tracker yet — this opens a pre-filled email
              to {SUPPORT_EMAIL} in your mail app.
            </p>
            {submitted ? (
              <p className="mt-4 rounded-lg bg-admin/[0.06] p-4 text-sm text-admin">
                ✓ Opened in your email app. Send it from there to reach us.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="ticket-type"
                    className="mb-1.5 block text-sm font-semibold text-admin-ink"
                  >
                    Category
                  </label>
                  <select
                    id="ticket-type"
                    value={ticketType}
                    onChange={(e) => setTicketType(e.target.value)}
                    required
                    className="h-11 w-full rounded-lg border border-admin-line bg-white px-3 text-sm outline-none focus:border-admin"
                  >
                    <option value="">Select a category…</option>
                    {categories
                      .filter((c) => c !== "All")
                      .map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="ticket-body"
                    className="mb-1.5 block text-sm font-semibold text-admin-ink"
                  >
                    What do you need help with?
                  </label>
                  <textarea
                    id="ticket-body"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    rows={5}
                    placeholder="Describe the problem, including the exam or student involved if relevant."
                    className="w-full rounded-lg border border-admin-line bg-white px-3 py-2 text-sm outline-none focus:border-admin"
                  />
                </div>
                <button
                  type="submit"
                  className="h-11 w-full rounded-lg bg-admin text-sm font-semibold text-white hover:opacity-95"
                >
                  Open email
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function ContactRow({
  icon,
  title,
  value,
}: {
  icon: string;
  title: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-admin-line/60 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-admin-surface text-admin">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-admin-ink">{title}</p>
        <p className="text-sm text-admin-muted">{value}</p>
      </div>
    </div>
  );
}
