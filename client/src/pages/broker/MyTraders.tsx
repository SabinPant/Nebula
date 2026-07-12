/**
 * My Traders Page
 *
 * Displays all traders assigned to the logged-in broker.
 * Desktop table + mobile cards pattern.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";

interface Trader {
  traderId: string;
  displayName: string;
  email: string;
  createdAt: string;
  orderCount: number;
  wallet: {
    availableBalancePaise: number;
    availableBalanceFormatted: string;
    totalDepositedPaise: number;
    totalDepositedFormatted: string;
  };
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function MyTraders() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchTraders() {
      try {
        const { data } = await api.get("/broker/traders");
        setTraders(data);
      } catch {
        setError("Failed to load traders.");
      } finally {
        setLoading(false);
      }
    }
    fetchTraders();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Traders</h1>
        <p className="text-sm text-gray-400">
          {traders.length} trader{traders.length !== 1 ? "s" : ""}
        </p>
      </div>

      {traders.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-500">No traders assigned yet.</p>
            <p className="text-sm text-gray-400 mt-1">
              Traders will appear here once they select you as their broker
              during onboarding.
            </p>
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
                        Name
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Email
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Balance
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Deposited
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Orders
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Joined
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {traders.map((trader) => (
                      <tr
                        key={trader.traderId}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {trader.displayName || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {trader.email}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {trader.wallet?.availableBalanceFormatted || "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {trader.wallet?.totalDepositedFormatted || "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {trader.orderCount}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {formatDate(trader.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link to={`/broker/traders/${trader.traderId}`}>
                            <Button variant="secondary" size="sm">
                              View
                            </Button>
                          </Link>
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
            {traders.map((trader) => (
              <Card key={trader.traderId}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {trader.displayName || "—"}
                      </p>
                      <p className="text-xs text-gray-400">{trader.email}</p>
                    </div>
                    <Link to={`/broker/traders/${trader.traderId}`}>
                      <Button variant="secondary" size="sm">
                        View
                      </Button>
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-gray-500">Balance</p>
                      <p className="text-gray-900 font-medium">
                        {trader.wallet?.availableBalanceFormatted || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Deposited</p>
                      <p className="text-gray-900 font-medium">
                        {trader.wallet?.totalDepositedFormatted || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Orders</p>
                      <p className="text-gray-900 font-medium">
                        {trader.orderCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Joined</p>
                      <p className="text-gray-900 font-medium">
                        {formatDate(trader.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
