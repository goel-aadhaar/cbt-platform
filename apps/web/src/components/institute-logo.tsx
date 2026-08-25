"use client";

import Image from "next/image";

import { AuthedImage } from "@/components/authed-image";
import { useMyInstitute } from "@/hooks/use-my-institute";

/**
 * The institute's own logo (§ institute branding) if its admin has set one,
 * else the platform's default mark — the same drop-in replacement for every
 * `<Image src="/brand/codonmind-mark.png">` in an authenticated workspace
 * shell. Never blocks or flashes empty: it renders the default immediately
 * and only swaps in the custom logo once (and if) one resolves.
 */
export function InstituteLogo({
  size,
  className,
}: {
  size: number;
  className?: string;
}) {
  const { institute } = useMyInstitute();

  const defaultMark = (
    <Image
      src="/brand/codonmind-mark.png"
      alt=""
      width={size}
      height={size}
      className={className}
    />
  );

  if (!institute?.logoUrl) return defaultMark;

  return (
    <AuthedImage
      url={institute.logoUrl}
      alt=""
      className={className}
      fallback={defaultMark}
    />
  );
}
