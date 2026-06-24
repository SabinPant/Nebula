/**
 * Nebula Index Chart
 *
 * Reusable area chart showing the Nebula Index (average of all stocks).
 * Used on Trader Dashboard, Broker Dashboard, and Admin Dashboard.
 *
 * Internal contract: all `value` fields are stored in paise (integer).
 * `formatPaise` is the single conversion boundary at display time.
 */

import { useState, useEffect, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import api from "../../services/api";
import { formatPaise } from "../../lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  height?: number;
  showDetails?: boolean;
  pollingInterval?: number;
}

interface DataPoint {
  time: string;
  /** Value stored in paise (integer). */
  value: number;
}

type LoadState = "loading" | "empty" | "ready";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_DATA_POINTS = 60;

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div
      className="w-full rounded-lg overflow-hidden bg-slate-100 animate-pulse"
      style={{ height }}
    >
      <div className="h-full w-full flex flex-col justify-end gap-1 px-4 pb-4 pt-8">
        {/* Fake Y-axis ticks */}
        <div className="flex gap-3 h-full">
          <div className="flex flex-col justify-between py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-12 h-2 bg-slate-200 rounded" />
            ))}
          </div>
          {/* Fake chart area */}
          <div className="flex-1 flex items-end gap-1">
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 bg-slate-200 rounded-t"
                style={{ height: `${30 + Math.sin(i * 0.7) * 20 + 30}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function ChartEmpty({ height }: { height: number }) {
  return (
    <div
      className="w-full rounded-lg border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-3"
      style={{ height }}
    >
      <svg
        className="w-10 h-10 text-slate-300"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 13.5l4.5-4.5 3 3 4.5-5.25L21 10.5M3 20.25h18"
        />
      </svg>
      <p className="text-xs font-medium text-slate-400 tracking-wide uppercase">
        No market data
      </p>
      <p className="text-xs text-slate-300">Waiting for live feed…</p>
    </div>
  );
}

// ─── Custom Tooltip ────────────────────────────────────────────────────────────

function IndexTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value as number | undefined;
  const timeLabel = payload[0]?.payload?.time as string | undefined;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-left">
      <p className="text-xs text-slate-400 font-medium tracking-widest uppercase mb-1">
        {timeLabel || "—"}
      </p>
      <p className="text-sm font-mono font-semibold text-slate-900">
        {val !== undefined ? formatPaise(val) : "—"}
      </p>
    </div>
  );
}

// ─── Live Pulse Dot ───────────────────────────────────────────────────────────

function LiveDot({ color }: { color: string }) {
  return (
    <span className="relative flex items-center justify-center w-2.5 h-2.5">
      <span
        className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
        style={{ backgroundColor: color }}
      />
      <span
        className="relative inline-flex rounded-full w-1.5 h-1.5"
        style={{ backgroundColor: color }}
      />
    </span>
  );
}

// ─── Mini Sparkline (summary row) ─────────────────────────────────────────────

function MiniSparkline({ data, color }: { data: DataPoint[]; color: string }) {
  const recent = data.slice(-20);
  if (recent.length < 2) return null;

  const min = Math.min(...recent.map((d) => d.value));
  const max = Math.max(...recent.map((d) => d.value));
  const range = max - min || 1;
  const W = 56;
  const H = 24;

  const points = recent
    .map((d, i) => {
      const x = (i / (recent.length - 1)) * W;
      const y = H - ((d.value - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="overflow-visible"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── YAxis Tick ───────────────────────────────────────────────────────────────

function YAxisTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: number };
}) {
  if (x === undefined || y === undefined || !payload) return null;
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      className="fill-slate-400"
      style={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }}
    >
      {formatPaise(payload.value)}
    </text>
  );
}

// ─── XAxis Tick ───────────────────────────────────────────────────────────────

function XAxisTick({
  x,
  y,
  payload,
  index,
  visibleTicksCount,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  index?: number;
  visibleTicksCount?: number;
}) {
  if (
    x === undefined ||
    y === undefined ||
    !payload ||
    index === undefined ||
    visibleTicksCount === undefined
  )
    return null;

  // Show first, last, and every ~10th tick
  const shouldShow =
    index === 0 || index === visibleTicksCount - 1 || index % 10 === 0;

  if (!shouldShow) return null;

  return (
    <text
      x={x}
      y={y + 10}
      textAnchor="middle"
      className="fill-slate-400"
      style={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }}
    >
      {payload.value}
    </text>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function NebulaIndexChart({
  height = 250,
  showDetails = true,
  pollingInterval = 3000,
}: Props) {
  const [data, setData] = useState<DataPoint[]>([]);
  const [indexValue, setIndexValue] = useState<number | null>(null);
  const [indexChange, setIndexChange] = useState<number>(0);
  const [indexChangePercent, setIndexChangePercent] = useState<number>(0);
  const [isUp, setIsUp] = useState<boolean>(true);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [engineOnline, setEngineOnline] = useState(true);
  const historyFetched = useRef(false);

  // ── Fetch history + initial index on mount ─────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const [historyRes, indexRes] = await Promise.all([
          api.get("/market/index-history?interval=1m&limit=60"),
          api.get("/market/index"),
        ]);

        if (!mounted) return;

        // History — server returns value in rupees, convert to paise
        if (historyRes.data?.length) {
          const points: DataPoint[] = historyRes.data.map(
            (d: { time: number; value: number }) => ({
              time: new Date(d.time * 1000).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }),
              value: Math.round(d.value * 100),
            }),
          );
          setData(points);
        }

        // Summary numbers — server already computed
        if (indexRes.data) {
          setIndexValue(indexRes.data.value);
          setIndexChange(indexRes.data.change);
          setIndexChangePercent(indexRes.data.changePercent);
          setIsUp(indexRes.data.isUp);
        }

        setLoadState("ready");
        historyFetched.current = true;
      } catch {
        historyFetched.current = true;
      }
    }

    init();
    return () => {
      mounted = false;
    };
  }, []);

  // ── Live polling: chart data points + summary ──────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const [stocksRes, indexRes, healthRes] = await Promise.all([
          api.get("/market/stocks"),
          api.get("/market/index"),
          api.get("/health"),
        ]);

        if (!mounted) return;

        // Summary numbers from server
        if (indexRes.data) {
          setIndexValue(indexRes.data.value);
          setIndexChange(indexRes.data.change);
          setIndexChangePercent(indexRes.data.changePercent);
          setIsUp(indexRes.data.isUp);
          setLoadState("ready");
        }

        // Engine status from server health check
        if (healthRes.data) {
          setEngineOnline(healthRes.data.engine === "up");
        }

        // Chart data point from stocks
        if (stocksRes.data?.length) {
          // Server returns currentPrice in paise — no client math
          const avgPaise = Math.round(
            stocksRes.data.reduce(
              (sum: number, s: { currentPrice: number }) =>
                sum + s.currentPrice,
              0,
            ) / stocksRes.data.length,
          );

          const now = new Date();
          const timeStr = now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          });

          setData((prev) => {
            const next = [...prev, { time: timeStr, value: avgPaise }];
            return next.length > MAX_DATA_POINTS
              ? next.slice(-MAX_DATA_POINTS)
              : next;
          });
        } else if (historyFetched.current && data.length === 0) {
          setLoadState("empty");
        }
      } catch {
        if (historyFetched.current && data.length === 0) {
          setLoadState("empty");
        }
      }
    }

    poll();
    const interval = setInterval(poll, pollingInterval);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [pollingInterval]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived display (presentation only) ────────────────────────────────────
  const chartColor = isUp ? "#059669" : "#e11d48";
  const chartColorLight = isUp ? "#d1fae5" : "#ffe4e6";
  const latestValue = data.length > 0 ? data[data.length - 1].value : null;

  // ── Render: loading skeleton ───────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <div>
        <ChartSkeleton height={height} />
        {showDetails && (
          <div className="mt-4 flex items-center justify-between px-1 animate-pulse">
            <div className="space-y-2">
              <div className="h-7 w-36 bg-slate-200 rounded" />
              <div className="h-4 w-24 bg-slate-100 rounded" />
            </div>
            <div className="h-6 w-14 bg-slate-100 rounded" />
          </div>
        )}
      </div>
    );
  }

  // ── Render: empty state ────────────────────────────────────────────────────
  if (loadState === "empty") {
    return (
      <div>
        <ChartEmpty height={height} />
        {showDetails && (
          <div className="mt-4 flex items-center gap-2 px-1">
            <span className="text-xs text-slate-300 font-medium tracking-wide uppercase">
              No data available
            </span>
          </div>
        )}
      </div>
    );
  }

  // ── Render: chart ──────────────────────────────────────────────────────────
  return (
    <div className="select-none">
      <div
        className="relative rounded-xl border border-slate-200 bg-white overflow-hidden"
        style={{
          boxShadow:
            "0 1px 3px 0 rgb(0 0 0 / 0.04), 0 0 0 1px rgb(0 0 0 / 0.03)",
        }}
      >
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
          <LiveDot color={engineOnline ? chartColor : "#94a3b8"} />
          <span
            className="text-xs font-mono font-medium tracking-wider"
            style={{ color: engineOnline ? chartColor : "#94a3b8" }}
          >
            {engineOnline ? "LIVE" : "OFFLINE"}
          </span>
        </div>

        <ResponsiveContainer width="100%" height={height}>
          <AreaChart
            data={data}
            margin={{ top: 16, right: 12, left: 64, bottom: 24 }}
          >
            <defs>
              <linearGradient
                id="nebulaBullGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#059669" stopOpacity={0.18} />
                <stop offset="60%" stopColor="#059669" stopOpacity={0.06} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0} />
              </linearGradient>
              <linearGradient
                id="nebulaBearGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#e11d48" stopOpacity={0.18} />
                <stop offset="60%" stopColor="#e11d48" stopOpacity={0.06} />
                <stop offset="100%" stopColor="#e11d48" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              horizontal
              vertical={false}
              stroke="#e2e8f0"
              strokeDasharray="0"
              strokeWidth={1}
            />

            <XAxis
              dataKey="time"
              tick={<XAxisTick visibleTicksCount={data.length} />}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={false}
              interval={0}
            />

            <YAxis
              tick={<YAxisTick />}
              axisLine={false}
              tickLine={false}
              domain={["auto", "auto"]}
              width={60}
            />

            {latestValue !== null && (
              <ReferenceLine
                y={latestValue}
                stroke={chartColor}
                strokeDasharray="4 3"
                strokeWidth={1}
                strokeOpacity={0.6}
              />
            )}

            <Tooltip
              content={<IndexTooltip />}
              cursor={{
                stroke: "#94a3b8",
                strokeWidth: 1,
                strokeDasharray: "3 3",
              }}
              animationDuration={100}
            />

            <Area
              type="monotone"
              dataKey="value"
              stroke={chartColor}
              strokeWidth={2}
              fill={`url(#${isUp ? "nebulaBullGradient" : "nebulaBearGradient"})`}
              dot={false}
              activeDot={{
                r: 4,
                fill: chartColor,
                stroke: "#ffffff",
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Summary panel */}
      {showDetails && indexValue !== null && (
        <div className="mt-4 flex items-center justify-between px-1">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-slate-400 tracking-widest uppercase leading-none">
              Nebula Index
            </span>
            <p className="text-2xl font-mono font-bold text-slate-900 leading-tight tabular-nums">
              {formatPaise(indexValue)}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="inline-flex items-center gap-1 text-sm font-mono font-semibold tabular-nums rounded-md px-1.5 py-0.5"
                style={{ color: chartColor, backgroundColor: chartColorLight }}
              >
                <svg
                  className="w-3 h-3 shrink-0"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                >
                  {isUp ? (
                    <path d="M6 2l4 5H2l4-5z" />
                  ) : (
                    <path d="M6 10L2 5h8l-4 5z" />
                  )}
                </svg>
                {isUp ? "+" : ""}
                {formatPaise(indexChange)}
              </span>
              <span
                className="text-sm font-mono font-medium tabular-nums"
                style={{ color: chartColor }}
              >
                {isUp ? "+" : ""}
                {indexChangePercent}%
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <MiniSparkline data={data} color={chartColor} />
            <div className="flex items-center gap-1.5">
              <LiveDot color={engineOnline ? chartColor : "#94a3b8"} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
