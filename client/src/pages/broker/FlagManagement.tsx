/**
 * Flag Management Page
 *
 * Create flags on assigned traders and view flag history.
 * Desktop table + mobile cards pattern.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";

interface Trader {
  traderId: string;
  displayName: string;
  email: string;
}

interface Flag {
  flagId: string;
  traderName: string;
  traderEmail: string;
  reason: string;
  note: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

interface Pagination {
  page: number;
  totalPages: number;
  totalCount: number;
  limit: number;
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-yellow-100 text-yellow-800",
  RESOLVED: "bg-green-100 text-green-800",
  DISMISSED: "bg-gray-100 text-gray-600",
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const FLAGS_PER_PAGE = 10;

export function FlagManagement() {
  // ─── Traders for dropdown ──────────────────────────────────────────
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loadingTraders, setLoadingTraders] = useState(true);

  // ─── Create Flag Form ──────────────────────────────────────────────
  const [selectedTraderId, setSelectedTraderId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  // ─── Flag History ──────────────────────────────────────────────────
  const [flags, setFlags] = useState<Flag[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loadingFlags, setLoadingFlags] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    fetchTraders();
    fetchFlags(1);
  }, []);

  async function fetchTraders() {
    try {
      const { data } = await api.get("/broker/traders");
      setTraders(data);
    } catch {
      // Silently fail — dropdown will be empty
    } finally {
      setLoadingTraders(false);
    }
  }

  async function fetchFlags(page: number) {
    if (page === 1) setLoadingFlags(true);
    else setLoadingPage(true);
    setHistoryError("");

    try {
      const { data } = await api.get(
        `/broker/flags?page=${page}&limit=${FLAGS_PER_PAGE}`,
      );
      setFlags(data.data);
      setPagination(data.pagination);
    } catch {
      setHistoryError("Failed to load flag history.");
    } finally {
      setLoadingFlags(false);
      setLoadingPage(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTraderId || reason.length < 10) return;

    setSubmitting(true);
    setFormError("");
    setFormSuccess("");

    try {
      await api.post("/broker/flags", {
        traderId: selectedTraderId,
        reason,
        note: note || undefined,
      });

      // Reset form
      setSelectedTraderId("");
      setReason("");
      setNote("");
      setFormSuccess("Flag submitted successfully.");

      // Refresh flag history
      fetchFlags(1);
    } catch (err: any) {
      setFormError(err.response?.data?.message || "Failed to submit flag.");
    } finally {
      setSubmitting(false);
    }
  }

  const reasonError =
    reason && reason.length < 10
      ? "Reason must be at least 10 characters"
      : reason.length > 500
        ? "Reason must be at most 500 characters"
        : "";

  const canSubmit =
    selectedTraderId &&
    reason.length >= 10 &&
    reason.length <= 500 &&
    !submitting;

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <Link
          to="/broker"
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">
          Flag Management
        </h1>
      </div>

      {/* Create Flag Form */}
      <Card title="Flag a Trader">
        {formError && (
          <div className="mb-4">
            <Alert variant="error">{formError}</Alert>
          </div>
        )}
        {formSuccess && (
          <div className="mb-4">
            <Alert variant="success">{formSuccess}</Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Trader dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Trader
            </label>
            <select
              value={selectedTraderId}
              onChange={(e) => setSelectedTraderId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              required
              disabled={loadingTraders}
            >
              <option value="">
                {loadingTraders ? "Loading traders..." : "Select a trader..."}
              </option>
              {traders.map((t) => (
                <option key={t.traderId} value={t.traderId}>
                  {t.displayName || t.email} ({t.email})
                </option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <Input
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={reasonError}
            placeholder="Describe the suspicious activity in detail..."
            required
          />
          <p className="text-xs text-gray-400 -mt-2">
            Minimum 10 characters, maximum 500.
          </p>

          {/* Note (optional) */}
          <Input
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Additional notes for admin review..."
            maxLength={200}
          />
          <p className="text-xs text-gray-400 -mt-2">Maximum 200 characters.</p>

          <Button type="submit" variant="danger" disabled={!canSubmit}>
            {submitting ? "Submitting..." : "Submit Flag"}
          </Button>
        </form>
      </Card>

      {/* Flag History */}
      <Card title="Flag History">
        {historyError && (
          <div className="mb-4">
            <Alert variant="error">{historyError}</Alert>
          </div>
        )}

        {loadingFlags ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
          </div>
        ) : flags.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No flags submitted yet.</p>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Trader
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Reason
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Status
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {flags.map((flag) => (
                      <tr
                        key={flag.flagId}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">
                            {flag.traderName || "—"}
                          </p>
                          <p className="text-xs text-gray-400">
                            {flag.traderEmail}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-900 line-clamp-2">
                            {flag.reason}
                          </p>
                          {flag.note && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Note: {flag.note}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                              STATUS_STYLES[flag.status] ||
                              "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {flag.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500 text-xs">
                          {formatDate(flag.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {flags.map((flag) => (
                <Card key={flag.flagId}>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {flag.traderName || "—"}
                        </p>
                        <p className="text-xs text-gray-400">
                          {flag.traderEmail}
                        </p>
                      </div>
                      <span
                        className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                          STATUS_STYLES[flag.status] ||
                          "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {flag.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-3">
                      {flag.reason}
                    </p>
                    {flag.note && (
                      <p className="text-xs text-gray-400">Note: {flag.note}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {formatDate(flag.createdAt)}
                    </p>
                  </div>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-4">
                <p className="text-xs text-gray-400">
                  Page {pagination.page} of {pagination.totalPages}
                </p>
                <div className="flex gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fetchFlags(pagination.page - 1)}
                    disabled={pagination.page <= 1 || loadingPage}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fetchFlags(pagination.page + 1)}
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
      </Card>
    </div>
  );
}
