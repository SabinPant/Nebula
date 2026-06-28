/**
 * About Page
 *
 * Comprehensive public page: what Nebula is, how it works, and who built it.
 */

import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";

const PLATFORM_FEATURES: {
  icon: string;
  title: string;
  description: string;
}[] = [
  {
    icon: "chart-line",
    title: "Realistic market simulation",
    description:
      "Prices move using Geometric Brownian Motion, the same stochastic model used in quantitative finance. Market hours, circuit breakers, and order books all mirror how NEPSE actually operates.",
  },
  {
    icon: "wallet",
    title: "Rs. 50,000 virtual balance",
    description:
      "Every trader starts on equal footing. No real money changes hands — only your decisions and skills determine how your portfolio grows.",
  },
  {
    icon: "robot",
    title: "AI-powered coaching",
    description:
      "A Google Gemini assistant analyses your portfolio, explains your trade outcomes, and helps you understand why prices moved — like a mentor watching every trade you make.",
  },
  {
    icon: "book-open",
    title: "Learning resources",
    description:
      "Curated articles covering NEPSE basics, fundamental analysis, risk management, and trading psychology — written specifically for Nepali market participants.",
  },
  {
    icon: "building-bank",
    title: "Broker-mediated accounts",
    description:
      "Nebula mirrors real brokerage relationships. Traders are assigned to a broker who processes collateral top-ups and manages accounts — exactly like the real NEPSE ecosystem.",
  },
  {
    icon: "shield-lock",
    title: "Production-grade security",
    description:
      "JWT authentication with refresh rotation, rate limiting, Helmet headers, and Redis-backed wallet locks. Security was designed in from day one — not bolted on after.",
  },
];

const TECH_STACK = [
  { label: "Backend", value: "NestJS · PostgreSQL · Prisma · Redis · BullMQ" },
  { label: "Frontend", value: "React · Vite · TypeScript · Tailwind CSS" },
  { label: "Real-time", value: "Socket.io · Redis Pub/Sub" },
  {
    label: "Market engine",
    value: "Custom GBM simulation · Order book via Redis sorted sets",
  },
  { label: "AI", value: "Google Gemini API" },
  { label: "Charts", value: "TradingView Lightweight Charts" },
  { label: "Auth", value: "Passport.js · JWT · Google OAuth 2.0" },
  { label: "Storage", value: "Cloudinary" },
  { label: "Email", value: "Nodemailer · Mailhog (dev)" },
  { label: "Deployment", value: "Vercel · Render · Neon · Upstash" },
];

const TIMELINE = [
  {
    phase: "Phase 1",
    weeks: "Weeks 1–12",
    title: "Core platform",
    description: "Auth, wallets, orders, portfolio, and real-time market data.",
  },
  {
    phase: "Phase 2",
    weeks: "Weeks 13–18",
    title: "Broker system",
    description:
      "Broker dashboards, top-up flows, audit logs, and account management.",
  },
  {
    phase: "Phase 3",
    weeks: "Weeks 19–22",
    title: "Real engine",
    description:
      "Full GBM pricing engine with order matching, partial fills, and circuit breakers.",
  },
  {
    phase: "Phase 4",
    weeks: "Weeks 23–26",
    title: "Intelligence",
    description: "AI coaching via Gemini and curated learning resources.",
  },
  {
    phase: "Phase 5",
    weeks: "Weeks 27–28",
    title: "Admin panel",
    description:
      "Full platform oversight — users, brokers, stocks, flags, and audit log viewer.",
  },
  {
    phase: "Phase 6",
    weeks: "Weeks 29–32",
    title: "Hardening and deployment",
    description:
      "Security hardening, OWASP audit, and full deployment to Render, Vercel, and Neon.",
  },
];

const ROLES = [
  {
    role: "Trader",
    tagline: "Learn by doing",
    accent: "border-l-indigo-500",
    labelColor: "text-indigo-600",
    points: [
      "Register and verify your email",
      "Get assigned to a broker",
      "Receive Rs. 50,000 virtual balance",
      "Place buy and sell orders",
      "Track portfolio and realised P&L",
      "Chat with the AI assistant",
    ],
  },
  {
    role: "Broker",
    tagline: "Manage and support",
    accent: "border-l-emerald-500",
    labelColor: "text-emerald-600",
    points: [
      "Apply with verification documents",
      "Manage assigned traders",
      "Process collateral top-ups",
      "Flag suspicious activity",
      "Every action is audit-logged",
    ],
  },
  {
    role: "Admin",
    tagline: "Full platform control",
    accent: "border-l-rose-500",
    labelColor: "text-rose-600",
    points: [
      "Approve or reject broker applications",
      "Suspend or reassign users",
      "Manage stocks and market settings",
      "Override top-up limits",
      "View full audit log and financials",
    ],
  },
];

