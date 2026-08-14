/**
 * Admin Audit Log Page
 *
 * Read-only, system-wide audit trail. Page-based pagination + action filter.
 */

import { useState, useEffect } from "react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";

interface AuditEntry {
  auditLogId: string;
  action: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
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
  USER_SUSPENDED: "User Suspended",
  USER_UNSUSPENDED: "User Unsuspended",
  MANUAL_ADJUST: "Admin Top-Up Override",
  TOP_UP_CREDITED: "Top-Up Credited",
  ACCOUNT_FLAGGED: "Trader Flagged",
};

const ACTION_OPTIONS = Object.keys(ACTION_LABELS);

const LOGS_PER_PAGE = 20;

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function summarizeMetadata(metadata: Record<string, any> | null): string {
  if (!metadata) return "—";
  const parts = Object.entries(metadata)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${value}`);
  return parts.join(", ") || "—";
}

export function AdminAuditLog() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    fetchLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter]);

  async function fetchLogs(page: number) {
    if (page === 1) setLoading(true);
    else setLoadingPage(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LOGS_PER_PAGE),
      });
      if (actionFilter) params.set("action", actionFilter);

      const { data } = await api.get(`/admin/audit?${params.toString()}`);
      setLogs(data.data);
      setPagination(data.pagination);
    } catch {
      setError("Failed to load audit log.");
    } finally {
      setLoading(false);
      setLoadingPage(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          Complete record of every broker action, top-up, and suspension
          across the system.
        </p>
      </div>

      {/* Filter */}
      <Card>
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Action
          </label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All actions</option>
            {ACTION_OPTIONS.map((action) => (
              <option key={action} value={action}>
                {ACTION_LABELS[action]}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-500">No audit entries found.</p>
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
                        Actor
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        IP
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Metadata
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
                        <td className="px-4 py-3">
                          <p className="text-gray-900">
                            {entry.actorName || "System"}
                          </p>
                          {entry.actorEmail && (
                            <p className="text-xs text-gray-400">
                              {entry.actorEmail}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                          {entry.ipAddress || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs max-w-md truncate">
                          {summarizeMetadata(entry.metadata)}
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
                  <p className="text-sm text-gray-900">
                    {entry.actorName || "System"}
                    {entry.actorEmail && (
                      <span className="text-gray-400"> ({entry.actorEmail})</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {summarizeMetadata(entry.metadata)}
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
