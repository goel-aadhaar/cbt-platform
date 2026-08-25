import Image from "next/image";

/**
 * Public site footer (§ public site).
 *
 * Kept deliberately simple: "Privacy Policy" and "Terms of Service" are
 * plain text rather than links, because those pages don't exist yet — a
 * label only becomes a link once it has somewhere real to go. "Contact"
 * jumps to the on-page contact form, which does.
 */
export function SiteFooter() {
  return (
    <footer className="w-full border-t border-site-ink-2 bg-site-ink px-5 py-10 md:px-10 lg:px-20">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center gap-5 text-center">
        <div className="flex items-center gap-2.5">
          <Image
            src="/brand/codonmind-mark.png"
            alt=""
            width={22}
            height={22}
            className="size-[22px]"
          />
          <span className="text-[15px] font-bold text-white">
            CodonMind Examination Technology Platform
          </span>
        </div>

        <p className="flex flex-wrap items-center justify-center gap-x-2 text-[13px] text-site-dim">
          <span>Privacy Policy</span>
          <span aria-hidden>|</span>
          <span>Terms of Service</span>
          <span aria-hidden>|</span>
          <a href="#contact" className="hover:text-white">
            Contact
          </a>
        </p>

        <p className="text-[12px] text-site-muted">
          © 2026 CodonMind. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
