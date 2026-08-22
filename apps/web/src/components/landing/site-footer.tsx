import Image from "next/image";
import Link from "next/link";

/**
 * Public site footer (Figma 6:224).
 *
 * The design draws five columns of links but names no destinations for most of
 * them, because most of those pages do not exist yet. Rather than render three
 * dozen anchors that go nowhere, an entry becomes a link only when it has
 * somewhere to go — "Login" and the on-page sections — and the rest are plain
 * text. They look identical; the difference is that nothing here lies about
 * being clickable. Give any of them a real route and it becomes a link by
 * adding one `href`.
 */
interface FooterItem {
  label: string;
  href?: string;
}

const COLUMNS: { title: string; items: FooterItem[] }[] = [
  {
    title: "Platform",
    items: [
      { label: "Overview", href: "#platform" },
      { label: "Features", href: "#features" },
      { label: "Security" },
      { label: "Integrations", href: "#solutions" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    title: "Solutions",
    items: [
      { label: "Schools" },
      { label: "Colleges" },
      { label: "Coaching Centers" },
      { label: "Universities" },
      { label: "Training Institutes" },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Blog" },
      { label: "Help Center" },
      { label: "Webinars" },
      { label: "Case Studies" },
      { label: "Documentation" },
    ],
  },
  {
    title: "Company",
    items: [
      { label: "About Us" },
      { label: "Careers" },
      { label: "News" },
      { label: "Contact Us" },
    ],
  },
  {
    title: "Support",
    items: [
      { label: "Login", href: "/login" },
      { label: "Status" },
      { label: "Privacy Policy" },
      { label: "Terms of Service" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="w-full border-t border-site-ink-2 bg-site-ink px-5 pb-10 pt-16 md:px-10 lg:px-20 lg:pt-20">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-start justify-between gap-10">
        <div className="flex w-[280px] flex-col gap-6">
          <div className="flex items-center gap-2">
            <Image
              src="/brand/codonmind-mark.png"
              alt=""
              width={20}
              height={20}
              className="size-5"
            />
            <span className="text-[16px] font-extrabold text-white">
              CODON MIND
            </span>
            <span className="text-[8px] font-semibold tracking-[2px] text-[#94a6bd]">
              NEXUS
            </span>
          </div>
          <p className="text-[14px] leading-[1.5] text-site-dim">
            AI-Powered CBT Platform
            <br />
            for Modern Education
          </p>
          <p className="text-[12px] text-site-muted">
            © 2025 CodonMind Nexus.
            <br />
            All rights reserved.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <nav
            key={column.title}
            aria-label={column.title}
            className="flex w-[140px] flex-col gap-4"
          >
            <p className="text-[14px] font-bold uppercase text-white">
              {column.title}
            </p>
            {column.items.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="text-[13px] text-site-dim hover:text-white"
                >
                  {item.label}
                </Link>
              ) : (
                <span key={item.label} className="text-[13px] text-site-dim">
                  {item.label}
                </span>
              ),
            )}
          </nav>
        ))}
      </div>
    </footer>
  );
}
