/**
 * Activity Log Page
 *
 * Displays paginated audit log of all broker actions.
 * Read-only — data is created automatically by the server.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";

interface AuditEntry {
  auditLogId: string;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  totalPages: number;
  totalCount: number;
  limit: number;
}

const ACTION_LABELS: Record<string, string> = {
  TOP_UP_CREDITED: "Top-Up Credited",
  ACCOUNT_FLAGGED: "Trader Flagged",
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const LOGS_PER_PAGE = 10;

export function ActivityLog() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchLogs(1);
  }, []);

  async function fetchLogs(page: number) {
    if (page === 1) setLoading(true);
    else setLoadingPage(true);
    setError("");

    try {
      const { data } = await api.get(
        `/broker/activity?page=${page}&limit=${LOGS_PER_PAGE}`,
      );
      setLogs(data.data);
      setPagination(data.pagination);
    } catch {
      setError("Failed to load activity log.");
    } finally {
      setLoading(false);
      setLoadingPage(false);
    }
  }

  function getDescription(entry: AuditEntry): string {
    switch (entry.action) {
      case "TOP_UP_CREDITED":
        return `Top-up of Rs. ${((entry.metadata?.amountPaise as number) || 0) / 100} for trader ${entry.metadata?.traderId || "unknown"}`;
      case "ACCOUNT_FLAGGED":
        return `Flagged trader ${entry.metadata?.traderId || "unknown"}: ${(entry.metadata?.reason as string) || "No reason"}`;
      default:
        return entry.action;
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <Link
          to="/broker"
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">Activity Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          Complete record of all actions taken on your broker account.
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-500">No activity recorded yet.</p>
            <p className="text-sm text-gray-400 mt-1">
              Actions like top-ups and flags will appear here.
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
                        Action
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Details
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((entry) => (
                      <tr
                        key={entry.auditLogId}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3">
                          <span className="inline-block text-xs font-medium px-2 py-0.5 rounded bg-primary-50 text-primary-700">
                            {ACTION_LABELS[entry.action] || entry.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs max-w-md truncate">
                          {getDescription(entry)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500 text-xs whitespace-nowrap">
                          {formatDate(entry.createdAt)}
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
            {logs.map((entry) => (
              <Card key={entry.auditLogId}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-block text-xs font-medium px-2 py-0.5 rounded bg-primary-50 text-primary-700">
                      {ACTION_LABELS[entry.action] || entry.action}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDate(entry.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {getDescription(entry)}
                  </p>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchLogs(pagination.page - 1)}
                  disabled={pagination.page <= 1 || loadingPage}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchLogs(pagination.page + 1)}
                  disabled={
                    pagination.page >= pagination.totalPages || loadingPage
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
