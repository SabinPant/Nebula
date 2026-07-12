/**
 * Trader Detail Page
 *
 * Full profile view of an assigned trader — wallet, portfolio, holdings, recent orders.
 * Desktop: cards + tables. Mobile: stacked cards.
 */

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import api from "../../services/api";

interface TraderData {
  trader: {
    id: string;
    displayName: string;
    email: string;
    createdAt: string;
  };
  wallet: {
    availableBalancePaise: number;
    availableBalanceFormatted: string;
    reservedBalancePaise: number;
    reservedBalanceFormatted: string;
    totalDepositedPaise: number;
    totalDepositedFormatted: string;
  } | null;
  portfolio: {
    totalValuePaise: number;
    totalValueFormatted: string;
    totalInvestedPaise: number;
    totalInvestedFormatted: string;
    totalProfitLossPaise: number;
    totalProfitLossFormatted: string;
    holdings: Array<{
      holdingId: string;
      stockSymbol: string;
      companyName: string;
      quantity: number;
      reservedQuantity: number;
      averageBuyPricePaise: number;
      averageBuyPriceFormatted: string;
      currentPricePaise: number;
      currentPriceFormatted: string;
    }>;
  } | null;
  recentOrders: Array<{
    orderId: string;
    stockSymbol: string;
    companyName: string;
    type: string;
    orderStyle: string;
    status: string;
    quantity: number;
    filledQuantity: number;
    pricePaise: number | null;
    priceFormatted: string | null;
    createdAt: string;
  }>;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TraderDetail() {
  const { traderId } = useParams<{ traderId: string }>();
  const [data, setData] = useState<TraderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchDetail() {
      try {
        const { data } = await api.get(`/broker/traders/${traderId}`);
        setData(data);
      } catch {
        setError("Failed to load trader details.");
      } finally {
        setLoading(false);
      }
    }
    fetchDetail();
  }, [traderId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Alert variant="error">{error || "Trader not found."}</Alert>
        <div className="mt-4">
          <Link to="/broker/traders">
            <Button variant="secondary" size="sm">
              ← Back to Traders
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const { trader, wallet, portfolio, recentOrders } = data;
  const activeHoldings =
    portfolio?.holdings.filter((h) => h.quantity > 0) ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Back link + Header */}
      <div>
        <Link
          to="/broker/traders"
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          ← Back to Traders
        </Link>
        <div className="mt-3 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {trader.displayName || "Unnamed Trader"}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{trader.email}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Member since {formatDate(trader.createdAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Wallet Cards */}
      {wallet && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <p className="text-sm text-gray-500">Available Balance</p>
            <p className="text-xl font-bold text-gray-900 mt-1">
              {wallet.availableBalanceFormatted}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Reserved</p>
            <p className="text-xl font-bold text-gray-900 mt-1">
              {wallet.reservedBalanceFormatted}
            </p>
            {wallet.reservedBalancePaise > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Locked in pending orders
              </p>
            )}
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Total Deposited</p>
            <p className="text-xl font-bold text-gray-900 mt-1">
              {wallet.totalDepositedFormatted}
            </p>
          </Card>
        </div>
      )}

      {/* Portfolio Section */}
      {portfolio && (
        <Card title="Portfolio">
          {portfolio.totalInvestedPaise > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <p className="text-xs text-gray-500">Total Value</p>
                <p className="text-lg font-bold text-gray-900">
                  {portfolio.totalValueFormatted}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Invested</p>
                <p className="text-lg font-bold text-gray-900">
                  {portfolio.totalInvestedFormatted}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">P&L</p>
                <p
                  className={`text-lg font-bold ${portfolio.totalProfitLossPaise >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {portfolio.totalProfitLossFormatted}
                </p>
              </div>
            </div>
          )}

          {activeHoldings.length === 0 ? (
            <p className="text-sm text-gray-500">No active holdings.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-medium text-gray-500">
                      Stock
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">
                      Qty
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">
                      Avg Price
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">
                      Current
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeHoldings.map((h) => (
                    <tr
                      key={h.holdingId}
                      className="border-b border-gray-50 last:border-0"
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">
                          {h.stockSymbol}
                        </p>
                        <p className="text-xs text-gray-400">{h.companyName}</p>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900">
                        {h.quantity}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900">
                        {h.averageBuyPriceFormatted}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900">
                        {h.currentPriceFormatted}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Recent Orders */}
      <Card title="Recent Orders">
        {recentOrders.length === 0 ? (
          <p className="text-sm text-gray-500">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left px-3 py-2 font-medium text-gray-500">
                    Stock
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">
                    Type
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">
                    Qty
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">
                    Status
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr
                    key={order.orderId}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900">
                        {order.stockSymbol}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs font-medium px-1.5 py-0.5 rounded ${order.type === "BUY" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                      >
                        {order.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-900">
                      {order.filledQuantity}/{order.quantity}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs font-medium px-1.5 py-0.5 rounded ${order.status === "COMPLETED" ? "bg-green-100 text-green-800" : order.status === "CANCELLED" ? "bg-gray-100 text-gray-600" : "bg-yellow-100 text-yellow-800"}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 text-xs">
                      {formatDateTime(order.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
