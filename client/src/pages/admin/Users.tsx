/**
 * Admin Users Page
 *
 * Page-based paginated user list with suspend/unsuspend actions.
 * Desktop table + mobile cards pattern (mirrors broker pages).
 */

import { useState, useEffect, useCallback } from "react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";
import { formatPaise } from "../../lib/utils";

interface User {
  id: string;
  email: string;
  displayName: string | null;
  userType: string;
  isSuspended: boolean;
  suspendedReason: string | null;
  createdAt: string;
  wallet: {
    availableBalancePaise: number;
    totalDepositedPaise: number;
  } | null;
  orderCount: number;
}

interface Pagination {
  page: number;
  totalPages: number;
  totalCount: number;
  limit: number;
}

const USER_TYPES = ["TRADER", "BROKER", "ADMIN"] as const;
const USERS_PER_PAGE = 20;

export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState("");

  const [userTypeFilter, setUserTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Suspend modal state
  const [suspendTarget, setSuspendTarget] = useState<User | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userTypeFilter, search]);

  async function fetchUsers(page: number) {
    if (page === 1) setLoading(true);
    else setLoadingPage(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(USERS_PER_PAGE),
      });
      if (userTypeFilter) params.set("userType", userTypeFilter);
      if (search) params.set("search", search);

      const { data } = await api.get(`/admin/users?${params.toString()}`);
      setUsers(data.data);
      setPagination(data.pagination);
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
      setLoadingPage(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
  }

  function openSuspendModal(user: User) {
    setSuspendTarget(user);
    setSuspendReason("");
    setActionError("");
  }

  const closeSuspendModal = useCallback(() => {
    setSuspendTarget(null);
    setSuspendReason("");
    setActionError("");
  }, []);

  useEffect(() => {
    if (!suspendTarget) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeSuspendModal();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [suspendTarget, closeSuspendModal]);

  async function handleSuspendConfirm() {
    if (!suspendTarget || suspendReason.trim().length < 10) return;

    setActionSubmitting(true);
    setActionError("");

    try {
      await api.patch(`/admin/users/${suspendTarget.id}/suspend`, {
        reason: suspendReason.trim(),
      });
      closeSuspendModal();
      fetchUsers(pagination?.page ?? 1);
    } catch (err: any) {
      setActionError(
        err.response?.data?.message || "Failed to suspend user.",
      );
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleUnsuspend(user: User) {
    setBusyUserId(user.id);
    setError("");

    try {
      await api.patch(`/admin/users/${user.id}/unsuspend`);
      fetchUsers(pagination?.page ?? 1);
    } catch {
      setError("Failed to unsuspend user.");
    } finally {
      setBusyUserId(null);
    }
  }

  const suspendReasonError =
    suspendReason && suspendReason.length < 10
      ? "Reason must be at least 10 characters"
      : "";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        {pagination && (
          <p className="text-sm text-gray-400">
            {pagination.totalCount} user{pagination.totalCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Filters */}
      <Card>
        <div className="grid sm:grid-cols-[auto_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              User Type
            </label>
            <select
              value={userTypeFilter}
              onChange={(e) => setUserTypeFilter(e.target.value)}
              className="w-full sm:w-48 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">All types</option>
              {USER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={handleSearchSubmit}>
            <Input
              label="Search"
              placeholder="Search by email or name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>

          <Button type="button" variant="secondary" onClick={handleSearchSubmit}>
            Search
          </Button>
        </div>
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-500">No users found.</p>
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
                        Name
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Email
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Type
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Status
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Balance
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr
                        key={u.id}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {u.displayName || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{u.email}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {u.userType}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                              u.isSuspended
                                ? "bg-red-100 text-red-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {u.isSuspended ? "Suspended" : "Active"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {u.wallet
                            ? formatPaise(u.wallet.availableBalancePaise)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {u.userType === "ADMIN" ? null : u.isSuspended ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busyUserId === u.id}
                              onClick={() => handleUnsuspend(u)}
                            >
                              {busyUserId === u.id
                                ? "Working..."
                                : "Unsuspend"}
                            </Button>
                          ) : (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => openSuspendModal(u)}
                            >
                              Suspend
                            </Button>
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
            {users.map((u) => (
              <Card key={u.id}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {u.displayName || "—"}
                      </p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                        u.isSuspended
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {u.isSuspended ? "Suspended" : "Active"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-gray-500">Type</p>
                      <p className="text-gray-900 font-medium">
                        {u.userType}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Balance</p>
                      <p className="text-gray-900 font-medium">
                        {u.wallet
                          ? formatPaise(u.wallet.availableBalancePaise)
                          : "—"}
                      </p>
                    </div>
                  </div>
                  {u.userType !== "ADMIN" && (
                    <div className="pt-1">
                      {u.isSuspended ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full"
                          disabled={busyUserId === u.id}
                          onClick={() => handleUnsuspend(u)}
                        >
                          {busyUserId === u.id ? "Working..." : "Unsuspend"}
                        </Button>
                      ) : (
                        <Button
                          variant="danger"
                          size="sm"
                          className="w-full"
                          onClick={() => openSuspendModal(u)}
                        >
                          Suspend
                        </Button>
                      )}
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
                  onClick={() => fetchUsers(pagination.page - 1)}
                  disabled={pagination.page <= 1 || loadingPage}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchUsers(pagination.page + 1)}
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

      {/* Suspend Modal */}
      {suspendTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
          onClick={closeSuspendModal}
          role="presentation"
        >
          <div
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Suspend ${suspendTarget.displayName || suspendTarget.email}`}
          >
            <Card title={`Suspend ${suspendTarget.displayName || suspendTarget.email}`}>
              <div className="space-y-4">
                <Input
                  label="Reason"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  error={suspendReasonError}
                  placeholder="Explain why this user is being suspended..."
                  required
                />
                <p className="text-xs text-gray-400 -mt-2">
                  Minimum 10 characters. All pending orders will be
                  cancelled.
                </p>

                {actionError && <Alert variant="error">{actionError}</Alert>}

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={closeSuspendModal}
                    disabled={actionSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleSuspendConfirm}
                    disabled={
                      suspendReason.trim().length < 10 || actionSubmitting
                    }
                  >
                    {actionSubmitting ? "Suspending..." : "Confirm Suspend"}
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
