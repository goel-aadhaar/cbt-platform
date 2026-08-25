import Image from "next/image";

import { ContactForm } from "./contact-form";

/**
 * The public site's content sections, in page order. Palette, type ramp,
 * card radius and the one warm accent all come from the `site-*` tokens in
 * globals.css, matching the rest of the site.
 */

/* ------------------------------------------------------------------ hero */

export function Hero() {
  return (
    <section className="flex w-full flex-col items-center gap-8 bg-site-ink px-5 py-20 md:px-10 lg:px-20 lg:py-28">
      <div className="flex w-full max-w-[860px] flex-col items-center gap-6">
        <span className="rounded-full border-[1.5px] border-white/30 px-4 py-1.5 text-[12px] font-bold text-white">
          CODONMIND
        </span>
        <h1 className="text-center font-display text-[38px] leading-[1.12] text-white sm:text-[50px] lg:text-[64px]">
          Technology for Better Examinations
        </h1>
        <p className="max-w-[680px] text-center text-[16px] leading-[1.65] text-site-dim lg:text-[18px]">
          CodonMind builds software solutions that help educational institutes
          conduct, manage and understand examinations digitally. Our examination
          platform brings students, teachers and administrators together in one
          system, from question creation and exam management to evaluation,
          results and performance analysis.
        </p>
        <div className="flex flex-wrap items-start justify-center gap-4 pt-2">
          <a
            href="#platform"
            className="flex items-center justify-center rounded-full bg-white px-7 py-3.5 text-[15px] font-semibold text-[#0a1a2e] hover:opacity-90"
          >
            Explore Platform
          </a>
          <a
            href="#contact"
            className="flex items-center justify-center rounded-full border-[1.5px] border-white px-7 py-3.5 text-[15px] font-semibold text-white hover:bg-white/10"
          >
            Contact Us
          </a>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- what we do */

export function WhatWeDo() {
  return (
    <section className="flex w-full flex-col items-center gap-5 bg-white px-5 py-20 md:px-10 lg:px-20 lg:py-24">
      <p className="text-[12px] font-extrabold uppercase text-site-accent">
        What We Do
      </p>
      <h2 className="max-w-[720px] text-center font-display text-[30px] leading-[1.2] text-site-ink sm:text-[36px] lg:text-[42px]">
        We simplify the complete examination process.
      </h2>
      <p className="max-w-[680px] text-center text-[16px] leading-[1.65] text-site-muted">
        CodonMind provides a centralized digital platform that helps educational
        institutes manage students, questions, examinations, results and
        performance data efficiently.
      </p>
    </section>
  );
}

/* ---------------------------------------------------------- platform cards */

const PLATFORM_CARDS = [
  {
    icon: "database",
    title: "Question Bank",
    body: "Create, organize and manage questions by subject, chapter, topic and difficulty.",
  },
  {
    icon: "check-square",
    title: "Exam Management",
    body: "Create examinations, configure questions, set marking schemes, schedule tests and manage candidates.",
  },
  {
    icon: "monitor",
    title: "CBT Examination",
    body: "Provide students with a structured computer-based examination experience with navigation, timing and answer management.",
  },
  {
    icon: "database-badge",
    title: "Results & Rankings",
    body: "Automatically evaluate examinations and generate scores, rankings, percentiles and subject-wise performance.",
  },
  {
    icon: "users",
    title: "Student Management",
    body: "Manage student profiles, roll numbers, batches, login credentials and examination eligibility.",
  },
  {
    icon: "activity",
    title: "Performance Insights",
    body: "Convert examination data into useful performance information for students and institutes.",
  },
];

export function PlatformFeatures() {
  return (
    <section
      id="platform"
      className="flex w-full scroll-mt-16 flex-col items-center gap-12 bg-site-wash px-5 py-20 md:px-10 lg:gap-16 lg:px-20 lg:py-30"
    >
      <div className="flex w-full max-w-[900px] flex-col items-center gap-6">
        <span className="rounded-full border-[1.5px] border-[#0a1a2e] px-4 py-1.5 text-[12px] font-bold text-[#0a1a2e]">
          OUR EXAMINATION PLATFORM
        </span>
        <h2 className="text-center font-display text-[32px] leading-[1.15] text-site-ink sm:text-[40px] lg:text-[48px]">
          One Platform for the Complete CBT Workflow
        </h2>
      </div>

      <div className="grid w-full max-w-[1280px] gap-6 md:grid-cols-2 lg:grid-cols-3">
        {PLATFORM_CARDS.map((card) => (
          <article
            key={card.title}
            className="flex flex-col items-start gap-4 rounded-3xl border border-site-line bg-white p-8 shadow-[0_8px_12px_rgba(15,23,42,0.03)]"
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-site-accent/8">
              <Image
                src={`/landing/${card.icon}.svg`}
                alt=""
                width={24}
                height={24}
                className="size-6"
              />
            </span>
            <h3 className="text-[18px] font-bold text-site-ink">
              {card.title}
            </h3>
            <p className="text-[14px] leading-[1.5] text-site-muted">
              {card.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- roles */

const ROLE_CARDS = [
  {
    icon: "graduation-cap",
    title: "Students",
    body: "Access examinations securely, attempt tests, submit answers and view results and performance.",
  },
  {
    icon: "users",
    title: "Teachers",
    body: "Create and organize questions and contribute to the institute's question bank.",
  },
  {
    icon: "building-card",
    title: "Institute Administrators",
    body: "Manage students, teachers, examinations, question banks, results and reports from one dashboard.",
  },
  {
    icon: "shield",
    title: "Platform Administration",
    body: "Manage participating institutes and overall platform operations from a centralized system.",
  },
];

export function Roles() {
  return (
    <section className="flex w-full flex-col items-center gap-12 bg-white px-5 py-20 md:px-10 lg:gap-16 lg:px-20 lg:py-30">
      <div className="flex w-full max-w-[900px] flex-col items-center gap-6">
        <p className="text-[12px] font-extrabold uppercase text-site-accent">
          Built for Different Roles
        </p>
        <h2 className="text-center font-display text-[32px] leading-[1.15] text-site-ink sm:text-[40px] lg:text-[48px]">
          A Workspace for Everyone in the Exam Process
        </h2>
      </div>

      <div className="grid w-full max-w-[1280px] gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {ROLE_CARDS.map((role) => (
          <article
            key={role.title}
            className="flex flex-col items-start gap-4 rounded-3xl border border-site-line bg-white p-7 shadow-[0_8px_12px_rgba(15,23,42,0.03)]"
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-site-ink/5">
              <Image
                src={`/landing/${role.icon}.svg`}
                alt=""
                width={22}
                height={22}
                className="size-[22px]"
              />
            </span>
            <h3 className="text-[16px] font-bold text-site-ink">
              {role.title}
            </h3>
            <p className="text-[13.5px] leading-[1.55] text-site-muted">
              {role.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------- understand performance */

const PERFORMANCE_ITEMS = [
  "Student performance",
  "Areas where students are struggling",
  "Subjects that need more attention",
  "Student rankings and peer comparison",
  "Performance changes across examinations",
];

export function PerformanceInsights() {
  return (
    <section className="flex w-full flex-col items-center gap-10 bg-site-ink px-5 py-20 md:px-10 lg:px-20 lg:py-30">
      <div className="flex w-full max-w-[720px] flex-col items-center gap-5 text-center">
        <h2 className="font-display text-[30px] leading-[1.2] text-white sm:text-[38px] lg:text-[44px]">
          Understand Performance Better
        </h2>
        <p className="text-[16px] leading-[1.65] text-site-dim">
          An examination should not end when a student clicks Submit. CodonMind
          helps institutes understand examination data and identify:
        </p>
      </div>

      <ul className="grid w-full max-w-[900px] gap-4 sm:grid-cols-2">
        {PERFORMANCE_ITEMS.map((item) => (
          <li
            key={item}
            className="flex items-center gap-3 rounded-2xl bg-white/5 px-5 py-4"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-site-accent/20">
              <Image
                src="/landing/check-square.svg"
                alt=""
                width={14}
                height={14}
                className="size-3.5"
              />
            </span>
            <span className="text-[15px] font-medium text-white">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------- growth &amp; objective */

export function GrowthAndObjective() {
  return (
    <section className="flex w-full flex-col items-center gap-6 bg-white px-5 py-20 md:px-10 lg:px-20 lg:py-30">
      <div className="grid w-full max-w-[1100px] gap-6 lg:grid-cols-2">
        <article className="flex flex-col gap-4 rounded-3xl border border-site-line bg-site-wash p-9">
          <p className="text-[12px] font-extrabold uppercase text-site-accent">
            Technology Built for Growth
          </p>
          <h3 className="font-display text-[24px] leading-[1.25] text-site-ink">
            A Platform Built to Scale Across Institutes
          </h3>
          <p className="text-[15px] leading-[1.65] text-site-muted">
            CodonMind is built as a multi-institute examination platform.
            Different educational institutes can use the system while keeping
            their students, examinations, questions and results separately
            managed. The platform continues to evolve with better automation,
            analytics and examination management capabilities.
          </p>
        </article>

        <article className="flex flex-col gap-4 rounded-3xl border border-site-line bg-site-wash p-9">
          <p className="text-[12px] font-extrabold uppercase text-site-accent">
            Our Objective
          </p>
          <h3 className="font-display text-[24px] leading-[1.25] text-site-ink">
            Make Digital Examinations Simpler and More Useful
          </h3>
          <p className="text-[15px] leading-[1.65] text-site-muted">
            CodonMind helps educational institutes spend less time managing
            examination operations and more time understanding student
            performance.
          </p>
        </article>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ closing cta */

export function ClosingCta() {
  return (
    <section className="flex w-full flex-col items-center gap-8 bg-site-ink px-5 py-16 md:px-10 lg:px-20 lg:py-24">
      <div className="flex w-full max-w-[700px] flex-col items-center gap-4 text-center">
        <h2 className="font-display text-[34px] text-white sm:text-[44px] lg:text-[52px]">
          Build Better Examination Systems
        </h2>
        <p className="max-w-[520px] text-[17px] text-site-dim">
          Interested in using CodonMind for your institute?
        </p>
      </div>
      <a
        href="#contact"
        className="flex items-center justify-center rounded-full bg-white px-7 py-3.5 text-[15px] font-semibold text-[#0a1a2e] hover:opacity-90"
      >
        Contact Us
      </a>
    </section>
  );
}

/* ---------------------------------------------------------------- contact */

export function Contact() {
  return (
    <section
      id="contact"
      className="flex w-full scroll-mt-16 flex-col items-center gap-12 bg-site-wash px-5 py-20 md:px-10 lg:px-20 lg:py-30"
    >
      <div className="grid w-full max-w-[1100px] gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div className="flex flex-col gap-5">
          <p className="text-[12px] font-extrabold uppercase text-site-accent">
            Contact CodonMind
          </p>
          <h2 className="font-display text-[30px] leading-[1.2] text-site-ink sm:text-[36px]">
            Examination Technology Platform
          </h2>
          <p className="text-[15px] leading-[1.65] text-site-muted">
            CodonMind develops digital examination and CBT solutions for
            educational institutes.
          </p>

          <div className="mt-3 flex flex-col gap-4 border-t border-site-line pt-6">
            <p className="flex flex-col gap-1">
              <span className="text-[12px] font-bold uppercase tracking-wide text-site-muted">
                Business Email
              </span>
              <a
                href="mailto:hello@codonmind.in"
                className="text-[15px] font-semibold text-site-ink hover:text-site-accent"
              >
                hello@codonmind.in
              </a>
            </p>
            <p className="flex flex-col gap-1">
              <span className="text-[12px] font-bold uppercase tracking-wide text-site-muted">
                Location
              </span>
              <span className="text-[15px] font-semibold text-site-ink">
                Tripura, India
              </span>
            </p>
          </div>
        </div>

        <ContactForm />
      </div>
    </section>
  );
}
