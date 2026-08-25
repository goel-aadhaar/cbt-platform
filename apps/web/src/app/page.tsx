import type { Metadata } from "next";

import {
  ClosingCta,
  Contact,
  GrowthAndObjective,
  Hero,
  PerformanceInsights,
  PlatformFeatures,
  Roles,
  WhatWeDo,
} from "@/components/landing/sections";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";

/**
 * The public front door (Figma 6:4).
 *
 * `/` used to redirect straight to `/login`, which meant the platform had no
 * face at all — anyone sent the link landed on a password prompt. It is now the
 * marketing page, and "Sign In" is the way through to `/login`, which remains
 * the single entry point for all four roles.
 *
 * Deliberately not gated on a session: a signed-in visitor sees the same page
 * as everyone else rather than being bounced to a dashboard, because a public
 * page that refuses to be looked at is a nuisance to the people who share it.
 */
export const metadata: Metadata = {
  title: "CodonMind — Technology for Better Examinations",
  description:
    "CodonMind builds software solutions that help educational institutes conduct, manage and understand examinations digitally.",
};

export default function Home() {
  return (
    <div className="flex min-h-full w-full flex-col bg-white font-site text-site-body">
      <SiteNav />
      <main className="flex w-full flex-col items-start">
        <Hero />
        <WhatWeDo />
        <PlatformFeatures />
        <Roles />
        <PerformanceInsights />
        <GrowthAndObjective />
        <ClosingCta />
        <Contact />
      </main>
      <SiteFooter />
    </div>
  );
}
