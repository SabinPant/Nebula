/**
 * Portfolio Page
 *
 * Displays portfolio summary cards and holdings table with live P&L.
 * Listens for portfolio:update WebSocket events to refresh data.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
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

    // Poll for live price updates every 5 seconds
    const interval = setInterval(fetchPortfolio, 5000);

    // Listen for instant trade settlement updates
    connectSocket();
    socket.emit("subscribe:portfolio", { userId: user?.id });

    socket.on("portfolio:update", () => fetchPortfolio());

    // Health check for LIVE indicator
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
      // Filter out zero-quantity holdings
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
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }

  const holdings = data?.holdings ?? [];
  const summary = data?.summary;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Portfolio</h1>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 border ${
            engineOnline
              ? "text-green-700 bg-green-50 border-green-200"
              : "text-gray-500 bg-gray-100 border-gray-200"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              engineOnline ? "bg-green-500" : "bg-gray-400"
            }`}
          />
          {engineOnline ? "LIVE" : "OFFLINE"}
        </span>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <p className="text-sm text-gray-500">Total Invested</p>
            <p className="text-xl font-bold text-gray-900 mt-1">
              {summary.displayTotalInvested}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Current Value</p>
            <p className="text-xl font-bold text-gray-900 mt-1">
              {summary.displayTotalValue}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Profit / Loss</p>
            <p
              className={`text-xl font-bold mt-1 ${
                summary.totalPnl >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {summary.displayTotalPnl}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Day's Change</p>
            <p
              className={`text-xl font-bold mt-1 ${
                summary.totalDayChange >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {summary.displayTotalDayChange}
            </p>
          </Card>
        </div>
      )}

      {/* Holdings */}
      {holdings.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-500">No holdings yet.</p>
            <p className="text-sm text-gray-400 mt-1">
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
          {/* Desktop Table */}
          <div className="hidden md:block">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Stock
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Qty
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Avg Price
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Current
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Invested
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Value
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        P&L
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        P&L%
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => (
                      <tr
                        key={h.id}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">
                            {h.symbol}
                          </p>
                          <p className="text-xs text-gray-400">
                            {h.companyName}
                          </p>
                          {h.isHalted && (
                            <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1 mt-0.5 inline-block">
                              HALTED
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {h.quantity.toLocaleString()}
                          {h.reservedQuantity > 0 && (
                            <span className="text-xs text-gray-400 ml-1">
                              ({h.reservedQuantity} reserved)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {h.displayAverageBuyPrice}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {h.displayCurrentPrice}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {h.displayInvested}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {h.displayCurrentValue}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${h.unrealizedPnl >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {h.unrealizedPnl >= 0 ? "+" : ""}
                          {h.displayPnl}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${h.unrealizedPnlPercent >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {h.unrealizedPnlPercent >= 0 ? "+" : ""}
                          {h.unrealizedPnlPercent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {holdings.map((h) => (
              <Card key={h.id}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{h.symbol}</p>
                      <p className="text-xs text-gray-400">{h.companyName}</p>
                    </div>
                    <span
                      className={`text-sm font-semibold ${h.unrealizedPnl >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {h.unrealizedPnl >= 0 ? "+" : ""}
                      {h.displayPnl}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{h.quantity} shares</span>
                    <span className="text-gray-900">
                      {h.displayCurrentPrice}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Invested</span>
                    <span className="text-gray-900">{h.displayInvested}</span>
                  </div>
                  {h.isHalted && (
                    <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1 inline-block">
                      HALTED
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
