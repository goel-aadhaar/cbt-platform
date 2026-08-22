"use client";

import { useState } from "react";

import { StudentShell } from "@/components/student/student-shell";
import { ChevronDownIcon } from "@/components/student/icons";

const CATEGORIES = ["All", "Exams", "Account", "Technical"];

const FAQS = [
  {
    q: "How do I join a live mock test?",
    a: "To join a live mock test, navigate to the 'Exams' section from the sidebar. You will see a list of scheduled exams. Click the 'Join Now' button next to the active test exactly at the scheduled start time. Ensure you have a stable internet connection before starting.",
    category: "Exams",
  },
  {
    q: "Why is my result not showing?",
    a: "Results are published after the evaluation window closes. If a test you completed isn't visible under Performance Reports within 24 hours, email us and we'll look into it.",
    category: "Exams",
  },
  {
    q: "How do I reset my password?",
    a: "Passwords are managed by your institute. Contact your institute admin, or email us and we'll route the request.",
    category: "Account",
  },
  {
    q: "What are the system requirements for taking a test?",
    a: "A desktop or laptop with an up-to-date Chrome, Edge, or Firefox browser, a stable internet connection, and permission to enter fullscreen mode. Tablets are supported but not recommended for full mock tests.",
    category: "Technical",
  },
];

const SUPPORT_EMAIL = "hello@codonmind.in";

export default function StudentHelpPage() {
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(FAQS[0]?.q ?? null);
  const [ticketType, setTicketType] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const term = search.trim().toLowerCase();
  const visibleFaqs = FAQS.filter(
    (f) =>
      (category === "All" || f.category === category) &&
      (!term ||
        f.q.toLowerCase().includes(term) ||
        f.a.toLowerCase().includes(term)),
  );

  /**
   * There is no ticketing backend — this platform only has the direct
   * contact channels shown alongside the form. Rather than fake a "ticket
   * submitted" confirmation that goes nowhere, this opens a pre-filled email
   * to the real support address; the browser's own mail client sends it.
   */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subject = `[${ticketType || "General"}] Support request`;
    const body = description;
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSubmitted(true);
  }

  return (
    <StudentShell breadcrumb={["Help & Support"]}>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          Help &amp; Support
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          We&apos;re here whenever you need us
        </p>
      </header>

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
        {/* FAQ */}
        <section className="rounded-2xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
          <div className="mb-4 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
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
            {visibleFaqs.length === 0 ? (
              <p className="py-8 text-center text-sm text-admin-muted">
                No questions match that search.
              </p>
            ) : (
              visibleFaqs.map((f) => {
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

        {/* Right rail */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-admin-line/40 bg-white p-5 shadow-[0_4px_10px_rgba(0,0,0,0.04)]">
            <h2 className="text-lg font-semibold text-admin-ink">
              Still need help?
            </h2>
            <div className="mt-4 space-y-3">
              <ContactRow
                icon="✉"
                title="Email Support"
                value="hello@codonmind.in"
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
                  <div className="relative">
                    <select
                      id="ticket-type"
                      value={ticketType}
                      onChange={(e) => setTicketType(e.target.value)}
                      required
                      className="h-11 w-full appearance-none rounded-lg border border-admin-line bg-white px-3 pr-10 text-sm text-admin-ink outline-none focus:border-admin"
                    >
                      <option value="" disabled>
                        Select issue type...
                      </option>
                      <option>Exams</option>
                      <option>Account</option>
                      <option>Technical</option>
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-admin-muted" />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="ticket-desc"
                    className="mb-1.5 block text-sm font-semibold text-admin-ink"
                  >
                    Description
                  </label>
                  <textarea
                    id="ticket-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    rows={4}
                    placeholder="Please describe your issue in detail..."
                    className="w-full resize-none rounded-lg border border-admin-line bg-white px-3 py-2.5 text-sm text-admin-ink outline-none placeholder:text-admin-muted focus:border-admin"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-admin py-3 text-sm font-bold text-white hover:opacity-95"
                >
                  Open Email
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </StudentShell>
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
