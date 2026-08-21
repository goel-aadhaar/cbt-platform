import Image from "next/image";

/**
 * The six content sections of the public site (Figma 6:20 → 6:222).
 *
 * The Figma frame is a fixed 1440px desktop artboard, so its `w-[900px]` and
 * five-across grids are transcribed here as max-widths and responsive columns.
 * Everything else — the palette, the type ramp, the 24px card radius, the one
 * warm accent — is carried over as drawn, via the `site-*` tokens in
 * globals.css.
 */

/* ------------------------------------------------------------------ hero */

const TRUST_ROW = [
  { label: "Schools", icon: "building" },
  { label: "Colleges", icon: "building" },
  { label: "Coaching Centers", icon: "circle-x" },
  { label: "Universities", icon: "graduation-cap" },
  { label: "Training Institutes", icon: "building" },
];

/**
 * The raised-hands illustration: five photographic panels of different heights,
 * bottom-aligned so they read as a row of hands going up.
 *
 * The source images are 768×1344 and render at a fifth of that, so they go
 * through next/image — 3.6MB of PNG served raw at the top of a landing page is
 * the whole page's performance budget spent on decoration. `sizes` tells the
 * optimiser how small they actually are.
 */
const HANDS = [
  {
    src: "/landing/hand-1.png",
    h: "h-[160px] sm:h-[210px] lg:h-[260px]",
    w: "basis-[16%]",
    r: "rounded-t-[36px] lg:rounded-t-[60px]",
  },
  {
    src: "/landing/hand-2.png",
    h: "h-[185px] sm:h-[242px] lg:h-[300px]",
    w: "basis-[18.67%]",
    r: "rounded-t-[42px] lg:rounded-t-[70px]",
  },
  {
    src: "/landing/hand-3.png",
    h: "h-[172px] sm:h-[226px] lg:h-[280px]",
    w: "basis-[17.33%]",
    r: "rounded-t-[39px] lg:rounded-t-[65px]",
  },
  {
    src: "/landing/hand-4.png",
    h: "h-[197px] sm:h-[258px] lg:h-[320px]",
    w: "basis-[20%]",
    r: "rounded-t-[45px] lg:rounded-t-[75px]",
  },
  {
    src: "/landing/hand-5.png",
    h: "h-[148px] sm:h-[194px] lg:h-[240px]",
    w: "basis-[16%]",
    r: "rounded-t-[36px] lg:rounded-t-[60px]",
  },
];

