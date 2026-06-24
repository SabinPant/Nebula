/**
 * Wallet Page
 *
 * Displays the trader's virtual balance, transaction history with
 * page-based pagination, and a link to top-up information.
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

interface PaginationMeta {
  page: number;
  totalPages: number;
  totalCount: number;
  limit: number;
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

const RESERVED_EXPLAINER_THRESHOLD = 0;
const TOTAL_DEPOSITED_TOPUP_THRESHOLD_PAISE = 50_000 * 100;
const TRANSACTIONS_PER_PAGE = 10;

type BadgeTone = "blue" | "red" | "green" | "gray";

const BADGE_STYLES: Record<BadgeTone, string> = {
  blue: "bg-primary-50 text-primary-700 border-primary-200",
  red: "bg-red-50 text-red-700 border-red-200",
  green: "bg-green-50 text-green-700 border-green-200",
  gray: "bg-gray-100 text-gray-600 border-gray-200",
};

function getBadgeTone(tx: Transaction): BadgeTone {
  switch (tx.type) {
    case "INITIAL_DEPOSIT":
    case "COLLATERAL_TOP_UP":
      return "blue";
    case "TRADE_SETTLE":
      return tx.amount < 0 ? "red" : "green";
    case "ORDER_PLACE":
    case "ORDER_CANCEL":
      return "gray";
    default:
      return "gray";
  }
}

function TransactionBadge({ tx }: { tx: Transaction }) {
  const tone = getBadgeTone(tx);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none ${BADGE_STYLES[tone]}`}
    >
      {TRANSACTION_LABELS[tx.type] ?? tx.type}
    </span>
  );
}

export function Wallet() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchWallet();
  }, []);

  async function fetchWallet() {
    setLoading(true);
    try {
      const [walletRes, txnsRes] = await Promise.all([
        api.get("/wallet"),
        api.get(`/wallet/transactions?page=1&limit=${TRANSACTIONS_PER_PAGE}`),
      ]);

      setWallet(walletRes.data);
      setTransactions(txnsRes.data.data);
      setPagination(txnsRes.data.pagination);
    } catch {
      setError("Failed to load wallet data.");
    } finally {
      setLoading(false);
    }
  }

  async function goToPage(page: number) {
    if (!pagination || page < 1 || page > pagination.totalPages) return;
    setLoadingPage(true);
    setError("");
    try {
      const { data } = await api.get(
        `/wallet/transactions?page=${page}&limit=${TRANSACTIONS_PER_PAGE}`,
      );
      setTransactions(data.data);
      setPagination(data.pagination);
    } catch {
      setError("Failed to load transactions.");
    } finally {
      setLoadingPage(false);
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
          {(wallet?.reservedBalance ?? 0) > RESERVED_EXPLAINER_THRESHOLD && (
            <p className="text-xs text-gray-400 mt-1">
              Locked in pending orders
            </p>
          )}
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Total Deposited</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatPaise(wallet?.totalDeposited ?? 0)}
          </p>
          {(wallet?.totalDeposited ?? 0) >
            TOTAL_DEPOSITED_TOPUP_THRESHOLD_PAISE && (
            <p className="text-xs text-gray-400 mt-1">
              Includes broker top-ups
            </p>
          )}
        </Card>
      </div>

      {/* Top-up link */}
      <Card className="border-primary-200 bg-primary-50/40">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-gray-900">Need more collateral?</p>
            <p className="text-sm text-gray-500 mt-1">
              Contact your broker to add funds to your account.
            </p>
          </div>
          <Link to="/wallet/topup-info" className="shrink-0">
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
            {loadingPage && (
              <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
              </div>
            )}
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0"
              >
                <div className="min-w-0">
                  <TransactionBadge tx={tx} />
                  <p className="text-xs text-gray-400 mt-1">{tx.description}</p>
                  <p className="text-xs text-gray-400">
                    {formatDate(tx.createdAt)}
                  </p>
                </div>
                <p
                  className={`text-sm font-semibold shrink-0 ${
                    tx.amount === 0
                      ? "text-gray-400"
                      : tx.amount > 0
                        ? "text-green-600"
                        : "text-red-600"
                  }`}
                >
                  {tx.amount === 0
                    ? "—"
                    : `${tx.amount > 0 ? "+" : ""}${formatPaise(tx.amount)}`}
                </p>
              </div>
            ))}

            {/* Pagination Controls */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  Page {pagination.page} of {pagination.totalPages} (
                  {pagination.totalCount} total)
                </p>
                <div className="flex gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => goToPage(pagination.page - 1)}
                    disabled={pagination.page <= 1 || loadingPage}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => goToPage(pagination.page + 1)}
                    disabled={
                      pagination.page >= pagination.totalPages || loadingPage
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
