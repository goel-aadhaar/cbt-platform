import Image from "next/image";
import Link from "next/link";

/**
 * Public site header (Figma 6:5).
 *
 * Two of these controls go somewhere real and the rest go down the page:
 * "Sign In" is the way into the product, and every nav item is an anchor to a
 * section that actually exists below. The design draws Platform and Solutions
 * with dropdown chevrons but does not say what is in the menus, so they behave
 * as jump links until there are pages to put in them — a chevron that opens
 * nothing is the kind of decoration this codebase has been busy removing.
 */
const NAV_LINKS = [
  { label: "Platform", href: "#platform", hasMenu: true },
  { label: "Solutions", href: "#solutions", hasMenu: true },
  { label: "Features", href: "#features", hasMenu: false },
  { label: "Pricing", href: "#pricing", hasMenu: false },
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
            className="flex items-center gap-1 text-[14px] font-medium text-site-body hover:text-site-ink"
          >
            {link.label}
            {link.hasMenu && (
              <Image
                src="/landing/chevron-down.svg"
                alt=""
                width={10}
                height={6}
                className="h-[6px] w-[10px]"
              />
            )}
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
          href="#pricing"
          className="hidden items-center justify-center rounded-full border border-site-ink px-5 py-2.5 text-[13px] font-semibold text-site-ink hover:bg-site-ink hover:text-white sm:flex"
        >
          Request a Demo
        </a>
      </div>
    </header>
  );
}
