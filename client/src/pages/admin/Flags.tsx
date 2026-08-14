/**
 * Admin Flags Page
 *
 * System-wide suspicious-flag review queue. Brokers create flags
 * (FlagManagement.tsx); this page is where an admin resolves or
 * dismisses them. Page-based pagination (20/page) + status filter,
 * desktop table + mobile cards — same pattern as every other admin page.
 */

import { useState, useEffect, useCallback } from "react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";

interface Flag {
  flagId: string;
  traderId: string;
  traderName: string | null;
  traderEmail: string;
  brokerId: string;
  brokerName: string | null;
  brokerEmail: string;
  reason: string;
  note: string | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  totalPages: number;
  totalCount: number;
  limit: number;
}

type ModalMode = "resolve" | "dismiss" | null;

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-yellow-100 text-yellow-800",
  RESOLVED: "bg-green-100 text-green-800",
  DISMISSED: "bg-gray-100 text-gray-600",
};

const FLAGS_PER_PAGE = 20;

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminFlags() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalTarget, setModalTarget] = useState<Flag | null>(null);
  const [resolution, setResolution] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);

  useEffect(() => {
    fetchFlags(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function fetchFlags(page: number) {
    if (page === 1) setLoading(true);
    else setLoadingPage(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(FLAGS_PER_PAGE),
      });
      if (statusFilter) params.set("status", statusFilter);

      const { data } = await api.get(`/admin/flags?${params.toString()}`);
      setFlags(data.data);
      setPagination(data.pagination);
    } catch {
      setError("Failed to load flags.");
    } finally {
      setLoading(false);
      setLoadingPage(false);
    }
  }

  function openResolve(flag: Flag) {
    setModalMode("resolve");
    setModalTarget(flag);
    setResolution("");
    setActionError("");
  }

  function openDismiss(flag: Flag) {
    setModalMode("dismiss");
    setModalTarget(flag);
    setResolution("");
    setActionError("");
  }

  const closeModal = useCallback(() => {
    setModalMode(null);
    setModalTarget(null);
    setResolution("");
    setActionError("");
  }, []);

  useEffect(() => {
    if (!modalMode) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalMode, closeModal]);

  async function handleConfirm() {
    if (!modalTarget || !modalMode || resolution.trim().length < 10) return;

    setActionSubmitting(true);
    setActionError("");

    try {
      await api.patch(`/admin/flags/${modalTarget.flagId}/resolve`, {
        status: modalMode === "resolve" ? "RESOLVED" : "DISMISSED",
        resolution: resolution.trim(),
      });
      closeModal();
      fetchFlags(pagination?.page ?? 1);
    } catch (err: any) {
      setActionError(
        err.response?.data?.message || "Failed to update this flag.",
      );
    } finally {
      setActionSubmitting(false);
    }
  }

  const resolutionError =
    resolution && resolution.length < 10
      ? "Resolution must be at least 10 characters"
      : "";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Flags</h1>
        {pagination && (
          <p className="text-sm text-gray-400">
            {pagination.totalCount} flag{pagination.totalCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Filter */}
      <Card>
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        </div>
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
        </div>
      ) : flags.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-500">No flags found.</p>
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
                        Trader
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Broker
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Reason
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Status
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Date
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500"></th>
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
                          <p className="text-gray-900">
                            {flag.brokerName || "—"}
                          </p>
                          <p className="text-xs text-gray-400">
                            {flag.brokerEmail}
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
                          {flag.resolution && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              Decision: {flag.resolution}
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
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {formatDate(flag.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {flag.status === "OPEN" && (
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openResolve(flag)}
                              >
                                Resolve
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => openDismiss(flag)}
                              >
                                Dismiss
                              </Button>
                            </div>
                          )}
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
                        STATUS_STYLES[flag.status] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {flag.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Flagged by {flag.brokerName || flag.brokerEmail}
                  </p>
                  <p className="text-sm text-gray-700 line-clamp-3">
                    {flag.reason}
                  </p>
                  {flag.note && (
                    <p className="text-xs text-gray-400">Note: {flag.note}</p>
                  )}
                  {flag.resolution && (
                    <p className="text-xs text-gray-500">
                      Decision: {flag.resolution}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    {formatDate(flag.createdAt)}
                  </p>
                  {flag.status === "OPEN" && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => openResolve(flag)}
                      >
                        Resolve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="flex-1"
                        onClick={() => openDismiss(flag)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
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

      {/* Resolve/Dismiss Modal */}
      {modalMode && modalTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={
              modalMode === "resolve"
                ? `Resolve flag on ${modalTarget.traderName || modalTarget.traderEmail}`
                : `Dismiss flag on ${modalTarget.traderName || modalTarget.traderEmail}`
            }
          >
            <Card
              title={
                modalMode === "resolve"
                  ? `Resolve Flag — ${modalTarget.traderName || modalTarget.traderEmail}`
                  : `Dismiss Flag — ${modalTarget.traderName || modalTarget.traderEmail}`
              }
            >
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    Original reason
                  </p>
                  <p className="text-sm text-gray-700">{modalTarget.reason}</p>
                </div>

                <Input
                  label="Resolution Note"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  error={resolutionError}
                  placeholder={
                    modalMode === "resolve"
                      ? "Describe what action was taken..."
                      : "Explain why this flag is being dismissed..."
                  }
                  required
                />
                <p className="text-xs text-gray-400 -mt-2">
                  Minimum 10 characters.
                </p>

                {actionError && <Alert variant="error">{actionError}</Alert>}

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={closeModal}
                    disabled={actionSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant={modalMode === "resolve" ? "primary" : "danger"}
                    size="sm"
                    onClick={handleConfirm}
                    disabled={
                      resolution.trim().length < 10 || actionSubmitting
                    }
                  >
                    {actionSubmitting
                      ? "Saving..."
                      : modalMode === "resolve"
                        ? "Confirm Resolve"
                        : "Confirm Dismiss"}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
