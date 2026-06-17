/**
 * Landing Page
 *
 * Public home page — first impression for all visitors.
 * Structure: Navbar → Ticker → Hero → Stats → Features
 * → How It Works → User Roles → CTA Banner → Footer.
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  Time,
  ColorType,
} from "lightweight-charts";
import { Button } from "../components/ui/Button";
import api from "../services/api";
import { formatPaise } from "../lib/utils";

// ── Fallback data (Used if API is down) ──────────────────────────────────
const FALLBACK_STOCKS = [
  { symbol: "NABIL", currentPrice: 48500, previousClose: 47317 },
  { symbol: "NICA", currentPrice: 62000, previousClose: 62753 },
  { symbol: "GBIME", currentPrice: 31200, previousClose: 29489 },
  { symbol: "NTC", currentPrice: 92500, previousClose: 89718 },
  { symbol: "SHIVM", currentPrice: 54000, previousClose: 54408 },
  { symbol: "HDL", currentPrice: 315000, previousClose: 281250 },
  { symbol: "CHCL", currentPrice: 78500, previousClose: 80348 },
  { symbol: "UPPER", currentPrice: 38500, previousClose: 37782 },
  { symbol: "NLIC", currentPrice: 125000, previousClose: 115313 },
  { symbol: "SCB", currentPrice: 72000, previousClose: 72361 },
];

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
  const [stocks, setStocks] = useState(FALLBACK_STOCKS);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  // ── 1. Fetch data & Update Chart (Polling) ───────────────────────────
  useEffect(() => {
    let mounted = true;

    // Seed the chart with fallback data immediately so it's never blank
    const seedFallback = () => {
      if (!seriesRef.current) return;
      const now = Math.floor(Date.now() / 1000);
      const avgRupees =
        FALLBACK_STOCKS.reduce((acc, s) => acc + s.currentPrice, 0) /
        FALLBACK_STOCKS.length /
        100;
      // Build 30 synthetic historical points spaced 1 minute apart
      const points = Array.from({ length: 30 }, (_, i) => ({
        time: (now - (29 - i) * 60) as Time,
        value: avgRupees * (1 + (Math.random() - 0.5) * 0.002),
      }));
      seriesRef.current.setData(points);
    };

    const fetchHistory = async () => {
      try {
        const [historyRes, stocksRes] = await Promise.all([
          api.get("/market/index-history?interval=1m&limit=30"),
          api.get("/market/stocks"),
        ]);
        if (!mounted) return;

        const indexData: { time: number; value: number }[] =
          historyRes.data ?? [];
        const liveStocks: any[] = stocksRes.data ?? [];

        if (liveStocks.length) setStocks(liveStocks);

        if (indexData.length && seriesRef.current) {
          seriesRef.current.setData(
            indexData.map((d) => ({ time: d.time as Time, value: d.value })),
          );
        }
      } catch (err) {
        console.error("Failed to fetch market history, keeping fallback.", err);
      }
    };

    const fetchMarketData = async () => {
      try {
        // Safe to call without auth on public endpoint
        const { data } = await api.get("/market/stocks");
        if (!mounted) return;

        setStocks(data);
        updateChart(data);
      } catch (err) {
        console.error("Failed to fetch market data, using fallback.", err);
        if (mounted) {
          updateChart(FALLBACK_STOCKS);
        }
      }
    };

    const updateChart = (stockData: any[]) => {
      if (!seriesRef.current) return;
      const avgRupees =
        stockData.reduce((acc, s) => acc + s.currentPrice, 0) /
        stockData.length /
        100;
      const now = Math.floor(Date.now() / 1000) as Time;
      seriesRef.current.update({ time: now, value: avgRupees });
    };

    // Show fallback immediately, then replace with real history
    seedFallback();
    fetchHistory();

    // Poll every 3 seconds to match the GBM engine's tick interval
    const interval = setInterval(() => {
      fetchMarketData().catch(() => {});
    }, 3000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // ── 2. Initialize Lightweight Chart ────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (chartRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      height: 120,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "transparent",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      timeScale: { visible: false },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addLineSeries({
      color: "#16a34a",
      lineWidth: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // ── Derived Data for UI ─────────────────────────────────────────────────
  // Duplicate exactly once so the seamless CSS loop covers a full 2× set
  const singleStocks = stocks.length ? stocks : FALLBACK_STOCKS;
  const doubledStocks = [...singleStocks, ...singleStocks];

  // Nebula Index Calculations
  const currentIndexPaise =
    stocks.reduce((acc, s) => acc + s.currentPrice, 0) / stocks.length;
  const prevIndexPaise =
    stocks.reduce((acc, s) => acc + s.previousClose, 0) / stocks.length;
  const indexChangePaise = currentIndexPaise - prevIndexPaise;
  const indexChangePercent = (
    (indexChangePaise / prevIndexPaise) *
    100
  ).toFixed(2);
  const isIndexUp = indexChangePaise >= 0;

  return (
    <div className="min-h-screen bg-white">
      {/* ── Navbar ──────────────────────────────────────────────────── */}
      <nav className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
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
              <Button size="sm">Sign up free</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Ticker Tape ──────────────────────────────────────────────── */}
      <div className="bg-primary-900 overflow-hidden">
        <div
          className="flex animate-scroll whitespace-nowrap py-2"
          style={{ animationDuration: "60s" }}
        >
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
          <div className="hidden lg:block border border-gray-200 rounded-2xl overflow-hidden bg-surface-50">
            <div className="bg-primary-900 px-6 py-4 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-300">
                Nebula Index
              </span>
              <span className="text-xs font-semibold text-green-400 bg-green-900/30 border border-green-700/30 rounded-md px-2.5 py-1">
                Live simulation
              </span>
            </div>
            <div className="px-6 pt-5">
              <p className="text-xs text-gray-400 mb-1">Current value</p>
              <p className="text-4xl font-bold text-gray-900 tracking-tight">
                {(currentIndexPaise / 100).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p
                className={`text-sm font-semibold mt-1.5 ${
                  isIndexUp ? "text-green-600" : "text-red-600"
                }`}
              >
                {isIndexUp ? "+" : ""}
                {(indexChangePaise / 100).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                ({indexChangePercent}%)
              </p>
            </div>
            <div className="px-6 py-4">
              <div className="relative h-[120px] bg-gradient-to-t from-green-50 to-transparent rounded overflow-hidden">
                <div
                  ref={chartContainerRef}
                  style={{ height: "120px", width: "100%" }}
                />
              </div>
            </div>
            <div className="border-t border-gray-200 grid grid-cols-4">
              {["NABIL", "NTC", "HDL", "NICA"].map((sym, i) => {
                const found =
                  stocks.find((s) => s.symbol === sym) ||
                  FALLBACK_STOCKS.find((s) => s.symbol === sym);
                const stock = found || FALLBACK_STOCKS[0];
                const chgPaise = stock.currentPrice - stock.previousClose;
                const pct = ((chgPaise / stock.previousClose) * 100).toFixed(2);
                const isUp = chgPaise >= 0;

                return (
                  <div
                    key={i}
                    className="px-3 py-3 border-r border-gray-200 last:border-r-0 text-center"
                  >
                    <p className="text-xs font-semibold text-gray-900">
                      {stock.symbol}
                    </p>
                    <p
                      className={`text-xs mt-0.5 ${
                        isUp ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {isUp ? "+" : ""}
                      {pct}%
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
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
      <footer className="bg-primary-950 pt-14 pb-7">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            <div className="col-span-2 md:col-span-1">
              <span className="text-xl font-bold text-white">Nebula</span>
              <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                Virtual trading and learning platform. Built for education.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 tracking-wider uppercase mb-4">
                Platform
              </p>
              <ul className="space-y-2.5">
                {[
                  "How it works",
                  "Features",
                  "Market simulation",
                  "AI coaching",
                ].map((l) => (
                  <li key={l}>
                    <span className="text-sm text-gray-400 hover:text-gray-200 transition-colors cursor-pointer">
                      {l}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 tracking-wider uppercase mb-4">
                Learn
              </p>
              <ul className="space-y-2.5">
                {[
                  "Learning resources",
                  "Trading basics",
                  "Market analysis",
                  "Portfolio management",
                ].map((l) => (
                  <li key={l}>
                    <span className="text-sm text-gray-400 hover:text-gray-200 transition-colors cursor-pointer">
                      {l}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 tracking-wider uppercase mb-4">
                Account
              </p>
              <ul className="space-y-2.5">
                <li>
                  <Link
                    to="/register"
                    className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    Sign up
                  </Link>
                </li>
                <li>
                  <Link
                    to="/login"
                    className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    Log in
                  </Link>
                </li>
                <li>
                  <Link
                    to="/broker-apply"
                    className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    Broker application
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-primary-800 pt-6 flex items-center justify-between flex-wrap gap-3">
            <span className="text-sm text-gray-500">
              &copy; {new Date().getFullYear()} Nebula. Built for education.
            </span>
            <div className="flex gap-2.5">
              {["BSc FYP", "Virtual only", "No real trades"].map((b) => (
                <span
                  key={b}
                  className="text-xs font-medium text-gray-500 border border-primary-800 rounded-md px-2.5 py-1"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
