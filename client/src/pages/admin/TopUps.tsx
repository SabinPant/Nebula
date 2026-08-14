/**
 * Admin Top-Ups Page
 *
 * Override form to credit any trader's wallet bypassing the weekly cap
 * (reason + reference mandatory — see admin.service.ts's overrideTopUp),
 * plus a page-based paginated table of every top-up in the system.
 */

import { useState, useEffect } from "react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";
import { formatPaise } from "../../lib/utils";

const MIN_AMOUNT_RUPEES = 0.01;
const TOPUPS_PER_PAGE = 20;
const TRADERS_PER_PAGE = 20;
const TRADER_SEARCH_DEBOUNCE_MS = 300;

interface Trader {
  id: string;
  displayName: string | null;
  email: string;
}

interface TopUp {
  topUpRequestId: string;
  traderId: string;
  traderName: string | null;
  traderEmail: string;
  brokerId: string;
  brokerName: string | null;
  amountPaise: number;
  amountFormatted: string;
  paymentMethod: string;
  transactionRef: string;
  status: string;
  weeklyTotalBefore: number;
  createdAt: string;
}

interface Pagination {
  page: number;
  totalPages: number;
  totalCount: number;
  limit: number;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminTopUps() {
  // Traders for dropdown — search-driven so the full trader base is
  // reachable rather than silently truncated at a fixed page size.
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loadingTraders, setLoadingTraders] = useState(true);
  const [traderSearchInput, setTraderSearchInput] = useState("");
  const [traderSearch, setTraderSearch] = useState("");
  const [traderSearchError, setTraderSearchError] = useState("");

