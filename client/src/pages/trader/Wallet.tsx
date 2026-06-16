/**
 * Wallet Page
 *
 * Displays the trader's virtual balance, transaction history with
 * cursor pagination, and a link to top-up information.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";
import { formatPaise } from "../../lib/utils";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  createdAt: string;
}

interface WalletData {
  availableBalance: number;
  reservedBalance: number;
  totalDeposited: number;
  displayBalance: string;
}

const TRANSACTION_LABELS: Record<string, string> = {
  INITIAL_DEPOSIT: "Initial Deposit",
  ORDER_PLACE: "Order Placed",
  ORDER_CANCEL: "Order Cancelled",
  TRADE_SETTLE: "Trade Settlement",
  COLLATERAL_TOP_UP: "Collateral Top-Up",
  MANUAL_ADJUST: "Manual Adjustment",
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Wallet() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const [walletRes, txnsRes] = await Promise.all([
          api.get("/wallet"),
          api.get("/wallet/transactions?limit=20"),
        ]);

        setWallet(walletRes.data);
        setTransactions(txnsRes.data.data);
        setNextCursor(txnsRes.data.pagination.nextCursor);
        setHasMore(txnsRes.data.pagination.hasMore);
      } catch {
        setError("Failed to load wallet data.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const { data } = await api.get(
        `/wallet/transactions?cursor=${nextCursor}&limit=20`,
      );
      setTransactions((prev) => [...prev, ...data.data]);
      setNextCursor(data.pagination.nextCursor);
      setHasMore(data.pagination.hasMore);
    } catch {
      setError("Failed to load more transactions.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !wallet) {
    return (
      <div className="p-6">
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Wallet</h1>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-gray-500">Available Balance</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {wallet?.displayBalance ??
              formatPaise(wallet?.availableBalance ?? 0)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Reserved</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatPaise(wallet?.reservedBalance ?? 0)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Total Deposited</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatPaise(wallet?.totalDeposited ?? 0)}
          </p>
        </Card>
      </div>

      {/* Top-up link */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Need more collateral?</p>
            <p className="text-sm text-gray-500 mt-1">
              Contact your broker to add funds to your account.
            </p>
          </div>
          <Link to="/wallet/topup-info">
            <Button variant="secondary" size="sm">
              View Broker Info
            </Button>
          </Link>
        </div>
      </Card>

      {/* Transaction History */}
      <Card title="Transaction History">
        {error && (
          <div className="mb-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-500">No transactions yet.</p>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {TRANSACTION_LABELS[tx.type] ?? tx.type}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {tx.description}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatDate(tx.createdAt)}
                  </p>
                </div>
                <p
                  className={`text-sm font-semibold ${
                    tx.amount >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {tx.amount >= 0 ? "+" : ""}
                  {formatPaise(tx.amount)}
                </p>
              </div>
            ))}

            {hasMore && (
              <div className="pt-2 text-center">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