const CERTS = [
  "Cloud Foundations",
  "Data Engineering",
  "ML Foundations",
  "ML for NLP",
  "Generative AI",
];

// SVG icons as inline components — no emoji, no external icon lib dependency
function Icon({ name }: { name: string }) {
  const icons: Record<string, JSX.Element> = {
    "chart-line": (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
    wallet: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <rect x="2" y="6" width="20" height="14" rx="2" />
        <path d="M16 10h2a2 2 0 0 1 0 4h-2v-4z" />
        <path d="M2 10h4" />
      </svg>
    ),
    robot: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <rect x="3" y="8" width="18" height="12" rx="2" />
        <path d="M12 2v6M8 2h8" />
        <circle cx="9" cy="14" r="1.5" />
        <circle cx="15" cy="14" r="1.5" />
        <path d="M9 18h6" />
      </svg>
    ),
    "book-open": (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
    "building-bank": (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 10v11M12 10v11M16 10v11" />
      </svg>
    ),
    "shield-lock": (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="M12 3L4 7v6c0 5 4 8 8 9 4-1 8-4 8-9V7l-8-4z" />
        <rect x="9" y="11" width="6" height="5" rx="1" />
        <path d="M12 8v3" />
      </svg>
    ),
    linkedin: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
    github: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    ),
    globe: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    mail: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m2 7 10 7 10-7" />
      </svg>
    ),
  };
  return icons[name] ?? null;
}

