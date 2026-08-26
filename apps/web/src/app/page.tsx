import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BarChart3,
  BrainCircuit,
  BookOpenText,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Layers,
  Mail,
  MapPin,
  MonitorCheck,
  Network,
  ShieldCheck,
  Target,
  UserRound,
  Users,
  Zap,
} from "lucide-react";

import { ContactForm } from "@/components/landing/contact-form";

import "./home.css";

/**
 * The public front door (§ public site v4) — ported from
 * CodonMind-Website-Source-v4. `home.css` (loaded only on this route) carries
 * the design; the only two changes from the source's static markup are the
 * real `/login` destination on the two "Log in" links (the source pointed
 * both at `#contact`) and the Contact Form, which now actually submits
 * (`ContactForm` → `POST /contact`) instead of a bare `mailto:` link.
 */
export const metadata: Metadata = {
  title: "CodonMind — Technology for Better Examinations",
  description:
    "CodonMind builds software solutions that help educational institutes conduct, manage and understand examinations digitally.",
};

const platformFeatures = [
  {
    icon: BookOpenText,
    title: "Question Bank",
    description:
      "Create, organize and manage questions by subject, chapter, topic and difficulty.",
    tone: "violet",
  },
  {
    icon: CalendarClock,
    title: "Exam Management",
    description:
      "Create examinations, configure questions, set marking schemes, schedule tests and manage candidates.",
    tone: "orange",
  },
  {
    icon: MonitorCheck,
    title: "CBT Examination",
    description:
      "Provide students with a structured computer-based examination experience with navigation, timing and answer management.",
    tone: "mint",
  },
  {
    icon: Award,
    title: "Results & Rankings",
    description:
      "Automatically evaluate examinations and generate scores, rankings, percentiles and subject-wise performance.",
    tone: "violet",
  },
  {
    icon: Users,
    title: "Student Management",
    description:
      "Manage student profiles, roll numbers, batches, login credentials and examination eligibility.",
    tone: "orange",
  },
  {
    icon: BarChart3,
    title: "Performance Insights",
    description:
      "Convert examination data into useful performance information for students and institutes.",
    tone: "mint",
  },
];

const roles = [
  {
    icon: GraduationCap,
    title: "Students",
    description:
      "Access examinations securely, attempt tests, submit answers and view results and performance.",
  },
  {
    icon: BookOpenText,
    title: "Teachers",
    description:
      "Create and organize questions and contribute to the institute's question bank.",
  },
  {
    icon: Building2,
    title: "Institute Administrators",
    description:
      "Manage students, teachers, examinations, question banks, results and reports from one dashboard.",
  },
  {
    icon: Network,
    title: "Platform Administration",
    description:
      "Manage participating institutes and overall platform operations from a centralized system.",
  },
];

const performancePoints = [
  "Student performance",
  "Areas where students are struggling",
  "Subjects that need more attention",
  "Student rankings and peer comparison",
  "Performance changes across examinations",
];

