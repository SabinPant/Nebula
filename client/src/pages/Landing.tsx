/**
 * Landing Page
 *
 * Public home page — first impression for all visitors.
 * Structure: Navbar → Ticker → Hero → Stats → Features
 * → How It Works → User Roles → CTA Banner → Footer.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import api from "../services/api";
import { formatPaise } from "../lib/utils";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { NebulaIndexChart } from "../components/market/NebulaIndexChart";

const features = [
  {
    title: "Virtual Balance",
    description:
      "Start with Rs. 50,000 in virtual funds. Place orders, build a portfolio, and learn money management without any real financial risk.",
  },
  {
    title: "Market Simulation Engine",
    description:
      "Prices move using a custom Geometric Brownian Motion engine. Candlestick charts, order books, circuit breakers — the full picture, simulated.",
  },
  {
    title: "AI Coaching",
    description:
      "Ask our Gemini-powered assistant anything — analyse your portfolio, understand a trade, or get a market explainer. Personalised guidance, on demand.",
  },
  {
    title: "Broker System",
    description:
      "Licensed brokers review your progress and can add collateral to your account. A structured bridge between virtual practice and real markets.",
  },
];

const steps = [
  {
    number: "01",
    title: "Create your account",
    description:
      "Sign up with your email or Google account. Just your name and a password — verified instantly.",
  },
  {
    number: "02",
    title: "Receive Rs. 50,000",
    description:
      "Your virtual wallet is funded the moment registration is complete. No delays, no conditions.",
  },
  {
    number: "03",
    title: "Start trading",
    description:
      "Browse stocks, place buy and sell orders, track your portfolio, and learn as you go with AI guidance.",
  },
];

const roles = [
  {
    title: "Trader",
    description:
      "The core user. Registers, receives virtual funds, trades stocks, interacts with AI coaching, and builds their portfolio over time.",
  },
  {
    title: "Broker",
    description:
      "A licensed user who monitors assigned traders, reviews their progress, and can add collateral to accounts — bridging virtual learning with real markets.",
  },
  {
    title: "Admin",
    description:
      "Manages the entire platform — approves broker applications, handles user management, controls the simulation engine, and reviews audit logs.",
  },
];

export function Landing() {
  // Ticker data
  const [tickerStocks, setTickerStocks] = useState<any[]>([]);

  useEffect(() => {
    async function fetchTicker() {
      try {
        const { data } = await api.get("/market/stocks");
        setTickerStocks(data);
      } catch {}
    }
    fetchTicker();
    const interval = setInterval(fetchTicker, 10000);
    return () => clearInterval(interval);
  }, []);

  const displayStocks = tickerStocks.length ? tickerStocks : [];
  const doubledStocks = displayStocks.length
    ? [...displayStocks, ...displayStocks]
    : [];

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ── Ticker Tape ──────────────────────────────────────────────── */}
      <div className="bg-primary-900 overflow-hidden">
        <div className="flex animate-[scroll_10s_linear_infinite] md:animate-[scroll_30s_linear_infinite] whitespace-nowrap py-2">
          {doubledStocks.map((stock, i) => {
            const chgPaise = stock.currentPrice - stock.previousClose;
            const pct = ((chgPaise / stock.previousClose) * 100).toFixed(2);
            const isUp = chgPaise >= 0;

            return (
              <div
                key={i}
                className="inline-flex items-center gap-3 px-6 border-r border-primary-800 text-sm"
              >
                <span className="font-semibold text-gray-200">
                  {stock.symbol}
                </span>
                <span className="text-gray-400">
                  {formatPaise(stock.currentPrice)}
                </span>
                <span className={isUp ? "text-green-400" : "text-red-400"}>
                  {isUp ? "+" : ""}
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-primary-50 border border-primary-200 rounded-full px-4 py-1.5 text-xs font-semibold text-primary-700 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
              Virtual trading platform for Nepal
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight tracking-tight">
              Learn to trade.
              <br />
              <span className="text-primary-700">Zero risk.</span>
            </h1>

            <p className="mt-6 text-lg text-gray-500 leading-relaxed max-w-xl">
              Nebula simulates real market dynamics so you can practice trading
              with confidence. Start with Rs. 50,000 in virtual funds, get AI
              coaching, and build real skills without risking a single rupee.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/register">
                <Button size="lg">Start trading free</Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary" size="lg">
                  Already a member?
                </Button>
              </Link>
            </div>

            <p className="mt-4 text-sm text-gray-400">
              No credit card required &middot; Rs. 50,000 virtual balance on
              signup
            </p>
          </div>

          {/* Nebula Index card */}
          <NebulaIndexChart height={220} showDetails pollingInterval={5000} />
        </div>
      </section>

      {/* ── Stats Bar ───────────────────────────────────────────────── */}
      <div className="border-y border-gray-200 bg-surface-50">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-200">
          {[
            { value: "Rs. 50K", label: "Virtual starting balance" },
            { value: "10+", label: "Stocks available to trade" },
            { value: "AI", label: "Coaching via Gemini" },
            { value: "3", label: "Roles — Trader, Broker, Admin" },
          ].map((stat, i) => (
            <div key={i} className="py-6 text-center">
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <p className="text-xs font-semibold tracking-wider text-primary-600 uppercase mb-3">
          Platform Features
        </p>
        <div className="grid lg:grid-cols-2 gap-12 items-start mb-12">
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight leading-tight">
            Built for learning,
            <br />
            designed to feel real
          </h2>
          <p className="text-base text-gray-500 leading-relaxed">
            Nebula isn't a basic demo. It's a full simulation platform with a
            custom market engine, real-time price updates, and a broker system
            that mirrors how financial markets operate.
          </p>
        </div>

        <div className="grid md:grid-cols-2 border border-gray-200 rounded-xl overflow-hidden divide-x divide-y divide-gray-200">
          {features.map((f) => (
            <div key={f.title} className="bg-white p-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {f.title}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────────── */}
      <section className="bg-primary-900 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold tracking-wider text-primary-300 uppercase mb-3">
            Getting Started
          </p>
          <h2 className="text-3xl font-bold text-white tracking-tight mb-3">
            Up and trading in under 2 minutes
          </h2>
          <p className="text-base text-gray-400 max-w-xl mb-14">
            Three steps from signup to your first order. No paperwork, no phone
            verification, no real money.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((step) => (
              <div
                key={step.number}
                className="bg-primary-800/50 border border-primary-700/50 rounded-2xl p-7"
              >
                <p className="text-sm font-bold text-primary-300 tracking-wider mb-4">
                  {step.number}
                </p>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── User Roles ────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <p className="text-xs font-semibold tracking-wider text-primary-600 uppercase mb-3">
          Who Uses Nebula
        </p>
        <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-3">
          Three roles, one platform
        </h2>
        <p className="text-base text-gray-500 max-w-xl mb-12">
          Nebula supports a complete trading ecosystem — from new learners to
          licensed brokers and platform administrators.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {roles.map((role) => (
            <div
              key={role.title}
              className="bg-surface-50 border border-gray-200 rounded-xl p-7"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {role.title}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {role.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Banner ────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="bg-primary-900 rounded-2xl px-8 lg:px-16 py-14 text-center">
          <p className="text-xs font-semibold tracking-wider text-primary-300 uppercase mb-4">
            Start Today
          </p>
          <h2 className="text-3xl font-bold text-white tracking-tight leading-tight mb-4 max-w-xl mx-auto">
            The best way to learn trading is to actually trade
          </h2>
          <p className="text-base text-gray-400 leading-relaxed mb-8 max-w-lg mx-auto">
            Nebula gives you real market mechanics, AI guidance, and zero
            financial risk. Begin with Rs. 50,000 and start building skills
            today.
          </p>
          <div className="flex gap-3 justify-center">
            <Link to="/register">
              <Button size="lg">Create free account</Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary" size="lg">
                Log in
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <Footer />
    </div>
  );
}
