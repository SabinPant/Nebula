/**
 * Nebula Index Chart
 *
 * Reusable area chart showing the Nebula Index (average of all stocks).
 * Used on Trader Dashboard, Broker Dashboard, and Admin Dashboard.
 */

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import api from "../../services/api";
import { formatPaise } from "../../lib/utils";

interface Props {
  height?: number;
  showDetails?: boolean;
  pollingInterval?: number;
}

interface DataPoint {
  time: string;
  value: number;
}

const MAX_DATA_POINTS = 60;

export function NebulaIndexChart({
  height = 250,
  showDetails = true,
  pollingInterval = 3000,
}: Props) {
  const [data, setData] = useState<DataPoint[]>([]);
  const [indexValue, setIndexValue] = useState<number | null>(null);
  const [indexChange, setIndexChange] = useState<number>(0);
  const [indexChangePercent, setIndexChangePercent] = useState<string>("0.00");

  const computeIndex = useCallback(
    (stocks: { currentPrice: number; previousClose: number }[]) => {
      const avg =
        stocks.reduce((acc, s) => acc + s.currentPrice, 0) / stocks.length;
      const prevAvg =
        stocks.reduce((acc, s) => acc + s.previousClose, 0) / stocks.length;
      const change = avg - prevAvg;
      const pct = ((change / prevAvg) * 100).toFixed(2);

      setIndexValue(avg);
      setIndexChange(change);
      setIndexChangePercent(pct);

      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      setData((prev) => {
        const next = [
          ...prev,
          { time: timeStr, value: Math.round((avg / 100) * 100) / 100 },
        ];
        return next.length > MAX_DATA_POINTS
          ? next.slice(-MAX_DATA_POINTS)
          : next;
      });
    },
    [],
  );

  // Fetch history on mount
  useEffect(() => {
    let mounted = true;

    async function fetchHistory() {
      try {
        const { data: historyData } = await api.get(
          "/market/index-history?interval=1m&limit=60",
        );
        if (!mounted || !historyData.length) return;

        const points = historyData.map(
          (d: { time: number; value: number }) => ({
            time: new Date(d.time * 1000).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }),
            value: d.value,
          }),
        );

        setData(points);
      } catch {
        // Fallback to live data only
      }
    }

    fetchHistory();
    return () => {
      mounted = false;
    };
  }, []);

  // Live polling
  useEffect(() => {
    let mounted = true;

    async function fetchLatest() {
      try {
        const { data: stocksData } = await api.get("/market/stocks");
        if (mounted && stocksData.length) {
          computeIndex(stocksData);
        }
      } catch {
        // Silently fail
      }
    }

    fetchLatest();
    const interval = setInterval(fetchLatest, pollingInterval);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [pollingInterval, computeIndex]);

  const isUp = indexChange >= 0;
  const chartColor = isUp ? "#16a34a" : "#dc2626";

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={data}
          margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
        >
          <defs>
            <linearGradient id="indexGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColor} stopOpacity={0.15} />
              <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value: any) => [
              `Rs. ${Number(value).toFixed(2)}`,
              "Index",
            ]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={chartColor}
            strokeWidth={2}
            fill="url(#indexGradient)"
            dot={false}
            activeDot={{ r: 4, fill: chartColor }}
          />
        </AreaChart>
      </ResponsiveContainer>
      {showDetails && indexValue !== null && (
        <div className="mt-3 text-center">
          <p className="text-2xl font-bold text-gray-900">
            {formatPaise(indexValue)}
          </p>
          <p
            className={`text-sm font-medium mt-0.5 ${
              isUp ? "text-green-600" : "text-red-500"
            }`}
          >
            {isUp ? "+" : ""}
            {formatPaise(indexChange)} ({indexChangePercent}%)
          </p>
        </div>
      )}
    </div>
  );
}
