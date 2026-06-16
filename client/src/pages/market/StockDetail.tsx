/**
 * Stock Detail Page
 *
 * Displays a single stock with live price chart using TradingView
 * Lightweight Charts. Fetches historical OHLCV data via REST on load,
 * then updates the current candle via WebSocket in real-time.
 */

import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
} from "lightweight-charts";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";
import { socket, connectSocket } from "../../lib/socket";
import { formatPaise } from "../../lib/utils";

interface Stock {
  id: string;
  symbol: string;
  companyName: string;
  sector: string;
  currentPrice: number;
  previousClose: number;
  volatility: number;
  isHalted: boolean;
  haltReason: string | null;
}

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
}

interface PriceUpdate {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  isHalted: boolean;
  timestamp: string;
}

export function StockDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const currentCandleRef = useRef<{
    open: number;
    high: number;
    low: number;
  } | null>(null);

  const [stock, setStock] = useState<Stock | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!symbol) return;
    const sym = symbol.toUpperCase();

    async function fetchData() {
      try {
        const [stockRes, historyRes] = await Promise.all([
          api.get(`/market/stocks/${sym}`),
          api.get(`/market/stocks/${sym}/history?interval=1m&limit=100`),
        ]);

        setStock(stockRes.data);

        // Build chart
        if (chartContainerRef.current && !chartRef.current) {
          const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: 400,
            layout: {
              background: { color: "#ffffff" },
              textColor: "#374151",
            },
            grid: {
              vertLines: { color: "#f1f3f5" },
              horzLines: { color: "#f1f3f5" },
            },
            timeScale: {
              timeVisible: true,
              borderColor: "#e5e7eb",
            },
          });

          const series = chart.addCandlestickSeries({
            upColor: "#16a34a",
            downColor: "#dc2626",
            borderUpColor: "#16a34a",
            borderDownColor: "#dc2626",
            wickUpColor: "#16a34a",
            wickDownColor: "#dc2626",
          });

          if (historyRes.data.length > 0) {
            const candleData: CandlestickData[] = historyRes.data.map(
              (c: Candle) => ({
                time: (new Date(c.timestamp).getTime() / 1000) as Time,
                open: c.open / 100,
                high: c.high / 100,
                low: c.low / 100,
                close: c.close / 100,
              }),
            );
            series.setData(candleData);
          }

          chartRef.current = chart;
          seriesRef.current = series;
        }

        // Subscribe to live updates
        connectSocket();
        socket.emit("subscribe:stock", { symbol: sym });
      } catch {
        setError("Failed to load stock data.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Listen for price updates
    socket.on("price:update", (update: PriceUpdate) => {
      if (update.symbol !== sym) return;

      setStock((prev) =>
        prev
          ? {
              ...prev,
              currentPrice: update.price,
              isHalted: update.isHalted,
            }
          : prev,
      );

      // Update current candle
      if (seriesRef.current) {
        const time = (new Date(update.timestamp).getTime() / 1000) as Time;
        const priceInRupees = update.price / 100;

        if (!currentCandleRef.current) {
          currentCandleRef.current = {
            open: priceInRupees,
            high: priceInRupees,
            low: priceInRupees,
          };
        } else {
          if (priceInRupees > currentCandleRef.current.high) {
            currentCandleRef.current.high = priceInRupees;
          }
          if (priceInRupees < currentCandleRef.current.low) {
            currentCandleRef.current.low = priceInRupees;
          }
        }

        seriesRef.current.update({
          time,
          open: currentCandleRef.current.open,
          high: currentCandleRef.current.high,
          low: currentCandleRef.current.low,
          close: priceInRupees,
        });
      }
    });

    // Handle resize
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      socket.off("price:update");
      socket.emit("unsubscribe:stock", { symbol: sym });
      window.removeEventListener("resize", handleResize);
      currentCandleRef.current = null;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [symbol]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !stock) {
    return (
      <div className="min-h-screen bg-surface-50 p-6">
        <Alert variant="error">{error || "Stock not found."}</Alert>
        <div className="mt-4">
          <Link to="/market">
            <Button variant="secondary">Back to Market</Button>
          </Link>
        </div>
      </div>
    );
  }

  const change = stock.currentPrice - stock.previousClose;
  const changePercent = ((change / stock.previousClose) * 100).toFixed(2);
  const isUp = change >= 0;

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <Link
              to="/dashboard"
              className="text-xl font-bold text-primary-900"
            >
              Nebula
            </Link>
            <Link
              to="/market"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Market
            </Link>
            <span className="text-sm text-primary-700 font-medium">
              {stock.symbol}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Stock header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {stock.symbol}
              </h1>
              {stock.isHalted && (
                <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                  HALTED
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{stock.companyName}</p>
            <p className="text-xs text-gray-400 mt-0.5">{stock.sector}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">
              {formatPaise(stock.currentPrice)}
            </p>
            <p
              className={`text-sm font-medium ${
                isUp ? "text-green-600" : "text-red-500"
              }`}
            >
              {isUp ? "+" : ""}
              {changePercent}%
            </p>
          </div>
        </div>

        {/* Chart */}
        <Card>
          <div ref={chartContainerRef} />
        </Card>

        {/* Details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <p className="text-sm text-gray-500">Previous Close</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {formatPaise(stock.previousClose)}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Sector</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {stock.sector}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Volatility</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {(stock.volatility * 100).toFixed(1)}%
            </p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Status</p>
            <p
              className={`text-lg font-semibold mt-1 ${
                stock.isHalted ? "text-red-600" : "text-green-600"
              }`}
            >
              {stock.isHalted ? "Halted" : "Trading"}
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
