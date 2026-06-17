/**
 * Market Dashboard
 *
 * Single-page trading dashboard: a scrollable stock list on the left
 * (horizontal strip on phone, vertical list on tablet/desktop) and a
 * candlestick chart + details for the selected stock on the right.
 *
 * Selection is kept in the `symbol` query param so the view is
 * deep-linkable and refresh-safe. All 10 stocks are subscribed to on
 * mount so list prices stay live regardless of selection; only the
 * selected stock's chart receives candle updates.
 */

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { clsx } from "clsx";
import { createChart, IChartApi, ISeriesApi, Time } from "lightweight-charts";
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
  isWatchlisted: boolean;
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

interface StockListItemProps {
  stock: Stock;
  active: boolean;
  onSelect: () => void;
}

function StockListItem({ stock, active, onSelect }: StockListItemProps) {
  const change = stock.currentPrice - stock.previousClose;
  const changePercent = ((change / stock.previousClose) * 100).toFixed(2);
  const isUp = change >= 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={clsx(
        "w-36 md:w-auto shrink-0 md:shrink text-left rounded-md px-3 py-2 border transition-colors",
        active
          ? "bg-primary-50 text-primary-700 border-primary-200"
          : "bg-white text-gray-700 border-gray-200 hover:bg-surface-100",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm">{stock.symbol}</span>
        {stock.isHalted && (
          <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1 shrink-0">
            HALT
          </span>
        )}
      </div>
      <p className="hidden md:block text-xs text-gray-500 truncate mt-0.5">
        {stock.companyName}
      </p>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-sm font-medium text-gray-900">
          {formatPaise(stock.currentPrice)}
        </span>
        <span
          className={clsx(
            "text-xs font-medium",
            isUp ? "text-green-600" : "text-red-500",
          )}
        >
          {isUp ? "+" : ""}
          {changePercent}%
        </span>
      </div>
    </button>
  );
}

export function Market() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState("");

  const [watchlistPending, setWatchlistPending] = useState<string | null>(null);
  const [watchlistError, setWatchlistError] = useState("");

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const selectedSymbolRef = useRef<string | null>(null);

  const symbolParam = searchParams.get("symbol");
  const selectedSymbol =
    stocks.length > 0
      ? stocks.some((s) => s.symbol === symbolParam)
        ? (symbolParam as string)
        : stocks[0].symbol
      : null;
  const selectedStock = stocks.find((s) => s.symbol === selectedSymbol) ?? null;

  // Keep the ref in sync so the socket handler and async fetches never
  // act on a stale selection.
  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
  }, [selectedSymbol]);

  // Canonicalize the URL once stocks are loaded — fills in the default
  // symbol if the param was missing or didn't match a real stock.
  useEffect(() => {
    if (!selectedSymbol) return;
    if (symbolParam !== selectedSymbol) {
      setSearchParams({ symbol: selectedSymbol }, { replace: true });
    }
  }, [selectedSymbol, symbolParam, setSearchParams]);

  // Create the chart once loading is complete and the container is in the DOM.
  useEffect(() => {
    // If we are still loading, or the element isn't in the DOM yet, wait.
    if (listLoading || !chartContainerRef.current) return;

    // Clean up any stray instance before creating a new one
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth || 600, // fallback if width is initially 0
      height: 500,
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

    const series = chart.addLineSeries({ color: "#2563eb", lineWidth: 2 });

    chartRef.current = chart;
    seriesRef.current = series;

    // Bulletproof resizing: Handles grid/flex adjustments seamlessly
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || !entries[0].contentRect || !chartRef.current)
        return;
      const { width } = entries[0].contentRect;
      chartRef.current.applyOptions({ width });
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [listLoading]); // Re-run when loading state changes from true to false

  // Fetch the stock list once and subscribe to every symbol's room so
  // list prices stay live no matter which stock is selected.
  useEffect(() => {
    let symbols: string[] = [];

    async function fetchStocks() {
      try {
        const [stocksRes, watchlistRes] = await Promise.all([
          api.get("/market/stocks"),
          api.get("/market/watchlist"),
        ]);
        const watchlistSymbols = new Set(
          watchlistRes.data.map((w: any) => w.stock.symbol),
        );
        const merged = stocksRes.data.map((s: Stock) => ({
          ...s,
          isWatchlisted: watchlistSymbols.has(s.symbol),
        }));
        setStocks(merged);
        symbols = merged.map((s: Stock) => s.symbol);

        connectSocket();
        symbols.forEach((symbol) => {
          socket.emit("subscribe:stock", { symbol });
        });
      } catch {
        setListError("Failed to load stocks.");
      } finally {
        setListLoading(false);
      }
    }

    fetchStocks();

    socket.on("price:update", (update: PriceUpdate) => {
      setStocks((prev) =>
        prev.map((stock) =>
          stock.symbol === update.symbol
            ? {
                ...stock,
                currentPrice: update.price,
                isHalted: update.isHalted,
              }
            : stock,
        ),
      );

      if (update.symbol !== selectedSymbolRef.current) return;
      if (!seriesRef.current) return;

      const time = (new Date(update.timestamp).getTime() / 1000) as Time;
      const priceInRupees = update.price / 100;
      seriesRef.current.update({ time, value: priceInRupees });
    });

    return () => {
      socket.off("price:update");
      symbols.forEach((symbol) => {
        socket.emit("unsubscribe:stock", { symbol });
      });
    };
  }, []);

  // Fetch chart history whenever the selected symbol changes. Stale
  // responses (from a symbol the user has since clicked away from)
  // are dropped silently.
  useEffect(() => {
    if (!selectedSymbol) return;
    const sym = selectedSymbol;

    setChartLoading(true);
    setChartError("");

    async function fetchHistory() {
      try {
        const { data } = await api.get(
          `/market/stocks/${sym}/history?interval=1m&limit=100`,
        );

        if (selectedSymbolRef.current !== sym) return;

        if (seriesRef.current && data.length > 0) {
          const lineData = data.map((c: Candle) => ({
            time: (new Date(c.timestamp).getTime() / 1000) as Time,
            value: c.close / 100,
          }));
          seriesRef.current.setData(lineData);
        }
      } catch {
        if (selectedSymbolRef.current !== sym) return;
        setChartError("Failed to load chart data.");
      } finally {
        if (selectedSymbolRef.current === sym) {
          setChartLoading(false);
        }
      }
    }

    fetchHistory();
  }, [selectedSymbol]);

  async function handleToggleWatchlist() {
    if (!selectedStock || watchlistPending) return;

    const symbol = selectedStock.symbol;
    const wasWatchlisted = selectedStock.isWatchlisted;
    setWatchlistPending(symbol);
    setWatchlistError("");

    setStocks((prev) =>
      prev.map((s) =>
        s.symbol === symbol ? { ...s, isWatchlisted: !wasWatchlisted } : s,
      ),
    );

    try {
      if (wasWatchlisted) {
        await api.delete(`/market/watchlist/${symbol}`);
      } else {
        await api.post("/market/watchlist", { symbol });
      }
    } catch {
      setStocks((prev) =>
        prev.map((s) =>
          s.symbol === symbol ? { ...s, isWatchlisted: wasWatchlisted } : s,
        ),
      );
      setWatchlistError("Failed to update watchlist.");
    } finally {
      setWatchlistPending(null);
    }
  }

  if (listLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Market</h1>
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (listError) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Market</h1>
        <Alert variant="error">{listError}</Alert>
      </div>
    );
  }

  if (stocks.length === 0 || !selectedStock) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Market</h1>
        <p className="text-sm text-gray-500">No stocks available right now.</p>
      </div>
    );
  }

  const change = selectedStock.currentPrice - selectedStock.previousClose;
  const changePercent = ((change / selectedStock.previousClose) * 100).toFixed(
    2,
  );
  const isUp = change >= 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Market</h1>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Stock list — horizontal strip on phone, vertical list on tablet+ */}
        <Card title="Stocks" className="md:w-64 md:shrink-0">
          <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible md:overflow-y-auto md:max-h-[640px] pb-1">
            {stocks.map((stock) => (
              <StockListItem
                key={stock.id}
                stock={stock}
                active={stock.symbol === selectedSymbol}
                onSelect={() => setSearchParams({ symbol: stock.symbol })}
              />
            ))}
          </div>
        </Card>

        {/* Selected stock — header, chart, details, watchlist */}
        <div className="flex-1 space-y-6 min-w-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-gray-900">
                  {selectedStock.symbol}
                </h2>
                {selectedStock.isHalted && (
                  <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                    HALTED
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {selectedStock.companyName}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {selectedStock.sector}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900">
                {formatPaise(selectedStock.currentPrice)}
              </p>
              <p
                className={clsx(
                  "text-sm font-medium",
                  isUp ? "text-green-600" : "text-red-500",
                )}
              >
                {isUp ? "+" : ""}
                {changePercent}%
              </p>
            </div>
          </div>

          {/* Chart — loading/error overlay the chart pane only; the
              container div stays mounted so the chart instance is
              never recreated. */}
          <Card>
            <div className="relative">
              {chartLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
                  <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
                </div>
              )}
              <div ref={chartContainerRef} className="h-[500px]" />
            </div>
            {chartError && (
              <div className="mt-4">
                <Alert variant="error">{chartError}</Alert>
              </div>
            )}
          </Card>

          {/* Details */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <p className="text-sm text-gray-500">Previous Close</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">
                {formatPaise(selectedStock.previousClose)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500">Sector</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">
                {selectedStock.sector}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500">Volatility</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">
                {selectedStock.volatility
                  ? `${(selectedStock.volatility * 100).toFixed(1)}%`
                  : "0.0%"}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500">Status</p>
              <p
                className={clsx(
                  "text-lg font-semibold mt-1",
                  selectedStock.isHalted ? "text-red-600" : "text-green-600",
                )}
              >
                {selectedStock.isHalted ? "Halted" : "Trading"}
              </p>
            </Card>
          </div>

          {/* Watchlist */}
          <Card>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-gray-900">
                  {selectedStock.isWatchlisted
                    ? "In your watchlist"
                    : "Not in your watchlist"}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Track {selectedStock.symbol} on your dashboard.
                </p>
              </div>
              <Button
                variant={selectedStock.isWatchlisted ? "secondary" : "primary"}
                size="sm"
                onClick={handleToggleWatchlist}
                disabled={watchlistPending === selectedStock.symbol}
              >
                {watchlistPending === selectedStock.symbol
                  ? "Updating..."
                  : selectedStock.isWatchlisted
                    ? "Remove from Watchlist"
                    : "Add to Watchlist"}
              </Button>
            </div>
            {watchlistError && (
              <div className="mt-3">
                <Alert variant="error">{watchlistError}</Alert>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
