/**
 * Top-Up Management Page
 *
 * Process collateral top-ups for assigned traders with receipt upload.
 * View paginated top-up history.
 * UI ONLY — all validation and business logic is server-side.
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";
import { formatPaise } from "../../lib/utils";

// ─── Display constants (mirrored from server for UX only) ────────────────

const MIN_AMOUNT_RUPEES = 100;
const MAX_AMOUNT_RUPEES = 100_000;
const MAX_FILE_SIZE_MB = 5;
const PAYMENT_METHODS = ["eSewa", "Khalti", "Bank Transfer", "QR"] as const;
const TOPS_PER_PAGE = 10;

// ─── Types ──────────────────────────────────────────────────────────────

interface Trader {
  traderId: string;
  displayName: string;
  email: string;
}

interface TopUp {
  topUpRequestId: string;
  traderName: string;
  traderEmail: string;
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

// ─── Helpers ────────────────────────────────────────────────────────────

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Component ──────────────────────────────────────────────────────────

export function TopUpManagement() {
  // Traders
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loadingTraders, setLoadingTraders] = useState(true);

  // Form
  const [selectedTraderId, setSelectedTraderId] = useState("");
  const [amountRupees, setAmountRupees] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [note, setNote] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    fetchTraders();
    fetchHistory(1);
  }, []);

  async function fetchTraders() {
    try {
      const { data } = await api.get("/broker/traders");
      setTraders(data);
    } catch {
      // Silently fail
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
        `/broker/topups?page=${page}&limit=${TOPS_PER_PAGE}`,
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError("");

    if (!file.type.startsWith("image/")) {
      setFormError("Please select an image file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setFormError(`File must be less than ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    setReceiptFile(file);
  }

  function resetForm() {
    setSelectedTraderId("");
    setAmountRupees("");
    setPaymentMethod("");
    setTransactionRef("");
    setNote("");
    setReceiptFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!receiptFile) {
      setFormError("Please upload a receipt image.");
      return;
    }

    const amountPaise = Math.round(parseFloat(amountRupees) * 100);
    if (
      isNaN(amountPaise) ||
      amountPaise < MIN_AMOUNT_RUPEES * 100 ||
      amountPaise > MAX_AMOUNT_RUPEES * 100
    ) {
      setFormError(
        `Amount must be between Rs. ${MIN_AMOUNT_RUPEES} and Rs. ${MAX_AMOUNT_RUPEES.toLocaleString()}.`,
      );
      return;
    }

    setSubmitting(true);

    const formData = new FormData();
    formData.append("traderId", selectedTraderId);
    formData.append("amountPaise", String(amountPaise));
    formData.append("paymentMethod", paymentMethod);
    formData.append("transactionRef", transactionRef);
    if (note) formData.append("note", note);
    formData.append("receipt", receiptFile);

    try {
      const { data } = await api.post("/broker/topups", formData);
      setFormSuccess(
        `Top-up of ${data.topUpRequest.amountFormatted || formatPaise(data.topUpRequest.amountPaise)} credited successfully.`,
      );
      resetForm();
      fetchHistory(1);
    } catch (err: any) {
      const message =
        err.response?.data?.message || "Failed to process top-up.";
      setFormError(Array.isArray(message) ? message[0] : message);
    } finally {
      setSubmitting(false);
    }
  }

  // Client-side UX validation only (server validates too)
  const amountNum = parseFloat(amountRupees);
  const amountError =
    amountRupees &&
    (isNaN(amountNum) ||
      amountNum < MIN_AMOUNT_RUPEES ||
      amountNum > MAX_AMOUNT_RUPEES)
      ? `Rs. ${MIN_AMOUNT_RUPEES}–${MAX_AMOUNT_RUPEES.toLocaleString()}`
      : "";

  const canSubmit =
    selectedTraderId &&
    amountNum >= MIN_AMOUNT_RUPEES &&
    amountNum <= MAX_AMOUNT_RUPEES &&
    paymentMethod &&
    transactionRef.trim().length >= 3 &&
    receiptFile &&
    !submitting;

  const isFormDisabled = traders.length === 0;

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
          Top-Up Management
        </h1>
      </div>

      {/* Top-Up Form */}
      <Card title="Process Top-Up">
        {isFormDisabled ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No traders assigned yet.</p>
            <p className="text-sm text-gray-400 mt-1">
              Traders will appear here once they select you as their broker.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Two-column layout */}
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Trader */}
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
                    {loadingTraders ? "Loading..." : "Select a trader..."}
                  </option>
                  {traders.map((t) => (
                    <option key={t.traderId} value={t.traderId}>
                      {t.displayName || t.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <Input
                label="Amount (Rs.)"
                type="number"
                inputMode="decimal"
                min={MIN_AMOUNT_RUPEES}
                max={MAX_AMOUNT_RUPEES}
                step="0.01"
                placeholder={`Rs. ${MIN_AMOUNT_RUPEES}–${MAX_AMOUNT_RUPEES.toLocaleString()}`}
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                error={amountError}
                required
              />

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                >
                  <option value="">Select method...</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Transaction Reference */}
              <Input
                label="Transaction Reference"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="e.g. TXN-XXXX"
                required
              />
            </div>

            {/* Note — full width */}
            <Input
              label="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any additional notes..."
              maxLength={200}
            />

            {/* Receipt Upload — full width */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Receipt Image
              </label>
              <div
                className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  receiptFile
                    ? "border-green-300 bg-green-50"
                    : "border-gray-300 hover:border-gray-400 bg-white"
                }`}
              >
                {receiptFile ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-green-700">
                      {receiptFile.name}
                    </p>
                    <p className="text-xs text-green-600">
                      {formatFileSize(receiptFile.size)}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReceiptFile(null);
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                      className="text-xs text-red-500 hover:text-red-600 mt-1 relative z-10"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <svg
                      className="mx-auto w-8 h-8 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                      />
                    </svg>
                    <p className="text-sm text-gray-500">
                      Drop receipt image or click to browse
                    </p>
                    <p className="text-xs text-gray-400">
                      PNG, JPG up to {MAX_FILE_SIZE_MB}MB
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  required={!receiptFile}
                />
              </div>
            </div>

            {/* Error/Success — placed near submit button */}
            {formError && <Alert variant="error">{formError}</Alert>}
            {formSuccess && <Alert variant="success">{formSuccess}</Alert>}

            <Button
              type="submit"
              variant="primary"
              disabled={!canSubmit}
              className="w-full sm:w-auto"
            >
              {submitting ? "Processing..." : "Process Top-Up"}
            </Button>
          </form>
        )}
      </Card>

      {/* Top-Up History */}
      <Card title="Top-Up History">
        {historyError && (
          <div className="mb-4">
            <Alert variant="error">{historyError}</Alert>
          </div>
        )}

        {loadingHistory ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
          </div>
        ) : topUps.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">
            No top-ups processed yet.
          </p>
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
                        <p className="text-xs text-gray-400">{t.traderEmail}</p>
                      </div>
                      <p className="text-sm font-bold text-gray-900">
                        {t.amountFormatted}
                      </p>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t.paymentMethod}</span>
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