export function About() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-28">
      {/* ── Hero ── */}
      <section className="text-center max-w-3xl mx-auto">
        <span className="inline-block text-xs font-semibold tracking-widest uppercase text-indigo-600 mb-5">
          Final Year Project · BSc Computing · Islington College
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight tracking-tight">
          Learn to trade NEPSE.
          <br />
          No real money required.
        </h1>
        <p className="mt-6 text-lg text-gray-500 leading-relaxed">
          Nebula is a virtual stock trading platform simulating the Nepal Stock
          Exchange. Built for students and aspiring traders who want to develop
          real skills in a realistic environment, before they ever place a real
          trade.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/register">
            <Button size="lg">Start trading free</Button>
          </Link>
          <Link to="/learn">
            <Button size="lg" variant="secondary">
              Browse learning resources
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Stats + Why ── */}
      <section className="grid md:grid-cols-5 gap-10 items-start">
        <div className="md:col-span-3 space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">Why this exists</h2>
          <p className="text-gray-500 leading-relaxed">
            Most Nepali students who want to invest face the same barrier: every
            mistake costs real money, and resources tailored to NEPSE are
            scarce. The gap between classroom theory and actual market
            participation is wide.
          </p>
          <p className="text-gray-500 leading-relaxed">
            Nebula closes that gap. It gives you a safe environment to
            experiment, make mistakes, and understand why they happened — while
            gradually building the intuition that makes a good trader.
          </p>
          <p className="text-gray-500 leading-relaxed">
            The platform simulates NEPSE-listed companies with real sector
            dynamics, mirrors brokerage relationships, and uses AI to coach you
            through your decisions. It's as close to the real market as you can
            get without actually being in it.
          </p>
        </div>
        <div className="md:col-span-2 grid grid-cols-2 gap-3">
          {[
            { label: "Virtual starting balance", value: "Rs. 50,000" },
            { label: "NEPSE-listed stocks", value: "10+" },
            { label: "User roles", value: "3" },
            { label: "AI coaching sessions / day", value: "2 free" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-gray-50 rounded-xl p-5 border border-gray-100"
            >
              <p className="text-2xl font-bold text-indigo-600">{stat.value}</p>
              <p className="mt-1 text-xs text-gray-400 leading-snug">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section>
        <div className="text-center max-w-xl mx-auto mb-10">
          <h2 className="text-2xl font-bold text-gray-900">
            What the platform includes
          </h2>
          <p className="mt-3 text-gray-500">
            Every feature is designed around one goal: making market education
            as realistic and effective as possible.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {PLATFORM_FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-xl border border-gray-100 p-6 hover:border-indigo-100 hover:bg-indigo-50/30 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
                <Icon name={f.icon} />
              </div>
              <h3 className="font-semibold text-gray-900 text-sm leading-snug">
                {f.title}
              </h3>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Engine ── */}
      <section className="grid md:grid-cols-2 gap-10 items-center bg-gray-50 rounded-2xl p-8 sm:p-12">
        <div>
          <span className="text-xs font-semibold tracking-widest uppercase text-indigo-600">
            Under the hood
          </span>
          <h2 className="mt-2 text-2xl font-bold text-gray-900">
            A market engine built from scratch
          </h2>
          <p className="mt-4 text-gray-500 leading-relaxed">
            Nebula's Market Simulation Engine is a fully independent service,
            not a wrapper around someone else's data feed. It generates
            realistic price movements using{" "}
            <span className="font-medium text-gray-700">
              Geometric Brownian Motion (GBM)
            </span>
            , the same stochastic model underlying the Black-Scholes options
            pricing formula.
          </p>
          <p className="mt-3 text-gray-500 leading-relaxed">
            The engine maintains a live order book using Redis sorted sets,
            matches buy and sell orders with support for partial fills and
            self-trade prevention, enforces circuit breakers when price
            movements exceed thresholds, and runs on Nepal Standard Time to
            mirror NEPSE's actual trading hours.
          </p>
          <p className="mt-3 text-gray-500 leading-relaxed">
            It's architected as a commercialisable B2B product — a standalone
            stock simulation API that other platforms could license after the
            FYP concludes.
          </p>
        </div>
        <div className="space-y-3">
          {[
            {
              label: "Pricing model",
              detail: "Geometric Brownian Motion (GBM)",
            },
            { label: "Order book", detail: "Redis sorted sets, live matching" },
            { label: "Fill types", detail: "Full fills, partial fills" },
            {
              label: "Safety",
              detail: "Circuit breakers, self-trade prevention",
            },
            { label: "Timezone", detail: "Asia/Kathmandu (NST)" },
            {
              label: "Queue",
              detail: "BullMQ priority queue with dead letter queue",
            },
            {
              label: "Integration",
              detail: "Health endpoint, 503 on engine down",
            },
          ].map((row) => (
            <div key={row.label} className="flex items-start gap-3 text-sm">
              <span className="text-gray-400 w-36 shrink-0 pt-0.5">
                {row.label}
              </span>
              <span className="text-gray-700">{row.detail}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Roles ── */}
      <section>
        <div className="text-center max-w-xl mx-auto mb-10">
          <h2 className="text-2xl font-bold text-gray-900">
            Three roles, one ecosystem
          </h2>
          <p className="mt-3 text-gray-500">
            Nebula mirrors the real NEPSE structure. Each role has distinct
            responsibilities and its own dashboard.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {ROLES.map((r) => (
            <div
              key={r.role}
              className={`rounded-xl border border-gray-100 border-l-4 ${r.accent} bg-white p-6`}
            >
              <span
                className={`text-xs font-semibold uppercase tracking-widest ${r.labelColor}`}
              >
                {r.role}
              </span>
              <p className="mt-0.5 text-sm text-gray-400">{r.tagline}</p>
              <ul className="mt-4 space-y-2">
                {r.points.map((p) => (
                  <li key={p} className="text-sm text-gray-600 flex gap-2">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tech stack ── */}
      <section>
        <div className="text-center max-w-xl mx-auto mb-10">
          <h2 className="text-2xl font-bold text-gray-900">
            Built on a production-grade stack
          </h2>
          <p className="mt-3 text-gray-500">
            Every technology choice was made deliberately — for scalability,
            correctness, and developer experience at enterprise scale.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {TECH_STACK.map((t) => (
            <div
              key={t.label}
              className="flex gap-4 items-baseline bg-gray-50 rounded-lg px-4 py-3 border border-gray-100"
            >
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-28 shrink-0">
                {t.label}
              </span>
              <span className="text-sm text-gray-700">{t.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Timeline ── */}
      <section>
        <div className="text-center max-w-xl mx-auto mb-10">
          <h2 className="text-2xl font-bold text-gray-900">
            18 months, 15 sprints
          </h2>
          <p className="mt-3 text-gray-500">
            Built iteratively in 2-week Agile Scrum sprints — the same
            methodology used by professional engineering teams.
          </p>
        </div>
        <div className="relative pl-10">
          <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />
          <div className="space-y-7">
            {TIMELINE.map((t, _i) => (
              <div key={t.phase} className="relative flex gap-5 items-start">
                <div className="absolute -left-7 top-1 w-4 h-4 rounded-full bg-white border-2 border-indigo-400 ring-4 ring-white" />
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
                      {t.phase}
                    </span>
                    <span className="text-xs text-gray-400">{t.weeks}</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mt-0.5">
                    {t.title}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{t.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Builder ── */}
      <section>
        <div className="text-center max-w-xl mx-auto mb-10">
          <h2 className="text-2xl font-bold text-gray-900">Who built this</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8 items-start">
          {/* Photo + links */}
          <div className="flex flex-col items-center md:items-start gap-4">
            <img
              src="/sabinpant.jpg"
              alt="Sabin Pant"
              className="w-32 h-32 rounded-2xl object-cover object-top bg-gray-100"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div>
              <h3 className="text-lg font-bold text-gray-900">Sabin Pant</h3>
              <p className="text-sm text-gray-500 mt-0.5">Kathmandu, Nepal</p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <a
                href="mailto:sabinpant100@gmail.com"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 transition-colors"
              >
                <Icon name="mail" />
                sabinpant100@gmail.com
              </a>
              <a
                href="https://www.linkedin.com/in/sabinpant/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 transition-colors"
              >
                <Icon name="linkedin" />
                linkedin.com/in/sabinpant
              </a>
              <a
                href="https://github.com/Sabinpabt23"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 transition-colors"
              >
                <Icon name="github" />
                github.com/Sabinpabt23
              </a>
              <a
                href="http://sabin-portfolio-hazel.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 transition-colors"
              >
                <Icon name="globe" />
                Portfolio
              </a>
            </div>
          </div>

          {/* Bio */}
          <div className="md:col-span-2 space-y-4">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-100 rounded-full px-3 py-1">
              <span>BSc (Hons) Computing</span>
              <span className="text-gray-300">·</span>
              <span>Islington College, Kathmandu</span>
              <span className="text-gray-300">·</span>
              <span>London Metropolitan University</span>
            </div>
            <p className="text-gray-500 leading-relaxed">
              I'm CS/IT student in my final year of BSc (Hons) Computing at
              Islington College.
            </p>
            <p className="text-gray-500 leading-relaxed">
              If, I have to tell about myself Like most developers, I know that
              an hour of planning saves a week of debugging. Before I even think
              about firing up my IDE, I'm usually mapping out actor flows,
              sketching database schemas, and trying to predict where things
              might break (hello, race conditions). For me, that design phase
              isn’t the prep work it’s the actual work. My guiding principle is
              pretty simple: solutions need to work in production, not just in
              localhost. My current technical playground includes Core Java,
              Node.js with Express/NestJS, React, PostgreSQL, Redis, Docker, and
              Git/GitHub CI/CD. But honestly, I care way more about the why than
              the what. I love obsessing over why certain architectural
              decisions cause headaches months later and how to design for the
              worst-case scenario, not just the happy path. When I'm not
              over-engineering a database schema, you might find me tinkering
              with microcontrollers and IoT setups just for fun.
            </p>
            <p className="text-gray-500 leading-relaxed">
              My long-term goal is to work on enterprise-level infrastructure:
              banking systems, payment gateways, and financial data pipelines,
              environments where correctness, reliability, and scale are
              non-negotiable. Nebula is my attempt to build something at that
              standard while still a student.
            </p>
            <p className="text-gray-500 leading-relaxed">
              I'm particularly focused on system design and reliability right
              now. I want to build things that don't just work, but hold up
              under pressure. I hold five AWS certifications spanning cloud,
              data engineering, and machine learning.
            </p>
            {/* AWS certs */}
            <div className="pt-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                AWS Certifications
              </p>
              <div className="flex flex-wrap gap-2">
                {CERTS.map((cert) => (
                  <span
                    key={cert}
                    className="inline-block text-xs bg-amber-50 text-amber-700 border border-amber-100 rounded-full px-3 py-1 font-medium"
                  >
                    AWS · {cert}
                  </span>
                ))}
              </div>
            </div>
            {/* Skills chips */}
            <div className="pt-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Core skills
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  "Node.js",
                  "NestJS",
                  "TypeScript",
                  "PostgreSQL",
                  "Redis",
                  "Docker",
                  "System design",
                  "REST API design",
                  "React",
                  "Next.js",
                  "AWS",
                ].map((s) => (
                  <span
                    key={s}
                    className="inline-block text-xs bg-gray-50 text-gray-600 border border-gray-100 rounded-full px-3 py-1"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FYP note ── */}
      <section className="border border-gray-100 rounded-2xl p-8 sm:p-10 bg-gray-50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl font-bold text-gray-900">
            Built to production standards, not deadline standards
          </h2>
          <p className="mt-4 text-gray-500 leading-relaxed">
            Nebula is a Final Year Project, but it's being built the way
            production software is built: real authentication, real security
            practices, real system design decisions, real testing. No shortcuts
            taken to hit a submission date. The goal is software worth showing
            in a job interview, and a platform that could genuinely help Nepali
            students learn to invest.
          </p>
          <p className="mt-3 text-gray-500 leading-relaxed">
            The Market Simulation Engine is designed as a standalone,
            commercialisable product that other platforms could license after
            the project concludes.
          </p>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Ready to start?</h2>
        <p className="mt-3 text-gray-500">
          Create your account and get Rs. 50,000 in virtual funds instantly.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/register">
            <Button size="lg">Create free account</Button>
          </Link>
          <Link to="/learn">
            <Button size="lg" variant="secondary">
              Explore the learning hub
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
