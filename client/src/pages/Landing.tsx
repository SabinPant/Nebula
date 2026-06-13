/**
 * Landing Page
 *
 * Public home page — first impression for all visitors.
 * Hero section with CTA, scrolling ticker tape, features grid,
 * how-it-works steps, and footer.
 *
 * Ticker data is hardcoded for Sprint 2. Will fetch live data
 * from the API when the market module is built in Sprint 4.
 */

import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";

// Placeholder ticker data — matches seeded NEPSE stocks
const tickerStocks = [
  { symbol: "NABIL", price: "Rs. 485.00", change: "+2.50", up: true },
  { symbol: "NICA", price: "Rs. 620.00", change: "-1.20", up: false },
  { symbol: "GBIME", price: "Rs. 312.00", change: "+5.80", up: true },
  { symbol: "NTC", price: "Rs. 925.00", change: "+3.10", up: true },
  { symbol: "SHIVM", price: "Rs. 540.00", change: "-0.75", up: false },
  { symbol: "HDL", price: "Rs. 3,150.00", change: "+12.00", up: true },
  { symbol: "CHCL", price: "Rs. 785.00", change: "-2.30", up: false },
  { symbol: "UPPER", price: "Rs. 385.00", change: "+1.90", up: true },
  { symbol: "NLIC", price: "Rs. 1,250.00", change: "+8.40", up: true },
  { symbol: "SCB", price: "Rs. 720.00", change: "-0.50", up: false },
];

const features = [
  {
    title: "Virtual Balance",
    description:
      "Start with Rs. 50,000 in virtual funds. Learn to trade without risking a single rupee of real money.",
    icon: "💰",
  },
  {
    title: "Real NEPSE Simulation",
    description:
      "Prices move realistically using a custom simulation engine. Practice in a market that feels real.",
    icon: "📈",
  },
  {
    title: "AI Coaching",
    description:
      "Get personalised guidance from our AI assistant. Ask questions, analyse your portfolio, and learn faster.",
    icon: "🤖",
  },
  {
    title: "Broker System",
    description:
      "Real brokers review your progress and can add collateral. A bridge between practice and real trading.",
    icon: "🤝",
  },
];

const steps = [
  {
    number: "01",
    title: "Create Your Account",
    description:
      "Sign up with your email or Google account. No phone number, no documents — just your name and a password.",
  },
  {
    number: "02",
    title: "Get Rs. 50,000",
    description:
      "Your virtual trading account is funded instantly. Use this to buy and sell NEPSE stocks risk-free.",
  },
  {
    number: "03",
    title: "Start Trading",
    description:
      "Pick stocks from the NEPSE list, place buy and sell orders, watch your portfolio grow — all with virtual money.",
  },
];

export function Landing() {
  return (
    <div className="min-h-screen bg-white">
      {/* ─── Ticker Tape ──────────────────────────────────────────────── */}
      <div className="bg-primary-900 text-white overflow-hidden">
        <div className="flex animate-scroll space-x-8 py-2 px-4 text-sm">
          {[...tickerStocks, ...tickerStocks].map((stock, i) => (
            <div
              key={i}
              className="flex items-center space-x-2 whitespace-nowrap"
            >
              <span className="font-semibold">{stock.symbol}</span>
              <span className="text-gray-300">{stock.price}</span>
              <span className={stock.up ? "text-green-400" : "text-red-400"}>
                {stock.change}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Navbar ───────────────────────────────────────────────────── */}
      <nav className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              to="/"
              className="text-2xl font-bold text-primary-900 tracking-tight"
            >
              Nebula
            </Link>
            <div className="flex items-center space-x-3">
              <Link to="/login">
                <Button variant="secondary" size="sm">
                  Log in
                </Button>
              </Link>
              <Link to="/register">
                <Button size="sm">Sign up</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
              Learn to Trade on <span className="text-primary-700">NEPSE</span>{" "}
              Risk-Free
            </h1>
            <p className="mt-6 text-lg text-gray-600 leading-relaxed max-w-xl">
              Nebula is Nepal's first virtual stock trading platform built for
              education. Practice with virtual money, learn from AI coaching,
              and build real trading confidence — all without risking a single
              rupee.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
              <Link to="/register">
                <Button size="lg">Start Trading Free</Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary" size="lg">
                  Already a member?
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-sm text-gray-400">
              No credit card required • Virtual Rs. 50,000 on signup
            </p>
          </div>

          {/* Chart placeholder card */}
          <div className="hidden lg:block">
            <div className="bg-surface-50 border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-gray-400">NEPSE Index</p>
                  <p className="text-2xl font-bold text-gray-900">2,845.32</p>
                </div>
                <span className="text-green-600 bg-green-50 px-2 py-1 rounded text-sm font-medium">
                  +12.45 (0.44%)
                </span>
              </div>
              <div className="h-48 bg-gray-100 rounded flex items-center justify-center">
                <p className="text-gray-400 text-sm">
                  Charts coming in Sprint 4
                </p>
              </div>
              <div className="flex space-x-4 mt-4">
                {["NABIL", "NTC", "HDL", "CHCL"].map((symbol) => (
                  <div key={symbol} className="flex-1 text-center">
                    <p className="text-xs font-semibold text-gray-900">
                      {symbol}
                    </p>
                    <p className="text-xs text-green-600">▲</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features ─────────────────────────────────────────────────── */}
      <section className="bg-surface-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">
              Everything You Need to Learn Trading
            </h2>
            <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
              Nebula gives you the tools, data, and guidance to go from beginner
              to confident trader — all in a risk-free environment.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
              >
                <div className="text-3xl mb-3">{feature.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">
              Start in Under 2 Minutes
            </h2>
            <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
              Three simple steps from signup to your first trade. No paperwork,
              no real money, no risk.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step) => (
              <div key={step.number} className="text-center">
                <div className="w-12 h-12 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-4">
                  {step.number}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link to="/register">
              <Button size="lg">Create Your Free Account</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────────── */}
      <footer className="bg-primary-900 text-gray-300 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="mb-4 md:mb-0">
              <span className="text-xl font-bold text-white">Nebula</span>
              <p className="text-sm mt-1 text-gray-400">
                Virtual NEPSE Trading & Learning Platform
              </p>
            </div>
            <div className="flex space-x-6 text-sm">
              <Link to="/login" className="hover:text-white transition-colors">
                Log in
              </Link>
              <Link
                to="/register"
                className="hover:text-white transition-colors"
              >
                Sign up
              </Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-primary-800 text-center text-sm text-gray-400">
            <p>
              &copy; {new Date().getFullYear()} Nebula. Built for education, not
              profit.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
