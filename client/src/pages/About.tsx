/**
 * About Page
 *
 * Single-column informational page: what Nebula is, how it works,
 * key features, and the technology it runs on. No decorative elements —
 * content-first, matching the platform's understated visual language.
 */

const TECH_STACK = [
  { label: "Backend", value: "NestJS, PostgreSQL, Prisma, Redis" },
  { label: "Frontend", value: "React, TypeScript, Tailwind CSS" },
  { label: "Real-time updates", value: "Socket.IO" },
  { label: "Market engine", value: "Independent Node.js service, Redis-backed order book" },
  { label: "Authentication", value: "JWT with refresh rotation, Google OAuth 2.0" },
  { label: "Charts", value: "TradingView Lightweight Charts" },
];

const FEATURES = [
  "Real-time market simulation using Geometric Brownian Motion, with circuit breakers and a live order book",
  "Market and limit order types, matched by price-time priority",
  "Portfolio tracking with average cost basis and unrealized profit and loss",
  "Watchlist with one-time price alerts",
  "Broker-mediated collateral top-ups, with weekly limits and a recorded transaction reference for every request",
  "Learning resources covering market fundamentals and trading concepts",
  "Administrative oversight, including account suspension, broker reassignment, and a complete audit trail",
];

export function About() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
        About Nebula
      </h1>
      <p className="mt-4 text-lg text-gray-500 leading-relaxed">
        Nebula is a virtual stock trading and market-education platform
        simulating the Nepal Stock Exchange.
      </p>

      <section className="mt-16">
        <h2 className="text-2xl font-bold text-gray-900">What is Nebula</h2>
        <div className="mt-4 space-y-4 text-gray-600 leading-relaxed">
          <p>
            Nebula gives traders a virtual balance of Rs. 50,000 and lets
            them place real buy and sell orders against simulated market
            prices. No real money changes hands at any point during
            trading — the platform is a practice environment for
            understanding how order execution, portfolio management, and
            market movement actually work.
          </p>
          <p>
            The platform is organized around three account types — Trader,
            Broker, and Admin — each with a distinct role. This structure
            mirrors how the NEPSE brokerage ecosystem is organized in
            practice, rather than treating trading as an isolated,
            single-user exercise.
          </p>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-bold text-gray-900">How it works</h2>
        <div className="mt-4 space-y-4 text-gray-600 leading-relaxed">
          <p>
            A new trader registers with an email and password or a Google
            account, verifies their email, and selects a broker before
            reaching the trading dashboard. Registration and broker
            selection create the trader's wallet automatically, funded
            with the starting virtual balance.
          </p>
          <p>
            From the dashboard, traders place market or limit orders
            against live simulated prices, track their holdings and
            unrealized profit and loss, and follow price movement through
            candlestick charts and an order book. Additional virtual
            balance is requested through the trader's assigned broker, who
            reviews and processes each top-up with a recorded transaction
            reference — collateral is never added without a traceable
            record.
          </p>
          <p>
            An administrator oversees the platform as a whole: reviewing
            broker applications, managing user accounts, and intervening
            when necessary — suspending an account, reassigning a trader
            to a different broker, or approving a top-up above the
            standard limit. Every administrative and broker action is
            written to an audit log.
          </p>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-bold text-gray-900">Key features</h2>
        <ul className="mt-4 space-y-3">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex gap-3 text-gray-600 leading-relaxed">
              <span className="mt-2.5 w-1 h-1 rounded-full bg-gray-300 shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-bold text-gray-900">Technology</h2>
        <p className="mt-4 text-gray-600 leading-relaxed">
          The platform is split into three independently deployable
          services: a React client, a NestJS server that owns all business
          logic, and a market simulation engine that runs as a fully
          independent process, communicating with the rest of the
          platform exclusively through Redis.
        </p>
        <dl className="mt-6 divide-y divide-gray-100 border-t border-gray-100">
          {TECH_STACK.map((row) => (
            <div
              key={row.label}
              className="py-3 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4"
            >
              <dt className="text-sm text-gray-400 sm:w-40 shrink-0">
                {row.label}
              </dt>
              <dd className="text-sm text-gray-700">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
