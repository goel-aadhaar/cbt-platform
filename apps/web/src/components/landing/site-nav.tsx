import Image from "next/image";
import Link from "next/link";

/**
 * Public site header (§ public site).
 *
 * "Sign In" is the way into the product, and every nav item is an anchor to
 * a section that actually exists below — a link only ever goes somewhere
 * real.
 */
const NAV_LINKS = [
  { label: "Platform", href: "#platform" },
  { label: "Contact", href: "#contact" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between gap-4 border-b border-site-line bg-white/95 px-5 backdrop-blur md:px-10">
      <Link href="/" className="flex shrink-0 items-center gap-2.5">
        <Image
          src="/brand/codonmind-mark.png"
          alt=""
          width={26}
          height={26}
          className="size-[26px]"
        />
        <span className="flex flex-col gap-px uppercase leading-none text-site-ink">
          <span className="text-[14px] font-extrabold">CODON MIND</span>
          <span className="text-[9px] font-semibold">NEXUS</span>
        </span>
        <span className="sr-only">CodonMind Nexus — home</span>
      </Link>

      {/* Hidden below lg rather than folded into a burger menu: every
          destination is a section of this same page, so a small screen loses
          nothing by scrolling to it. */}
      <nav aria-label="Sections" className="hidden items-center gap-7 lg:flex">
        {NAV_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="text-[14px] font-medium text-site-body hover:text-site-ink"
          >
            {link.label}
          </a>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-4">
        <Link
          href="/login"
          className="text-[13px] font-semibold text-site-ink hover:underline"
        >
          Sign In
        </Link>
        <a
          href="#contact"
          className="hidden items-center justify-center rounded-full border border-site-ink px-5 py-2.5 text-[13px] font-semibold text-site-ink hover:bg-site-ink hover:text-white sm:flex"
        >
          Contact Us
        </a>
      </div>
    </header>
  );
}