export default function Home() {
  return (
    <main>
      <a className="skip-link" href="#main-content">
        Explore Platform
      </a>

      <header className="site-header">
        <div className="shell header-inner">
          <a className="brand" href="#top" aria-label="CodonMind home">
            <span className="brand-mark" aria-hidden="true">
              <span />
            </span>
            <span>CodonMind</span>
          </a>

          <nav className="desktop-nav" aria-label="Primary navigation">
            <a href="#what-we-do">What We Do</a>
            <a href="#platform">Our Examination Platform</a>
            <a href="#roles">Built for Different Roles</a>
            <a href="#contact">Contact</a>
            <Link href="/login">Sign In</Link>
          </nav>

          <a className="button button-small button-dark" href="#contact">
            Contact Us <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </header>

      <div id="main-content">
        <section className="hero hero-image-section" id="top">
          <div className="hero-artwork">
            <Image
              className="hero-scene"
              src="/codonmind-hero-clean.png"
              alt=""
              width={1672}
              height={941}
              priority
              sizes="100vw"
            />
            <div className="hero-scene-overlay" aria-hidden="true" />

            <header className="hero-html-header">
              <a className="hero-brand" href="#top" aria-label="CodonMind home">
                <span className="hero-brand-mark" aria-hidden="true">
                  <BrainCircuit size={30} strokeWidth={1.7} />
                </span>
                <span className="hero-brand-copy">
                  <strong>CODON MIND</strong>
                  <small>NEXUS</small>
                </span>
              </a>

              <nav className="hero-desktop-nav" aria-label="Primary navigation">
                {/* Shared `name` makes these one exclusive accordion group —
                    a native HTML behavior (no JS needed): opening one
                    closes any other `<details>` with the same name. */}
                <details className="hero-menu" name="hero-nav-menu">
                  <summary>
                    Products <ChevronDown size={16} aria-hidden="true" />
                  </summary>
                  <div className="hero-dropdown">
                    <a href="#platform">Examination Platform</a>
                    <a href="#platform">Question Bank</a>
                    <a href="#performance">Performance Insights</a>
                  </div>
                </details>
                <details className="hero-menu" name="hero-nav-menu">
                  <summary>
                    Solutions <ChevronDown size={16} aria-hidden="true" />
                  </summary>
                  <div className="hero-dropdown">
                    <a href="#roles">For Students</a>
                    <a href="#roles">For Teachers</a>
                    <a href="#roles">For Institutions</a>
                  </div>
                </details>
                <details className="hero-menu" name="hero-nav-menu">
                  <summary>
                    Resources <ChevronDown size={16} aria-hidden="true" />
                  </summary>
                  <div className="hero-dropdown">
                    <a href="#what-we-do">Platform Overview</a>
                    <a href="#performance">Performance Analytics</a>
                    <a href="#growth">Student Growth</a>
                  </div>
                </details>
                <details className="hero-menu" name="hero-nav-menu">
                  <summary>
                    About <ChevronDown size={16} aria-hidden="true" />
                  </summary>
                  <div className="hero-dropdown">
                    <a href="#objective">Our Objective</a>
                    <a href="#contact">Contact Us</a>
                  </div>
                </details>
                <a className="hero-nav-link" href="#contact">
                  Pricing
                </a>
              </nav>

              <div className="hero-header-actions">
                <Link className="hero-login" href="/login">
                  Log in
                </Link>
                <a className="hero-open-account" href="#contact">
                  Open account
                </a>
              </div>

              <details className="hero-mobile-menu">
                <summary>
                  Menu <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <nav aria-label="Mobile navigation">
                  <a href="#platform">Products</a>
                  <a href="#roles">Solutions</a>
                  <a href="#performance">Resources</a>
                  <a href="#objective">About</a>
                  <a href="#contact">Pricing</a>
                  <Link href="/login">Log in</Link>
                  <a href="#contact">Open account</a>
                </nav>
              </details>
            </header>

            <div className="hero-html-content">
              <h1>
                <span>Now I take Exam from</span>
                <strong>Anywhere, Anytime</strong>
              </h1>
              <p>
                Most accurate live NTA STYLE full AI analytics.
                <br />
                Personalised exam engine software.
              </p>

              <div className="hero-cta-row">
                <form
                  className="hero-email-form"
                  action="#contact"
                  method="get"
                >
                  <label className="sr-only" htmlFor="journey-email">
                    Enter your email
                  </label>
                  <input
                    id="journey-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="Enter your email"
                    required
                  />
                  <button type="submit">Start your exam journey</button>
                </form>
                <a className="hero-demo-button" href="#platform">
                  Launch demo
                </a>
              </div>

              <div className="hero-widget-row" aria-label="Platform benefits">
                <a className="hero-html-widget" href="#platform">
                  <Target aria-hidden="true" />
                  <span>
                    <strong>NTA STYLE</strong>
                    <small>Real Exam Experience</small>
                  </span>
                </a>
                <a className="hero-html-widget" href="#platform">
                  <Zap aria-hidden="true" />
                  <span>
                    <strong>Live &amp; Secure</strong>
                    <small>Proctored Exams</small>
                  </span>
                </a>
                <a className="hero-html-widget" href="#performance">
                  <BarChart3 aria-hidden="true" />
                  <span>
                    <strong>AI Analytics</strong>
                    <small>Instant Insights</small>
                  </span>
                </a>
                <a className="hero-html-widget" href="#roles">
                  <UserRound aria-hidden="true" />
                  <span>
                    <strong>Personalised</strong>
                    <small>Adaptive for You</small>
                  </span>
                </a>
              </div>
            </div>

            <a
              className="hero-html-app-widget"
              href="#contact"
              aria-label="Open support"
            >
              <strong>IM</strong>
              <i aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </i>
            </a>

            <a className="hero-html-security" href="#what-we-do">
              <ShieldCheck aria-hidden="true" />
              <span>Secure. Reliable. Fair.</span>
              <b>Built for institutions. Trusted by thousands.</b>
            </a>
          </div>
          <div className="hero-orb hero-orb-one" aria-hidden="true" />
          <div className="hero-orb hero-orb-two" aria-hidden="true" />
          <div className="shell hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">
                <span /> Examination Technology Platform
              </p>
              <h1>Technology for Better Examinations</h1>
              <p className="hero-lead">
                CodonMind builds software solutions that help educational
                institutes conduct, manage and understand examinations
                digitally.
              </p>
              <p className="hero-support">
                Our examination platform brings students, teachers and
                administrators together in one system, from question creation
                and exam management to evaluation, results and performance
                analysis.
              </p>
              <div className="hero-actions">
                <a className="button button-primary" href="#platform">
                  Explore Platform <ArrowRight size={18} aria-hidden="true" />
                </a>
                <a className="text-link" href="#contact">
                  Contact Us <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>

            <div
              className="product-stage"
              aria-label="CodonMind examination platform interface"
            >
              <div className="stage-dots stage-dots-one" aria-hidden="true" />
              <div className="stage-dots stage-dots-two" aria-hidden="true" />
              <div className="platform-window">
                <div className="window-bar">
                  <span className="mini-brand">
                    <i aria-hidden="true" /> CodonMind
                  </span>
                  <span className="window-avatar">CM</span>
                </div>
                <div className="window-body">
                  <aside className="window-sidebar" aria-hidden="true">
                    <span className="sidebar-active">
                      <LayoutDashboard size={14} /> Performance Insights
                    </span>
                    <span>
                      <BookOpenText size={14} /> Question Bank
                    </span>
                    <span>
                      <ClipboardCheck size={14} /> Examinations
                    </span>
                    <span>
                      <BarChart3 size={14} /> Results
                    </span>
                  </aside>
                  <div className="window-content">
                    <div className="window-heading">
                      <div>
                        <small>Examination Platform</small>
                        <strong>Performance Insights</strong>
                      </div>
                      <button type="button" tabIndex={-1}>
                        Results
                      </button>
                    </div>
                    <div className="metric-row" aria-hidden="true">
                      <div>
                        <span>Student performance</span>
                        <b>●</b>
                      </div>
                      <div>
                        <span>Subject-wise performance</span>
                        <b>●</b>
                      </div>
                      <div>
                        <span>Student rankings</span>
                        <b>●</b>
                      </div>
                    </div>
                    <div className="chart-card" aria-hidden="true">
                      <div className="chart-title">
                        <span>Performance</span>
                        <i />
                      </div>
                      <div className="chart-grid">
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                      <svg
                        viewBox="0 0 420 120"
                        role="img"
                        aria-label="Performance chart"
                      >
                        <defs>
                          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                            <stop
                              offset="0"
                              stopColor="#6d57e8"
                              stopOpacity=".28"
                            />
                            <stop
                              offset="1"
                              stopColor="#6d57e8"
                              stopOpacity="0"
                            />
                          </linearGradient>
                        </defs>
                        <path
                          className="chart-area"
                          d="M0 101 C48 95 62 65 105 71 S165 103 208 74 S279 48 315 56 S371 19 420 29 L420 120 L0 120 Z"
                        />
                        <path
                          className="chart-line"
                          d="M0 101 C48 95 62 65 105 71 S165 103 208 74 S279 48 315 56 S371 19 420 29"
                        />
                        <circle cx="315" cy="56" r="5" />
                      </svg>
                    </div>
                    <div className="progress-card" aria-hidden="true">
                      <span>Subjects that need more attention</span>
                      <div>
                        <i style={{ width: "72%" }} />
                        <i style={{ width: "48%" }} />
                        <i style={{ width: "84%" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="floating-status floating-status-one">
                <CheckCircle2 size={18} aria-hidden="true" />
                <span>Results &amp; Rankings</span>
              </div>
              <div className="floating-status floating-status-two">
                <BarChart3 size={18} aria-hidden="true" />
                <span>Performance Insights</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section intro-section" id="what-we-do">
          <div className="shell split-heading">
            <div>
              <p className="section-label">What We Do</p>
              <h2>We simplify the complete examination process.</h2>
            </div>
            <p>
              CodonMind provides a centralized digital platform that helps
              educational institutes manage students, questions, examinations,
              results and performance data efficiently.
            </p>
          </div>
        </section>

        <section className="section platform-section" id="platform">
          <div className="shell">
            <div className="section-heading centered-heading">
              <p className="section-label">Our Examination Platform</p>
              <h2>One platform for the complete CBT workflow.</h2>
            </div>
            <div className="feature-grid feature-grid-first">
              {platformFeatures.map(
                ({ icon: Icon, title, description, tone }, index) => (
                  <article className={`feature-card tone-${tone}`} key={title}>
                    <div className="feature-topline">
                      <span className="feature-icon">
                        <Icon size={23} strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <span className="feature-number">0{index + 1}</span>
                    </div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </article>
                ),
              )}
            </div>
          </div>
        </section>

        <section className="section roles-section" id="roles">
          <div className="shell roles-layout">
            <div className="roles-intro">
              <h2>Built for Different Roles</h2>
              <div className="role-orbit" aria-hidden="true">
                <span>
                  <GraduationCap size={24} />
                </span>
                <span>
                  <BookOpenText size={24} />
                </span>
                <span>
                  <Building2 size={24} />
                </span>
                <i>CM</i>
              </div>
            </div>
            <div className="role-list">
              {roles.map(({ icon: Icon, title, description }, index) => (
                <article className="role-item" key={title}>
                  <span className="role-index">0{index + 1}</span>
                  <span className="role-icon">
                    <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section performance-section" id="performance">
          <div className="shell performance-layout">
            <div className="performance-copy">
              <p className="section-label label-light">
                Understand Performance Better
              </p>
              <h2>
                An examination should not end when a student clicks Submit.
              </h2>
              <p>
                CodonMind helps institutes understand examination data and
                identify:
              </p>
              <ul>
                {performancePoints.map((point) => (
                  <li key={point}>
                    <CheckCircle2 size={18} aria-hidden="true" /> {point}
                  </li>
                ))}
              </ul>
            </div>

            <div
              className="insight-panel"
              aria-label="Performance insights interface"
            >
              <div className="insight-panel-header">
                <span>
                  <BarChart3 size={18} aria-hidden="true" /> Performance
                  Insights
                </span>
                <i>
                  <span />
                  <span />
                  <span />
                </i>
              </div>
              <div className="insight-panel-body">
                <div className="insight-summary">
                  <div>
                    <small>Student performance</small>
                    <strong>Performance</strong>
                  </div>
                  <div className="summary-badge">
                    <Award size={16} aria-hidden="true" /> Student rankings
                  </div>
                </div>
                <div className="insight-chart" aria-hidden="true">
                  <div className="insight-grid">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <svg viewBox="0 0 500 190">
                    <defs>
                      <linearGradient id="darkArea" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0"
                          stopColor="#a99bff"
                          stopOpacity=".34"
                        />
                        <stop offset="1" stopColor="#a99bff" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      className="dark-area"
                      d="M0 156 C42 152 75 91 122 111 S195 149 242 101 S323 119 371 67 S438 62 500 24 L500 190 L0 190 Z"
                    />
                    <path
                      className="dark-line"
                      d="M0 156 C42 152 75 91 122 111 S195 149 242 101 S323 119 371 67 S438 62 500 24"
                    />
                    <circle cx="371" cy="67" r="7" />
                  </svg>
                </div>
                <div className="insight-bottom">
                  <div>
                    <span>Areas where students are struggling</span>
                    <i>
                      <b />
                    </i>
                  </div>
                  <div>
                    <span>Subjects that need more attention</span>
                    <i>
                      <b />
                    </i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section growth-section" id="growth">
          <div className="shell growth-layout">
            <div className="growth-copy">
              <p className="section-label">Technology Built for Growth</p>
              <h2>
                CodonMind is built as a multi-institute examination platform.
              </h2>
              <p>
                Different educational institutes can use the system while
                keeping their students, examinations, questions and results
                separately managed.
              </p>
              <p>
                The platform continues to evolve with better automation,
                analytics and examination management capabilities.
              </p>
            </div>

            <div
              className="growth-map"
              aria-label="Multi-institute platform structure"
            >
              <div className="map-lines" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="map-core">
                <i>CM</i>
                <strong>CodonMind</strong>
                <small>Examination Platform</small>
              </div>
              <div className="map-node map-node-one">
                <Users size={18} aria-hidden="true" />
                <span>Students</span>
              </div>
              <div className="map-node map-node-two">
                <ClipboardCheck size={18} aria-hidden="true" />
                <span>Examinations</span>
              </div>
              <div className="map-node map-node-three">
                <BookOpenText size={18} aria-hidden="true" />
                <span>Questions</span>
              </div>
              <div className="map-node map-node-four">
                <Award size={18} aria-hidden="true" />
                <span>Results</span>
              </div>
              <div className="map-caption">
                <Layers size={17} aria-hidden="true" /> Multi-institute
                examination platform
              </div>
            </div>
          </div>
        </section>

        <section className="section objective-section" id="objective">
          <div className="shell objective-card">
            <div className="objective-number" aria-hidden="true">
              01
            </div>
            <div>
              <p className="section-label">Our Objective</p>
              <h2>
                Make digital examinations simpler, more organized and more
                useful.
              </h2>
              <p>
                CodonMind helps educational institutes spend less time managing
                examination operations and more time understanding student
                performance.
              </p>
            </div>
          </div>
        </section>

        <section className="cta-section">
          <div className="shell cta-card">
            <div>
              <p className="section-label label-light">
                Build Better Examination Systems
              </p>
              <h2>Interested in using CodonMind for your institute?</h2>
            </div>
            <a className="button button-white" href="#contact">
              Contact Us <ArrowRight size={18} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section className="section contact-section" id="contact">
          <div className="shell contact-layout">
            <div className="contact-copy">
              <h2>Contact</h2>
              <div className="contact-brand">
                <span className="brand-mark" aria-hidden="true">
                  <span />
                </span>
                <div>
                  <strong>CodonMind</strong>
                  <span>Examination Technology Platform</span>
                </div>
              </div>
              <div className="contact-detail">
                <span>
                  <Mail size={18} aria-hidden="true" />
                </span>
                <div>
                  <strong>Business Email:</strong>
                  <a href="mailto:hello@codonmind.in">hello@codonmind.in</a>
                </div>
              </div>
              <div className="contact-detail">
                <span>
                  <MapPin size={18} aria-hidden="true" />
                </span>
                <div>
                  <strong>Location:</strong>
                  <p>Tripura, India</p>
                </div>
              </div>
              <p className="contact-description">
                CodonMind develops digital examination and CBT solutions for
                educational institutes.
              </p>
            </div>

            <ContactForm />
          </div>
        </section>

        <footer className="site-footer" id="footer">
          <div className="shell footer-main">
            <div>
              <a className="brand footer-brand" href="#top">
                <span
                  className="brand-mark brand-mark-light"
                  aria-hidden="true"
                >
                  <span />
                </span>
                <span>CodonMind</span>
              </a>
              <p>Examination Technology Platform</p>
            </div>
            <nav aria-label="Footer navigation">
              <a href="#footer">Privacy Policy</a>
              <a href="#footer">Terms of Service</a>
              <a href="#contact">Contact</a>
            </nav>
          </div>
          <div className="shell footer-bottom">
            © 2026 CodonMind. All rights reserved.
          </div>
        </footer>
      </div>
    </main>
  );
}