export function Hero() {
  return (
    <section className="flex w-full flex-col items-center gap-10 bg-site-ink px-5 py-16 md:px-10 lg:gap-14 lg:px-20 lg:py-24">
      <div className="flex w-full max-w-[900px] flex-col items-center gap-6">
        <h1 className="text-center font-display text-[40px] leading-[1.1] text-white sm:text-[52px] lg:text-[68px]">
          Manage Exams, Students, and Results All in One Place 📋
        </h1>
        <p className="max-w-[680px] text-center text-[16px] leading-[1.65] text-site-dim lg:text-[18px]">
          CodonMind is a powerful CBT platform to create, conduct, monitor, and
          analyze exams with ease, accuracy, and security.
        </p>
        <div className="flex flex-wrap items-start justify-center gap-4">
          <a
            href="#pricing"
            className="flex items-center justify-center rounded-full bg-white px-7 py-3.5 text-[15px] font-semibold text-[#0a1a2e] hover:opacity-90"
          >
            Request a Demo
          </a>
          <a
            href="#platform"
            className="flex items-center justify-center rounded-full border-[1.5px] border-white px-7 py-3.5 text-[15px] font-semibold text-white hover:bg-white/10"
          >
            Explore Platform
          </a>
        </div>
      </div>

      {/* Proportional widths and gap rather than the artboard's fixed pixels:
          five panels at 120-150px plus 24px gaps need 756px, which is more
          than a phone has, and the row scrolled the whole page sideways. The
          ratios are the design's, expressed as percentages of the row. */}
      <div className="flex w-full max-w-[800px] items-end justify-center gap-[3%]">
        {HANDS.map((hand) => (
          <div
            key={hand.src}
            className={`relative grow-0 overflow-hidden ${hand.h} ${hand.w} ${hand.r}`}
          >
            <Image
              src={hand.src}
              alt=""
              fill
              sizes="(max-width: 640px) 80px, (max-width: 1024px) 112px, 150px"
              className="object-cover"
              priority
            />
          </div>
        ))}
      </div>

      <div className="flex w-full flex-col items-center gap-6">
        <p className="text-center text-[12px] font-medium uppercase text-site-dim">
          Trusted by educational institutions for secure assessments
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 lg:gap-x-12">
          {TRUST_ROW.map((item) => (
            <li key={item.label} className="flex items-center gap-2 opacity-70">
              <Image
                src={`/landing/${item.icon}.svg`}
                alt=""
                width={18}
                height={18}
                className="size-[18px]"
              />
              <span className="text-[15px] font-medium text-site-faint">
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- features */

const FEATURE_CARDS = [
  {
    icon: "users",
    title: "Students Assessed",
    body: "Enabling seamless assessment experiences for thousands of students.",
  },
  {
    icon: "check-square",
    title: "Active Exams",
    body: "Supporting a wide range of exams and evaluations.",
  },
  {
    icon: "building-card",
    title: "Institutions Onboarded",
    body: "Trusted by schools, colleges, coaching centers & organizations nationwide.",
  },
  {
    icon: "database",
    title: "Question Bank",
    body: "Large repository of questions mapped to multiple subjects and levels.",
  },
  {
    icon: "shield",
    title: "Secure & Reliable",
    body: "High security, 99.9% uptime and data privacy you can count on.",
  },
  {
    icon: "monitor",
    title: "Platform Access",
    body: "Access anytime, anywhere on multiple devices.",
  },
];

export function Features() {
  return (
    <section
      id="platform"
      className="flex w-full scroll-mt-16 flex-col items-center gap-12 bg-white px-5 py-20 md:px-10 lg:gap-16 lg:px-20 lg:py-30"
    >
      <div className="flex w-full max-w-[900px] flex-col items-center gap-6">
        <span className="rounded-full border-[1.5px] border-[#0a1a2e] px-4 py-1.5 text-[12px] font-bold text-[#0a1a2e]">
          CODONMIND CBT PLATFORM
        </span>
        <h2 className="text-center font-display text-[32px] leading-[1.15] text-site-ink sm:text-[40px] lg:text-[48px]">
          Empowering Institutions with Advanced Examination Solutions
        </h2>
        <p className="max-w-[640px] text-center text-[16px] leading-[1.6] text-site-muted">
          A complete CBT ecosystem trusted by institutions across the country to
          deliver fair, flexible, and future-ready assessments.
        </p>
      </div>

      <div className="grid w-full max-w-[1280px] gap-6 md:grid-cols-2 lg:grid-cols-3">
        {FEATURE_CARDS.map((card) => (
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

/* ----------------------------------------------------------- ai insights */

const AI_ITEMS = [
  {
    icon: "activity",
    title: "Smart Performance Analytics",
    body: "Get deep insights into student strengths, weaknesses & progress over time.",
    highlighted: false,
  },
  {
    icon: "cpu",
    title: "AI-Powered Reports",
    body: "Automated reports and recommendations to help students improve faster.",
    highlighted: true,
  },
  {
    icon: "eye",
    title: "Track Progress in Real-time",
    body: "Monitor exam performance and learning trends as they happen.",
    highlighted: false,
  },
];

export function AiInsights() {
  return (
    <section
      id="features"
      className="flex w-full scroll-mt-16 flex-col items-center gap-10 bg-site-wash px-5 py-20 md:px-10 lg:gap-12 lg:px-20 lg:py-30"
    >
      <div className="flex w-full max-w-[900px] flex-col items-center gap-5">
        <h2 className="text-center font-display text-[32px] leading-[1.2] text-site-ink sm:text-[40px] lg:text-[48px]">
          AI-Powered Insights for Better Learning Outcomes 🚀
        </h2>
        <p className="max-w-[680px] text-center text-[16px] leading-[1.6] text-site-muted">
          CodonMind uses intelligent analytics to help educators understand
          performance patterns and support students with personalized
          improvement.
        </p>
        <p className="flex items-center gap-4 pt-3 text-[14px]">
          <span className="font-bold text-site-ink">Analyze</span>
          <span className="text-site-dim">|</span>
          <span className="font-bold text-site-muted">Improve</span>
          <span className="text-site-dim">|</span>
          <span className="font-bold text-site-muted">Achieve</span>
        </p>
      </div>

      <div className="flex w-full max-w-[1280px] flex-col items-stretch overflow-hidden rounded-[32px] bg-site-ink lg:h-[480px] lg:flex-row lg:items-center">
        <div className="relative h-[260px] w-full shrink-0 lg:h-full lg:min-w-0 lg:flex-1">
          <Image
            src="/landing/ai-illustration.png"
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 660px"
            className="object-cover"
          />
        </div>
        <div className="flex flex-col justify-center gap-5 p-6 sm:p-10 lg:h-full lg:w-[620px] lg:shrink-0 lg:p-12">
          {AI_ITEMS.map((item) => (
            <div
              key={item.title}
              className={`flex w-full items-start gap-5 ${
                item.highlighted
                  ? "items-center rounded-[20px] bg-site-accent p-4"
                  : ""
              }`}
            >
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-[20px] ${
                  item.highlighted ? "bg-white/20" : "bg-site-ink-2"
                }`}
              >
                <Image
                  src={`/landing/${item.icon}.svg`}
                  alt=""
                  width={18}
                  height={18}
                  className="size-[18px]"
                />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-[16px] font-bold text-white">{item.title}</p>
                <p
                  className={`text-[13px] ${
                    item.highlighted ? "text-white opacity-90" : "text-site-dim"
                  }`}
                >
                  {item.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- integrations */

const INTEGRATIONS: { label: string; icon: string; on?: boolean }[][] = [
  [
    { label: "Google Classroom", icon: "integration-generic" },
    { label: "Microsoft Teams", icon: "bot" },
    { label: "Slack", icon: "slack" },
    { label: "GitHub", icon: "github" },
  ],
  [
    { label: "Moodle", icon: "integration-generic" },
    { label: "Canvas", icon: "integration-generic" },
    { label: "Zoho", icon: "integration-generic" },
    { label: "Webhook", icon: "webhook-off" },
  ],
  [
    { label: "Confluence", icon: "integration-generic" },
    { label: "Google Drive", icon: "database-badge" },
    { label: "Notion", icon: "integration-generic" },
    { label: "OneDrive", icon: "cloud-backup" },
  ],
  [
    { label: "OpenAI", icon: "integration-generic" },
    { label: "Backstage", icon: "integration-generic-on", on: true },
    { label: "Jira Software", icon: "atom" },
  ],
  [
    { label: "Firebase", icon: "database-badge" },
    { label: "Auth0", icon: "integration-generic" },
    { label: "PagerDuty", icon: "integration-generic-on", on: true },
    { label: "Zapier", icon: "zap-off" },
  ],
];

export function Integrations() {
  return (
    <section
      id="solutions"
      className="flex w-full scroll-mt-16 flex-col items-center gap-10 bg-white px-5 py-20 md:px-10 lg:gap-14 lg:px-20 lg:py-30"
    >
      <div className="flex w-full max-w-[900px] flex-col items-center gap-5">
        <p className="text-[12px] font-extrabold uppercase text-site-accent">
          SEAMLESS INTEGRATIONS
        </p>
        <h2 className="text-center font-display text-[32px] text-site-ink sm:text-[40px] lg:text-[48px]">
          Works With Your Favorite Tools
        </h2>
        <p className="max-w-[600px] text-center text-[16px] leading-[1.6] text-site-muted">
          CodonMind integrates seamlessly with popular platforms to simplify
          your exam and academic workflows.
        </p>
      </div>

      <div className="flex w-full flex-col items-center gap-4">
        {INTEGRATIONS.map((row, i) => (
          <div
            key={i}
            className="flex flex-wrap items-start justify-center gap-3 lg:gap-4"
          >
            {row.map((badge) => (
              <span
                key={badge.label}
                className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-medium lg:px-4.5 ${
                  badge.on
                    ? "bg-site-accent text-white"
                    : "border border-site-line bg-white text-site-body"
                }`}
              >
                <Image
                  src={`/landing/${badge.icon}.svg`}
                  alt=""
                  width={16}
                  height={16}
                  className="size-4"
                />
                {badge.label}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- testimonial */

export function Testimonial() {
  return (
    <section className="flex w-full flex-col items-center gap-10 bg-site-wash px-5 py-20 md:px-10 lg:gap-12 lg:px-20 lg:py-30">
      <div className="flex w-full max-w-[900px] flex-col items-center gap-4 text-center">
        <h2 className="font-display text-[28px] text-site-ink sm:text-[34px] lg:text-[40px]">
          Trusted by ⭐ Educators Across Institutions
        </h2>
        <p className="text-[16px] text-site-muted">
          CodonMind helps educators conduct fair assessments, save time, and
          focus more on student success.
        </p>
      </div>

      <figure className="flex w-full max-w-[800px] flex-col items-center gap-8 rounded-[28px] border border-site-line bg-white p-8 shadow-[0_12px_16px_rgba(15,23,42,0.03)] sm:p-12">
        <blockquote className="text-center font-display text-[20px] italic leading-[1.4] text-site-ink sm:text-[24px] lg:text-[28px]">
          &ldquo;CodonMind has transformed the way we conduct exams. It&rsquo;s
          secure, easy to use, and the reports are incredibly insightful.&rdquo;
        </blockquote>
        <figcaption className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-4">
            <Image
              src="/landing/avatar.png"
              alt=""
              width={56}
              height={56}
              className="size-14 rounded-full object-cover"
            />
            <div className="flex flex-col gap-0.5">
              <p className="text-[16px] font-bold text-site-ink">
                Dr. Ananya Sharma
              </p>
              <p className="text-[13px] text-site-muted">
                ExamDirector, Leading University
              </p>
            </div>
          </div>
          <div className="flex gap-1" aria-label="Rated 5 out of 5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Image
                key={i}
                src="/landing/star.svg"
                alt=""
                width={16}
                height={16}
                className="size-4"
              />
            ))}
          </div>
        </figcaption>
      </figure>
    </section>
  );
}

/* ------------------------------------------------------------ closing cta */

/**
 * The demo request goes to a mailbox rather than a form: there is no
 * contact endpoint on the API, and a form that posts nowhere would be worse
 * than no form. Swap the address for a real route whenever one exists.
 */
const DEMO_MAILTO =
  "mailto:hello@codonmind.in?subject=CodonMind%20CBT%20—%20demo%20request";

export function ClosingCta() {
  return (
    <section
      id="pricing"
      className="flex w-full scroll-mt-16 flex-col items-center gap-8 bg-site-ink px-5 py-16 md:px-10 lg:px-20 lg:py-24"
    >
      <div className="flex w-full max-w-[800px] flex-col items-center gap-4 text-center">
        <h2 className="font-display text-[36px] text-white sm:text-[46px] lg:text-[56px]">
          Start Your Journey with CodonMind
        </h2>
        <p className="max-w-[600px] text-[18px] text-site-dim">
          See how CodonMind CBT can simplify exam management for your
          institution.
        </p>
      </div>
      <div className="flex flex-wrap items-start justify-center gap-4">
        <a
          href={DEMO_MAILTO}
          className="flex items-center justify-center rounded-full bg-white px-6 py-3 text-[14px] font-semibold text-[#0a1a2e] hover:opacity-90"
        >
          Request a Demo
        </a>
        <a
          href="#platform"
          className="flex items-center justify-center rounded-full border-[1.5px] border-white px-6 py-3 text-[14px] font-semibold text-white hover:bg-white/10"
        >
          Explore Platform
        </a>
      </div>
    </section>
  );
}
