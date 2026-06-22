/**
 * Trade Page
 *
 * Order placement form for BUY/SELL MARKET/LIMIT orders.
 * Fetches stock list and market status on mount.
 * Converts user-facing Rupee price to paise before API submission.
 * Generates UUID v4 idempotency key for safe retries.
 */

import { useState, useEffect, useCallback } from "react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Alert } from "../../components/ui/Alert";
import { useAuthStore } from "../../stores/authStore";
import api from "../../services/api";
import { formatPaise } from "../../lib/utils";

// Constants mirrored from server (no business logic — display only)
const ORDER_MAX_QUANTITY = 100_000;
const ORDER_MAX_PRICE_RUPEES = 100_000;
const ORDER_MIN_PRICE_RUPEES = 0.01;

interface Stock {
  id: string;
  symbol: string;
  companyName: string;
  currentPrice: number; // paise
  sector: string;
}

interface OrderResponse {
  id: string;
  type: string;
  orderStyle: string;
  status: string;
  quantity: number;
  filledQuantity: number;
  price: number | null;
  stock: { symbol: string; companyName: string };
}

type OrderType = "BUY" | "SELL";
type OrderStyle = "MARKET" | "LIMIT";

export function Trade() {
  // ─── Auth ────────────────────────────────────────────────────────────
  const user = useAuthStore((s) => s.user);

  // ─── Market & Stock Data ────────────────────────────────────────────
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [marketOpen, setMarketOpen] = useState(true);
  const [loadingStocks, setLoadingStocks] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // ─── Form State ─────────────────────────────────────────────────────
  const [selectedStockId, setSelectedStockId] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("BUY");
  const [orderStyle, setOrderStyle] = useState<OrderStyle>("MARKET");
  const [quantity, setQuantity] = useState("");
  const [priceRupees, setPriceRupees] = useState(""); // user-facing rupees
  const [submitting, setSubmitting] = useState(false);

  // ─── Result State ───────────────────────────────────────────────────
  const [result, setResult] = useState<OrderResponse | null>(null);
  const [error, setError] = useState("");

  // ─── Fetch stocks & market status ───────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const [stocksRes, statusRes] = await Promise.all([
          api.get("/market/stocks"),
          api.get("/market/status"),
        ]);
        setStocks(stocksRes.data);
        setMarketOpen(statusRes.data.isOpen);
      } catch {
        setFetchError("Failed to load market data. Please try again.");
      } finally {
        setLoadingStocks(false);
      }
    }
    init();
  }, []);

  // ─── Derived values (display only — no business logic) ──────────────
  const selectedStock = stocks.find((s) => s.id === selectedStockId);
  const isLimit = orderStyle === "LIMIT";
  const pricePaise = isLimit
    ? Math.round(parseFloat(priceRupees || "0") * 100)
    : null;

  const estimatedCost =
    selectedStock && quantity
      ? (isLimit && pricePaise ? pricePaise : selectedStock.currentPrice) *
        parseInt(quantity || "0")
      : 0;

  // ─── Validation (UI feedback only — server validates too) ───────────
  const quantityNum = parseInt(quantity || "0");
  const priceNum = parseFloat(priceRupees || "0");

  const quantityError =
    quantity &&
    (isNaN(quantityNum) || quantityNum < 1 || quantityNum > ORDER_MAX_QUANTITY)
      ? `Quantity must be 1–${ORDER_MAX_QUANTITY.toLocaleString()}`
      : "";

  const priceError =
    isLimit && priceRupees
      ? isNaN(priceNum) ||
        priceNum < ORDER_MIN_PRICE_RUPEES ||
        priceNum > ORDER_MAX_PRICE_RUPEES
        ? `Price must be Rs. ${ORDER_MIN_PRICE_RUPEES}–${ORDER_MAX_PRICE_RUPEES.toLocaleString()}`
        : ""
      : "";

  const canSubmit =
    selectedStockId &&
    quantityNum >= 1 &&
    quantityNum <= ORDER_MAX_QUANTITY &&
    (orderStyle === "MARKET" ||
      (pricePaise && pricePaise >= 1 && pricePaise <= 10_000_000)) &&
    !submitting &&
    marketOpen;

  // ─── Submit ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit || !user) return;

      setSubmitting(true);
      setError("");
      setResult(null);

      const idempotencyKey = crypto.randomUUID();
      const payload: Record<string, unknown> = {
        stockId: selectedStockId,
        type: orderType,
        orderStyle,
        quantity: quantityNum,
      };
      if (isLimit && pricePaise) {
        payload.price = pricePaise;
      }

      try {
        const { data } = await api.post("/orders", payload, {
          headers: { "X-Idempotency-Key": idempotencyKey },
        });
        setResult(data);
        // Reset form on success
        setQuantity("");
        setPriceRupees("");
      } catch (err: any) {
        const code = err.response?.data?.code;
        const message = err.response?.data?.message || "Something went wrong.";

        switch (code) {
          case "WALLET_INSUFFICIENT_FUNDS":
            setError("Insufficient available balance for this order.");
            break;
          case "HOLDING_NOT_FOUND":
            setError("You don't own any shares of this stock.");
            break;
          case "HOLDING_INSUFFICIENT":
            setError(message);
            break;
          case "MARKET_STOCK_HALTED":
            setError("This stock is currently halted and cannot be traded.");
            break;
          case "MARKET_CLOSED":
            setError(
              "MARKET orders are only accepted while the market is open.",
            );
            break;
          case "IDEMPOTENCY_CONFLICT":
            setError("Duplicate request detected. Please try again.");
            break;
          case "RATE_LIMIT_EXCEEDED":
            setError("Daily order limit reached (50 orders/day).");
            break;
          default:
            setError(message);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [
      canSubmit,
      user,
      selectedStockId,
      orderType,
      orderStyle,
      quantityNum,
      isLimit,
      pricePaise,
    ],
  );

  // ─── Loading State ──────────────────────────────────────────────────
  if (loadingStocks) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Fetch Error State ──────────────────────────────────────────────
  if (fetchError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Alert variant="error">{fetchError}</Alert>
      </div>
    );
  }

  // ─── Market Closed State ────────────────────────────────────────────
  if (!marketOpen) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card>
          <div className="text-center py-8">
            <p className="text-lg font-medium text-gray-900">
              Market is Closed
            </p>
            <p className="text-sm text-gray-500 mt-2">
              MARKET orders are not accepted while the market is closed. LIMIT
              orders are currently unavailable.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Success State ──────────────────────────────────────────────────
  if (result) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Order Placed</h1>

        <Card>
          <Alert variant="success">
            Your {result.type} {result.orderStyle} order has been{" "}
            {result.status === "COMPLETED" ? "filled" : "placed"}.
          </Alert>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Stock</p>
              <p className="font-medium text-gray-900">
                {result.stock.symbol} — {result.stock.companyName}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Status</p>
              <p className="font-medium text-gray-900">{result.status}</p>
            </div>
            <div>
              <p className="text-gray-500">Quantity</p>
              <p className="font-medium text-gray-900">
                {result.filledQuantity} / {result.quantity}
              </p>
            </div>
            {result.price && (
              <div>
                <p className="text-gray-500">Price</p>
                <p className="font-medium text-gray-900">
                  {formatPaise(result.price)}
                </p>
              </div>
            )}
          </div>

          <div className="mt-6">
            <Button onClick={() => setResult(null)} variant="secondary">
              Place Another Order
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Form State ─────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Place Order</h1>

      {error && <Alert variant="error">{error}</Alert>}

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Stock Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Stock
            </label>
            <select
              value={selectedStockId}
              onChange={(e) => setSelectedStockId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              required
            >
              <option value="">Select a stock...</option>
              {stocks.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.symbol} — {s.companyName} ({formatPaise(s.currentPrice)})
                </option>
              ))}
            </select>
          </div>

          {/* Order Type: BUY / SELL */}
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">
              Order Type
            </legend>
            <div className="flex gap-2">
              {(["BUY", "SELL"] as OrderType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOrderType(t)}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium border transition-colors ${
                    orderType === t
                      ? t === "BUY"
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-red-600 text-white border-red-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {t === "BUY" ? "Buy" : "Sell"}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Order Style: MARKET / LIMIT */}
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">
              Order Style
            </legend>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setOrderStyle("MARKET");
                  setPriceRupees("");
                }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium border transition-colors ${
                  orderStyle === "MARKET"
                    ? "bg-primary-700 text-white border-primary-700"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                Market
              </button>
              <button
                type="button"
                disabled
                className="flex-1 py-2 px-4 rounded-md text-sm font-medium border border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed relative"
                title="Limit orders coming in a future update"
              >
                Limit
                <span className="absolute -top-1.5 -right-1.5 bg-gray-400 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                  Soon
                </span>
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Limit orders let you set your own price. Coming in a future
              update.
            </p>
          </fieldset>

          {/* Quantity */}
          <Input
            label="Quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={ORDER_MAX_QUANTITY}
            placeholder="Number of shares"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            error={quantityError}
            required
          />

          {/* Price (LIMIT only) */}
          {isLimit && (
            <Input
              label="Price (Rs.)"
              type="number"
              inputMode="decimal"
              min={ORDER_MIN_PRICE_RUPEES}
              max={ORDER_MAX_PRICE_RUPEES}
              step="0.01"
              placeholder="e.g. 485.00"
              value={priceRupees}
              onChange={(e) => setPriceRupees(e.target.value)}
              error={priceError}
              required
            />
          )}

          {/* Order Summary */}
          {selectedStock && quantityNum > 0 && (
            <div className="bg-gray-50 rounded-md p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Stock</span>
                <span className="font-medium text-gray-900">
                  {selectedStock.symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className="font-medium text-gray-900">
                  {orderType} {orderStyle}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Quantity</span>
                <span className="font-medium text-gray-900">
                  {quantityNum.toLocaleString()}
                </span>
              </div>
              {isLimit && pricePaise ? (
                <div className="flex justify-between">
                  <span className="text-gray-500">Price</span>
                  <span className="font-medium text-gray-900">
                    {formatPaise(pricePaise)}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span className="text-gray-500">Current Price</span>
                  <span className="font-medium text-gray-900">
                    {formatPaise(selectedStock.currentPrice)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-2">
                <span className="text-gray-700 font-medium">
                  {orderType === "BUY"
                    ? "Estimated Cost"
                    : "Estimated Proceeds"}
                </span>
                <span
                  className={`font-bold ${
                    orderType === "BUY" ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {formatPaise(estimatedCost)}
                </span>
              </div>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            variant={orderType === "BUY" ? "primary" : "danger"}
            size="lg"
            disabled={!canSubmit}
            className="w-full"
          >
            {submitting
              ? "Placing Order..."
              : orderType === "BUY"
                ? "Buy Shares"
                : "Sell Shares"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
