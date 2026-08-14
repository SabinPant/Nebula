import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert } from "../../components/ui/Alert";
import { Card } from "../../components/ui/Card";
import { NebulaIndexChart } from "../../components/market/NebulaIndexChart";
import { useAuthStore } from "../../stores/authStore";
import api from "../../services/api";
import { formatPaise } from "../../lib/utils";

interface AdminStats {
  totalUsers: number;
  totalTopUps: number;
  pendingApplications: number;
  totalAuditEvents: number;
}

interface Stock {
  id: string;
  symbol: string;
  companyName: string;
  currentPrice: number;
  previousClose: number;
}

interface AuditEntry {
  auditLogId: string;
  action: string;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  USER_SUSPENDED: "User Suspended",
  USER_UNSUSPENDED: "User Unsuspended",
  MANUAL_ADJUST: "Admin Top-Up Override",
  TOP_UP_CREDITED: "Top-Up Credited",
  ACCOUNT_FLAGGED: "Trader Flagged",
};

const TOP_STOCKS_COUNT = 5;
const RECENT_ACTIVITY_COUNT = 5;

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminDashboard() {
  const user = useAuthStore((state) => state.user);
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalTopUps: 0,
    pendingApplications: 0,
    totalAuditEvents: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [topStocks, setTopStocks] = useState<Stock[]>([]);
  const [stocksLoading, setStocksLoading] = useState(true);
  const [stocksError, setStocksError] = useState("");

  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState("");

  useEffect(() => {
    fetchStats();
    fetchTopStocks();
    fetchActivity();
  }, []);

  async function fetchStats() {
    setLoading(true);
    setError(null);

    try {
      const [usersRes, topUpsRes, applicationsRes, auditRes] =
        await Promise.all([
          api.get("/admin/users?page=1&limit=1"),
          api.get("/admin/topups?page=1&limit=1"),
          api.get("/admin/broker-applications"),
          api.get("/admin/audit?page=1&limit=1"),
        ]);

      const pendingCount = Array.isArray(applicationsRes.data)
        ? applicationsRes.data.filter((a: any) => a.status === "PENDING")
            .length
        : 0;

      setStats({
        totalUsers: usersRes.data?.pagination?.totalCount ?? 0,
        totalTopUps: topUpsRes.data?.pagination?.totalCount ?? 0,
        pendingApplications: pendingCount,
        totalAuditEvents: auditRes.data?.pagination?.totalCount ?? 0,
      });
    } catch {
      setError("Failed to load admin overview. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchTopStocks() {
    setStocksLoading(true);
    setStocksError("");

    try {
      const { data } = await api.get("/market/stocks");
      const stocks: Stock[] = Array.isArray(data) ? data : [];
      const top = [...stocks]
        .sort((a, b) => b.currentPrice - a.currentPrice)
        .slice(0, TOP_STOCKS_COUNT);
      setTopStocks(top);
    } catch {
      setStocksError("Failed to load market snapshot.");
    } finally {
      setStocksLoading(false);
    }
  }

  async function fetchActivity() {
    setActivityLoading(true);
    setActivityError("");

    try {
      const { data } = await api.get(
        `/admin/audit?page=1&limit=${RECENT_ACTIVITY_COUNT}`,
      );
      setActivity(data?.data ?? []);
    } catch {
      setActivityError("Failed to load recent activity.");
    } finally {
      setActivityLoading(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <h1 className="text-2xl font-bold text-gray-900">
        Welcome{user?.displayName ? `, ${user.displayName}` : ""}!
      </h1>
      <p className="mt-2 text-gray-500">Admin panel overview</p>

      {error && (
        <div className="mt-6">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {/* Row 1 — Stat Cards */}
      {loading ? (
        <div className="mt-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white py-16">
          <div className="flex items-center gap-3 text-gray-600">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
            <span className="text-sm font-medium">Loading admin stats...</span>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <p className="text-sm text-gray-500">Total Users</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">
              {stats.totalUsers}
            </p>
          </Card>

          <Card>
            <p className="text-sm text-gray-500">Total Top-Ups</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">
              {stats.totalTopUps}
            </p>
          </Card>

          <Card>
            <p className="text-sm text-gray-500">Pending Applications</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">
              {stats.pendingApplications}
            </p>
          </Card>

          <Card>
            <p className="text-sm text-gray-500">Total Audit Events</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">
              {stats.totalAuditEvents}
            </p>
          </Card>
        </div>
      )}

      {/* Row 2 — Chart (2/3) + Recent Activity (1/3) */}
      {!loading && !error && (
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card title="Nebula Index">
              <NebulaIndexChart height={250} showDetails />
            </Card>
          </div>

          <Card title="Recent Activity">
            {activityError ? (
              <Alert variant="error">{activityError}</Alert>
            ) : activityLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
              </div>
            ) : activity.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">
                No activity recorded yet.
              </p>
            ) : (
              <div className="space-y-3">
                {activity.map((entry) => (
                  <div
                    key={entry.auditLogId}
                    className="flex items-start justify-between gap-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="inline-block text-xs font-medium px-1.5 py-0.5 rounded bg-primary-50 text-primary-700">
                        {ACTION_LABELS[entry.action] || entry.action}
                      </span>
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {entry.actorName || "System"}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {formatDate(entry.createdAt)}
                    </span>
                  </div>
                ))}
                <Link
                  to="/admin/audit"
                  className="block text-xs text-primary-600 hover:text-primary-700 pt-1"
                >
                  View all activity
                </Link>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Row 3 — Market Snapshot */}
      {!loading && !error && (
        <div className="mt-8">
          <Card title="Market Snapshot — Top 5 Stocks">
            {stocksError ? (
              <Alert variant="error">{stocksError}</Alert>
            ) : stocksLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
              </div>
            ) : topStocks.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">
                No stocks available yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 font-medium text-gray-500">
                        Symbol
                      </th>
                      <th className="text-left py-2 font-medium text-gray-500">
                        Company
                      </th>
                      <th className="text-right py-2 font-medium text-gray-500">
                        Price
                      </th>
                      <th className="text-right py-2 font-medium text-gray-500">
                        Change
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topStocks.map((stock) => {
                      const change = stock.currentPrice - stock.previousClose;
                      const changePercent =
                        stock.previousClose > 0
                          ? (change / stock.previousClose) * 100
                          : 0;
                      const isUp = change >= 0;
                      return (
                        <tr
                          key={stock.id}
                          className="border-b border-gray-100 last:border-0"
                        >
                          <td className="py-3 font-medium text-gray-900">
                            {stock.symbol}
                          </td>
                          <td className="py-3 text-gray-600">
                            {stock.companyName}
                          </td>
                          <td className="py-3 text-right text-gray-900">
                            {formatPaise(stock.currentPrice)}
                          </td>
                          <td
                            className={`py-3 text-right font-medium ${
                              isUp ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {isUp ? "+" : ""}
                            {changePercent.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      {!loading && !error && (
        <div className="mt-8">
          <Card title="Quick Actions">
            <div className="grid sm:grid-cols-2 gap-2">
              <Link
                to="/admin/users"
                className="block px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                Manage users
              </Link>
              <Link
                to="/admin/brokers"
                className="block px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                Review broker applications
              </Link>
              <Link
                to="/admin/topups"
                className="block px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                Override a top-up
              </Link>
              <Link
                to="/admin/audit"
                className="block px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                View audit log
              </Link>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
