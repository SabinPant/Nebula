/**
 * Portfolio Page
 *
 * Displays portfolio summary cards and holdings table with live P&L.
 * Listens for portfolio:update WebSocket events to refresh data.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { Card } from "../../components/ui/Card";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";
import { useAuthStore } from "../../stores/authStore";
import { socket, connectSocket } from "../../lib/socket";

interface Holding {
  id: string;
  stockId: string;
  symbol: string;
  companyName: string;
  sector: string;
  quantity: number;
  reservedQuantity: number;
  averageBuyPrice: number;
  currentPrice: number;
  isHalted: boolean;
  invested: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  dayChange: number;
  dayChangePercent: number;
  displayInvested: string;
  displayCurrentValue: string;
  displayPnl: string;
  displayAverageBuyPrice: string;
  displayCurrentPrice: string;
}

interface PortfolioSummary {
  totalInvested: number;
  totalCurrentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  totalDayChange: number;
  totalDayChangePercent: number;
  holdingsCount: number;
  displayTotalInvested: string;
  displayTotalValue: string;
  displayTotalPnl: string;
  displayTotalDayChange: string;
}

interface PortfolioData {
  summary: PortfolioSummary;
  holdings: Holding[];
}

export function Portfolio() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [engineOnline, setEngineOnline] = useState(true);

  useEffect(() => {
    fetchPortfolio();

    const interval = setInterval(fetchPortfolio, 5000);

    connectSocket();
    socket.emit("subscribe:portfolio", { userId: user?.id });
    socket.on("portfolio:update", () => fetchPortfolio());

    async function checkHealth() {
      try {
        const { data } = await api.get("/health");
        setEngineOnline(data.engine === "up");
      } catch {}
    }
    checkHealth();
    const healthInterval = setInterval(checkHealth, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(healthInterval);
      socket.off("portfolio:update");
      socket.emit("unsubscribe:portfolio", { userId: user?.id });
    };
  }, []);

  async function fetchPortfolio() {
    try {
      const { data } = await api.get("/portfolio/me");
      data.holdings = data.holdings.filter((h: Holding) => h.quantity > 0);
      setData(data);
      setError("");
    } catch {
      setError("Failed to load portfolio.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }

  const holdings = data?.holdings ?? [];
  const summary = data?.summary;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Portfolio</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Updates every 5s</span>
          <span
            className={clsx(
              "inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 border",
              engineOnline
                ? "text-green-700 bg-green-50 border-green-200"
                : "text-gray-400 bg-gray-100 border-gray-200",
            )}
          >
            <span
              className={clsx(
                "w-1.5 h-1.5 rounded-full",
                engineOnline ? "bg-green-500" : "bg-gray-400",
              )}
            />
            {engineOnline ? "Live" : "Offline"}
          </span>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-xl px-4 py-3.5">
            <p className="text-xs text-gray-500 mb-1">Total invested</p>
            <p className="text-lg font-semibold text-gray-900 truncate">
              {summary.displayTotalInvested}
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl px-4 py-3.5">
            <p className="text-xs text-gray-500 mb-1">Current value</p>
            <p className="text-lg font-semibold text-gray-900 truncate">
              {summary.displayTotalValue}
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl px-4 py-3.5">
            <p className="text-xs text-gray-500 mb-1">Profit / loss</p>
            <p
              className={clsx(
                "text-lg font-semibold truncate",
                summary.totalPnl >= 0 ? "text-green-600" : "text-red-600",
              )}
            >
              {summary.displayTotalPnl}
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl px-4 py-3.5">
            <p className="text-xs text-gray-500 mb-1">Day's change</p>
            <p
              className={clsx(
                "text-lg font-semibold truncate",
                summary.totalDayChange >= 0 ? "text-green-600" : "text-red-600",
              )}
            >
              {summary.displayTotalDayChange}
            </p>
          </div>
        </div>
      )}

      {/* Holdings */}
      {holdings.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-sm text-gray-500">No holdings yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Place your first trade from the Trade page.
            </p>
            <Link
              to="/trade"
              className="inline-block mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Go to Trade →
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              Holdings
            </p>
            <p className="text-xs text-gray-400">
              {holdings.length} position{holdings.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Desktop / tablet table */}
          <div className="hidden sm:block">
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">
                        Stock
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">
                        Qty
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">
                        Avg price
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">
                        Current
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 hidden md:table-cell">
                        Invested
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 hidden md:table-cell">
                        Value
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">
                        P&L
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">
                        P&L %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {holdings.map((h) => (
                      <tr
                        key={h.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-medium text-gray-900 text-sm">
                                {h.symbol}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[140px]">
                                {h.companyName}
                              </p>
                            </div>
                            {h.isHalted && (
                              <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded px-1.5 py-0.5 shrink-0">
                                Halted
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <p className="text-gray-900">
                            {h.quantity.toLocaleString()}
                          </p>
                          {h.reservedQuantity > 0 && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {h.reservedQuantity} reserved
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right text-gray-900">
                          {h.displayAverageBuyPrice}
                        </td>
                        <td className="px-4 py-3.5 text-right text-gray-900">
                          {h.displayCurrentPrice}
                        </td>
                        <td className="px-4 py-3.5 text-right text-gray-900 hidden md:table-cell">
                          {h.displayInvested}
                        </td>
                        <td className="px-4 py-3.5 text-right text-gray-900 hidden md:table-cell">
                          {h.displayCurrentValue}
                        </td>
                        <td
                          className={clsx(
                            "px-4 py-3.5 text-right font-medium",
                            h.unrealizedPnl >= 0
                              ? "text-green-600"
                              : "text-red-600",
                          )}
                        >
                          {h.unrealizedPnl >= 0 ? "+" : ""}
                          {h.displayPnl}
                        </td>
                        <td
                          className={clsx(
                            "px-4 py-3.5 text-right font-medium",
                            h.unrealizedPnlPercent >= 0
                              ? "text-green-600"
                              : "text-red-600",
                          )}
                        >
                          {h.unrealizedPnlPercent >= 0 ? "+" : ""}
                          {h.unrealizedPnlPercent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {holdings.map((h) => (
              <div
                key={h.id}
                className="bg-white border border-gray-200 rounded-xl px-4 py-3.5"
              >
                {/* Row 1: symbol + P&L */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 text-sm">
                        {h.symbol}
                      </p>
                      {h.isHalted && (
                        <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded px-1.5 py-0.5">
                          Halted
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {h.companyName}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={clsx(
                        "text-sm font-semibold",
                        h.unrealizedPnl >= 0
                          ? "text-green-600"
                          : "text-red-600",
                      )}
                    >
                      {h.unrealizedPnl >= 0 ? "+" : ""}
                      {h.displayPnl}
                    </p>
                    <p
                      className={clsx(
                        "text-xs mt-0.5",
                        h.unrealizedPnlPercent >= 0
                          ? "text-green-500"
                          : "text-red-500",
                      )}
                    >
                      {h.unrealizedPnlPercent >= 0 ? "+" : ""}
                      {h.unrealizedPnlPercent}%
                    </p>
                  </div>
                </div>

                {/* Row 2: data grid */}
                <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-gray-100">
                  <div>
                    <p className="text-[11px] text-gray-400">Qty</p>
                    <p className="text-xs font-medium text-gray-900 mt-0.5">
                      {h.quantity.toLocaleString()}
                      {h.reservedQuantity > 0 && (
                        <span className="text-gray-400">
                          {" "}
                          ({h.reservedQuantity}r)
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400">Avg price</p>
                    <p className="text-xs font-medium text-gray-900 mt-0.5">
                      {h.displayAverageBuyPrice}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400">Current</p>
                    <p className="text-xs font-medium text-gray-900 mt-0.5">
                      {h.displayCurrentPrice}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400">Invested</p>
                    <p className="text-xs font-medium text-gray-900 mt-0.5">
                      {h.displayInvested}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400">Value</p>
                    <p className="text-xs font-medium text-gray-900 mt-0.5">
                      {h.displayCurrentValue}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