  // Override form
  const [traderId, setTraderId] = useState("");
  const [amountRupees, setAmountRupees] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  // History
  const [topUps, setTopUps] = useState<TopUp[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    fetchHistory(1);
  }, []);

  // Debounce trader search input before hitting the API.
  useEffect(() => {
    const timer = setTimeout(() => {
      setTraderSearch(traderSearchInput.trim());
    }, TRADER_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [traderSearchInput]);

  useEffect(() => {
    fetchTraders(traderSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traderSearch]);

  async function fetchTraders(search: string) {
    setLoadingTraders(true);
    setTraderSearchError("");

    try {
      const params = new URLSearchParams({
        userType: "TRADER",
        limit: String(TRADERS_PER_PAGE),
      });
      if (search) params.set("search", search);

      const { data } = await api.get(`/admin/users?${params.toString()}`);
      setTraders(data.data);
    } catch {
      setTraderSearchError("Failed to load traders.");
      setTraders([]);
    } finally {
      setLoadingTraders(false);
    }
  }

  async function fetchHistory(page: number) {
    if (page === 1) setLoadingHistory(true);
    else setLoadingPage(true);
    setHistoryError("");

    try {
      const { data } = await api.get(
        `/admin/topups?page=${page}&limit=${TOPUPS_PER_PAGE}`,
      );
      setTopUps(data.data);
      setPagination(data.pagination);
    } catch {
      setHistoryError("Failed to load top-up history.");
    } finally {
      setLoadingHistory(false);
      setLoadingPage(false);
    }
  }

  function resetForm() {
    setTraderId("");
    setAmountRupees("");
    setReason("");
    setReference("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    const amountPaise = Math.round(parseFloat(amountRupees) * 100);
    if (isNaN(amountPaise) || amountPaise < 1) {
      setFormError("Amount must be a positive value.");
      return;
    }
    if (reason.trim().length < 10) {
      setFormError("Reason must be at least 10 characters.");
      return;
    }
    if (reference.trim().length < 3) {
      setFormError("Reference must be at least 3 characters.");
      return;
    }

    setSubmitting(true);

    try {
      await api.post("/admin/topups", {
        traderId,
        amountPaise,
        reason: reason.trim(),
        reference: reference.trim(),
      });
      setFormSuccess(`Top-up of ${formatPaise(amountPaise)} credited successfully.`);
      resetForm();
      fetchHistory(1);
    } catch (err: any) {
      const message =
        err.response?.data?.message || "Failed to process override top-up.";
      setFormError(Array.isArray(message) ? message[0] : message);
    } finally {
      setSubmitting(false);
    }
  }

  const amountNum = parseFloat(amountRupees);
  const amountError =
    amountRupees && (isNaN(amountNum) || amountNum < MIN_AMOUNT_RUPEES)
      ? "Enter a valid positive amount"
      : "";

  const reasonError =
    reason && reason.length < 10
      ? "Reason must be at least 10 characters"
      : "";

  const referenceError =
    reference && reference.length < 3
      ? "Reference must be at least 3 characters"
      : "";

  const canSubmit =
    traderId &&
    amountNum > 0 &&
    reason.trim().length >= 10 &&
    reference.trim().length >= 3 &&
    !submitting;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Top-Ups</h1>

      {/* Override Form */}
      <Card title="Override Top-Up">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Search Traders"
              placeholder="Search by email or name..."
              value={traderSearchInput}
              onChange={(e) => setTraderSearchInput(e.target.value)}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Trader
              </label>
              <select
                value={traderId}
                onChange={(e) => setTraderId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
                disabled={loadingTraders}
              >
                <option value="">
                  {loadingTraders
                    ? "Loading..."
                    : traders.length === 0
                      ? "No traders match this search"
                      : "Select a trader..."}
                </option>
                {traders.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName || t.email} ({t.email})
                  </option>
                ))}
              </select>
              {traders.length === TRADERS_PER_PAGE && (
                <p className="text-xs text-gray-400 mt-1">
                  Showing first {TRADERS_PER_PAGE} matches — refine your
                  search to narrow down further.
                </p>
              )}
            </div>

            <Input
              label="Amount (Rs.)"
              type="number"
              inputMode="decimal"
              min={MIN_AMOUNT_RUPEES}
              step="0.01"
              placeholder="Amount to credit"
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              error={amountError}
              required
            />

            <Input
              label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              error={reasonError}
              placeholder="Why is this override being granted?"
              required
            />

            <Input
              label="Reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              error={referenceError}
              placeholder="Payment or case reference"
              required
            />
          </div>

          {traderSearchError && (
            <Alert variant="error">{traderSearchError}</Alert>
          )}
          {formError && <Alert variant="error">{formError}</Alert>}
          {formSuccess && <Alert variant="success">{formSuccess}</Alert>}

          <Button
            type="submit"
            variant="primary"
            disabled={!canSubmit}
            className="w-full sm:w-auto"
          >
            {submitting ? "Processing..." : "Credit Top-Up"}
          </Button>
        </form>
      </Card>

      {/* Top-Up History */}
      <Card title="All Top-Ups">
        {historyError && <Alert variant="error">{historyError}</Alert>}

        {loadingHistory ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
          </div>
        ) : topUps.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No top-ups yet.</p>
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
                        Broker
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Amount
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Method
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Reference
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topUps.map((t) => (
                      <tr
                        key={t.topUpRequestId}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">
                            {t.traderName || "—"}
                          </p>
                          <p className="text-xs text-gray-400">
                            {t.traderEmail}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {t.brokerName || "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 font-medium">
                          {t.amountFormatted}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {t.paymentMethod}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs font-mono">
                          {t.transactionRef}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500 text-xs">
                          {formatDate(t.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {topUps.map((t) => (
                <Card key={t.topUpRequestId}>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {t.traderName || "—"}
                        </p>
                        <p className="text-xs text-gray-400">
                          {t.traderEmail}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-gray-900">
                        {t.amountFormatted}
                      </p>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">
                        {t.paymentMethod} · {t.brokerName || "—"}
                      </span>
                      <span className="text-gray-400 text-xs font-mono">
                        {t.transactionRef}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {formatDate(t.createdAt)}
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
                    onClick={() => fetchHistory(pagination.page - 1)}
                    disabled={pagination.page <= 1 || loadingPage}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fetchHistory(pagination.page + 1)}
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
