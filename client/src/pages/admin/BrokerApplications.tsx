/**
 * Admin Broker Applications Page
 *
 * Review pending broker applications: approve (assign broker number)
 * or reject (mandatory reason). Not paginated — see broker.service.ts's
 * getAllApplications for why (low volume, manual one-at-a-time review).
 */

import { useState, useEffect, useCallback } from "react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";

interface Application {
  applicationId: string;
  fullName: string;
  email: string;
  phone: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  existingUserId: string | null;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

type ModalMode = "approve" | "reject" | null;

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-700",
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AdminBrokerApplications() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalTarget, setModalTarget] = useState<Application | null>(null);
  const [brokerNumber, setBrokerNumber] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);

  useEffect(() => {
    fetchApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function fetchApplications() {
    setLoading(true);
    setError("");

    try {
      const params = statusFilter ? `?status=${statusFilter}` : "";
      const { data } = await api.get(`/admin/broker-applications${params}`);
      setApplications(data);
    } catch {
      setError("Failed to load broker applications.");
    } finally {
      setLoading(false);
    }
  }

  function openApprove(app: Application) {
    setModalMode("approve");
    setModalTarget(app);
    setBrokerNumber("");
    setAdminNote("");
    setActionError("");
  }

  function openReject(app: Application) {
    setModalMode("reject");
    setModalTarget(app);
    setAdminNote("");
    setActionError("");
  }

  const closeModal = useCallback(() => {
    setModalMode(null);
    setModalTarget(null);
    setBrokerNumber("");
    setAdminNote("");
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

  async function handleApprove() {
    if (!modalTarget || !brokerNumber.trim()) return;

    setActionSubmitting(true);
    setActionError("");

    try {
      await api.patch(
        `/admin/broker-applications/${modalTarget.applicationId}/approve`,
        {
          brokerNumber: brokerNumber.trim(),
          adminNote: adminNote.trim() || undefined,
        },
      );
      closeModal();
      fetchApplications();
    } catch (err: any) {
      setActionError(
        err.response?.data?.message || "Failed to approve application.",
      );
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleReject() {
    if (!modalTarget || adminNote.trim().length === 0) return;

    setActionSubmitting(true);
    setActionError("");

    try {
      await api.patch(
        `/admin/broker-applications/${modalTarget.applicationId}/reject`,
        {
          adminNote: adminNote.trim(),
        },
      );
      closeModal();
      fetchApplications();
    } catch (err: any) {
      setActionError(
        err.response?.data?.message || "Failed to reject application.",
      );
    } finally {
      setActionSubmitting(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Broker Applications
        </h1>
        <p className="text-sm text-gray-400">
          {applications.length} application
          {applications.length !== 1 ? "s" : ""}
        </p>
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
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
        </div>
      ) : applications.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-500">No applications found.</p>
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
                        Applicant
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Email
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Phone
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
                    {applications.map((app) => (
                      <tr
                        key={app.applicationId}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">
                            {app.fullName}
                          </p>
                          {app.existingUserId && (
                            <p className="text-xs text-yellow-700">
                              ⚠️ Existing account
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {app.email}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {app.phone}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                              STATUS_STYLES[app.status] ||
                              "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {app.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {formatDate(app.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {app.status === "PENDING" && (
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openApprove(app)}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => openReject(app)}
                              >
                                Reject
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
            {applications.map((app) => (
              <Card key={app.applicationId}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {app.fullName}
                      </p>
                      <p className="text-xs text-gray-400">{app.email}</p>
                    </div>
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                        STATUS_STYLES[app.status] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {app.status}
                    </span>
                  </div>
                  {app.existingUserId && (
                    <p className="text-xs text-yellow-700">
                      ⚠️ Applicant already has an account
                    </p>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{app.phone}</span>
                    <span className="text-gray-400 text-xs">
                      {formatDate(app.createdAt)}
                    </span>
                  </div>
                  {app.status === "PENDING" && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => openApprove(app)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="flex-1"
                        onClick={() => openReject(app)}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Approve/Reject Modal */}
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
              modalMode === "approve"
                ? `Approve ${modalTarget.fullName}`
                : `Reject ${modalTarget.fullName}`
            }
          >
            <Card
              title={
                modalMode === "approve"
                  ? `Approve ${modalTarget.fullName}`
                  : `Reject ${modalTarget.fullName}`
              }
            >
              <div className="space-y-4">
                {modalMode === "approve" ? (
                  <>
                    <Input
                      label="Broker Number"
                      value={brokerNumber}
                      onChange={(e) => setBrokerNumber(e.target.value)}
                      placeholder="e.g. BROKER-001"
                      required
                    />
                    <Input
                      label="Note (optional)"
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      placeholder="Any additional notes..."
                    />
                  </>
                ) : (
                  <>
                    <Input
                      label="Rejection Reason"
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      placeholder="Explain why this application is being rejected..."
                      required
                    />
                    <p className="text-xs text-gray-400 -mt-2">
                      This reason is required and sent to the applicant.
                    </p>
                  </>
                )}

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
                  {modalMode === "approve" ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleApprove}
                      disabled={!brokerNumber.trim() || actionSubmitting}
                    >
                      {actionSubmitting ? "Approving..." : "Confirm Approve"}
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleReject}
                      disabled={
                        adminNote.trim().length === 0 || actionSubmitting
                      }
                    >
                      {actionSubmitting ? "Rejecting..." : "Confirm Reject"}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
