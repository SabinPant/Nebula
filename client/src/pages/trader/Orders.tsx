/**
 * Orders Page
 *
 * Order history with cursor pagination and cancel functionality.
 * Shows all orders (BUY/SELL, MARKET/LIMIT) with status badges.
 * Cancel button only appears for PENDING and PARTIALLY_FILLED orders.
 */

import { useState, useEffect } from "react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";
import { formatPaise } from "../../lib/utils";

interface Order {
  id: string;
  type: "BUY" | "SELL";
  orderStyle: "MARKET" | "LIMIT";
  status: string;
  quantity: number;
  filledQuantity: number;
  price: number | null;
  rejectionReason?: string;
  createdAt: string;
  stock: {
    symbol: string;
    companyName: string;
  };
}

interface Pagination {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  PARTIALLY_FILLED: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-600",
  REJECTED: "bg-red-100 text-red-800",
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    nextCursor: null,
    hasMore: false,
    limit: 20,
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders(cursor?: string) {
    const isInitial = !cursor;

    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "20");

      const { data } = await api.get(`/orders?${params.toString()}`);

      if (isInitial) {
        setOrders(data.data);
      } else {
        setOrders((prev) => [...prev, ...data.data]);
      }
      setPagination(data.pagination);
      setError("");
    } catch {
      setError("Failed to load orders.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function handleCancel(orderId: string) {
    setCancelling(orderId);
    setError("");
    try {
      await api.patch(`/orders/${orderId}/cancel`);

      // Update local state — mark as CANCELLED
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: "CANCELLED" } : o)),
      );
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to cancel order.");
    } finally {
      setCancelling(null);
    }
  }

  // ─── Loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Orders</h1>

      {error && <Alert variant="error">{error}</Alert>}

      {orders.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-500">No orders yet.</p>
            <p className="text-sm text-gray-400 mt-1">
              Place your first trade from the Trade page.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {orders.length} order{orders.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Stock
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Type
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">
                        Style
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Qty
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">
                        Price
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
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">
                            {order.stock.symbol}
                          </p>
                          <p className="text-xs text-gray-400">
                            {order.stock.companyName}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                              order.type === "BUY"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {order.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {order.orderStyle}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {order.filledQuantity}/{order.quantity}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {order.price ? formatPaise(order.price) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                              STATUS_STYLES[order.status] ||
                              "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {order.status.replace("_", " ")}
                          </span>
                          {order.rejectionReason && (
                            <p className="text-xs text-red-500 mt-0.5">
                              {order.rejectionReason}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {formatDate(order.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {(order.status === "PENDING" ||
                            order.status === "PARTIALLY_FILLED") && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleCancel(order.id)}
                              disabled={cancelling === order.id}
                            >
                              {cancelling === order.id ? "..." : "Cancel"}
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
            {orders.map((order) => (
              <Card key={order.id}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {order.stock.symbol}
                      </p>
                      <p className="text-xs text-gray-400">
                        {order.stock.companyName}
                      </p>
                    </div>
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                        STATUS_STYLES[order.status] ||
                        "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {order.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex gap-3 text-sm">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${
                        order.type === "BUY"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {order.type}
                    </span>
                    <span className="text-gray-500">{order.orderStyle}</span>
                    <span className="text-gray-900">
                      {order.filledQuantity}/{order.quantity} shares
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      {order.price ? formatPaise(order.price) : "Market"}
                    </span>
                    <span className="text-gray-400 text-xs">
                      {formatDate(order.createdAt)}
                    </span>
                  </div>
                  {order.rejectionReason && (
                    <p className="text-xs text-red-500">
                      {order.rejectionReason}
                    </p>
                  )}
                  {(order.status === "PENDING" ||
                    order.status === "PARTIALLY_FILLED") && (
                    <Button
                      variant="danger"
                      size="sm"
                      className="w-full"
                      onClick={() => handleCancel(order.id)}
                      disabled={cancelling === order.id}
                    >
                      {cancelling === order.id
                        ? "Cancelling..."
                        : "Cancel Order"}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Load More — capped at 100 */}
          {pagination.hasMore && orders.length < 100 && (
            <div className="text-center">
              <Button
                variant="secondary"
                onClick={() => fetchOrders(pagination.nextCursor!)}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading..." : "Load More"}
              </Button>
            </div>
          )}
          {pagination.hasMore && orders.length >= 100 && (
            <p className="text-center text-sm text-gray-400">
              Showing latest 100 orders. More filters coming soon.
            </p>
          )}
        </>
      )}
    </div>
  );
}
