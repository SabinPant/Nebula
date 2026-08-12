/**
 * Trade Page
 *
 * Order placement form for BUY/SELL MARKET/LIMIT orders.
 * Fetches stock list and market status on mount.
 * Converts user-facing Rupee price to paise before API submission.
 * Generates UUID v4 idempotency key for safe retries.
 *
 * UX note: the order-action footer (recap + error/success + submit button)
 * is sticky at the bottom of the viewport. This is deliberate — server-side
 * errors (insufficient funds, halted stock, market closed, etc.) are
 * rendered right next to the button the user is about to press again,
 * instead of in a banner at the top of the page that's easy to scroll past.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Alert } from "../../components/ui/Alert";
import { OrderBookLadder, type OrderBook } from "../../components/market/OrderBookLadder";
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
  stock?: { symbol: string; companyName: string };
}

type OrderType = "BUY" | "SELL";
type OrderStyle = "MARKET" | "LIMIT";

// Small inline icons — zero extra dependencies.
function CaretIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`w-2.5 h-2.5 ${direction === "down" ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="M6 2L10.5 9H1.5L6 2Z" fill="currentColor" />
    </svg>
  );
}

export function Trade() {
  // ─── Auth ────────────────────────────────────────────────────────────
  const user = useAuthStore((s) => s.user);

  // ─── Market & Stock Data ────────────────────────────────────────────
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [marketOpen, setMarketOpen] = useState(true);
  const [engineOnline, setEngineOnline] = useState(true);
  const [loadingStocks, setLoadingStocks] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // ─── Form State ─────────────────────────────────────────────────────
  const [selectedStockId, setSelectedStockId] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("BUY");
  const [orderStyle, setOrderStyle] = useState<OrderStyle>("MARKET");
  const [quantity, setQuantity] = useState("");
  const [priceRupees, setPriceRupees] = useState(""); // user-facing rupees
  const [submitting, setSubmitting] = useState(false);

  // Mirrors selectedStockId in a ref so the order book fetch effect can
  // tell a stale response (from a stock the user has since switched away
  // from) apart from the current one — same pattern as Market.tsx's
  // selectedSymbolRef.
  const selectedStockIdRef = useRef(selectedStockId);

  // ─── Order Book (LIMIT only) ─────────────────────────────────────────
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [orderBookLoading, setOrderBookLoading] = useState(true);
  const [orderBookError, setOrderBookError] = useState("");

  // ─── Result State ───────────────────────────────────────────────────
  const [result, setResult] = useState<OrderResponse | null>(null);
  const [error, setError] = useState("");

  // ─── Fetch stocks & market status ───────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const [stocksRes, statusRes, healthRes] = await Promise.all([
          api.get("/market/stocks"),
          api.get("/market/status"),
          api.get("/health"),
        ]);
        setStocks(stocksRes.data);
        setMarketOpen(statusRes.data.isOpen);
        setEngineOnline(healthRes.data.engine === "up");
      } catch {
        setFetchError("Failed to load market data. Please try again.");
      } finally {
        setLoadingStocks(false);
      }
    }
    init();
  }, []);

  // Keep the ref in sync so the order book fetch effect never acts on a
  // stale stock selection.
  useEffect(() => {
    selectedStockIdRef.current = selectedStockId;
  }, [selectedStockId]);

  // ─── Input handlers ──────────────────────────────────────────────────
  // Each one clears any previous server error. Without this, a stale
  // "Insufficient funds" message can sit on screen after the user has
  // already changed the quantity to fix it, making it look like the new
  // values are still failing for the same reason.
  const handleStockChange = (id: string) => {
    setSelectedStockId(id);
    setError("");
  };
  const handleOrderTypeChange = (t: OrderType) => {
    setOrderType(t);
    setError("");
  };
  const handleOrderStyleChange = (s: OrderStyle) => {
    setOrderStyle(s);
    setPriceRupees("");
    setError("");
  };
  const handleQuantityChange = (v: string) => {
    setQuantity(v);
    setError("");
  };
  const handlePriceChange = (v: string) => {
    setPriceRupees(v);
    setError("");
  };

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

  // Plain-language recap shown in the sticky footer, e.g.
  // "BUY MARKET · 10 shares of TCS"
  const recapLine =
    selectedStock && quantityNum > 0
      ? `${orderType} ${orderStyle} · ${quantityNum.toLocaleString()} share${
          quantityNum > 1 ? "s" : ""
        } of ${selectedStock.symbol}${
          isLimit && pricePaise ? ` @ ${formatPaise(pricePaise)}` : ""
        }`
      : "Select a stock and quantity to continue";

  // ─── Order book (LIMIT only) ─────────────────────────────────────────
  // Fetches whenever the selected stock changes AND the user is looking
  // at a LIMIT order (a MARKET order fills instantly at the best available
  // price — there's no book to consult). Polls every 4s while both
  // conditions hold, matching Market.tsx's cadence exactly.
  //
  // Keying the effect on isLimit as well as selectedStockId means
  // switching MARKET -> LIMIT starts it, and switching LIMIT -> MARKET
  // runs this same effect's cleanup (clearing the interval) while the new
  // run's guard clause immediately returns after clearing orderBook — so
  // "stop polling and hide the ladder" falls out of the normal
  // effect-dependency lifecycle rather than needing a separate handler.
  useEffect(() => {
    if (!isLimit || !selectedStockId) {
      setOrderBook(null);
      return;
    }

    const stockId = selectedStockId;

    setOrderBookLoading(true);
    setOrderBookError("");
    setOrderBook(null);

    async function fetchOrderBook() {
      const stock = stocks.find((s) => s.id === stockId);
      if (!stock) return; // stock list not loaded yet or ID stale — nothing to fetch

      try {
        const { data } = await api.get(`/market/stocks/${stock.symbol}/orderbook`);

        if (selectedStockIdRef.current !== stockId) return;

        setOrderBook(data);
      } catch {
        if (selectedStockIdRef.current !== stockId) return;
        setOrderBookError("Failed to load order book.");
      } finally {
        if (selectedStockIdRef.current === stockId) {
          setOrderBookLoading(false);
        }
      }
    }

    fetchOrderBook();
    const intervalId = setInterval(fetchOrderBook, 4000);

    return () => clearInterval(intervalId);
  }, [selectedStockId, isLimit, stocks]);

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
          <div className="text-center py-10">
            <div className="mx-auto w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
            </div>
            <p className="text-lg font-medium text-gray-900">
              Market is closed
            </p>
            <p className="text-sm text-gray-500 mt-1.5 max-w-sm mx-auto">
              MARKET orders aren't accepted while the market is closed. LIMIT
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
        <h1 className="text-2xl font-bold text-gray-900">Order placed</h1>

        <Card>
          <Alert variant="success">
            Your {result.type} {result.orderStyle} order has been{" "}
            {result.status === "COMPLETED" ? "filled" : "placed"}.
          </Alert>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Stock</p>
              <p className="font-medium text-gray-900">
                {result.stock?.symbol ?? selectedStock?.symbol}
                {(result.stock?.companyName ?? selectedStock?.companyName) &&
                  ` — ${result.stock?.companyName ?? selectedStock?.companyName}`}
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
              Place another order
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Form State ─────────────────────────────────────────────────────
  // The whole page (scrollable content + sticky footer) lives inside one
  // <form>. The footer is position:fixed for layout purposes only — it
  // stays in the DOM as a normal descendant of the form, so the
  // type="submit" button inside it still triggers handleSubmit normally.
  return (
    <form onSubmit={handleSubmit} className="pb-28 sm:pb-24">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Place order</h1>
          {engineOnline ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Market open
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              Engine offline
            </span>
          )}
        </div>

        {/* Stock */}
        <Card>
          <label
            htmlFor="trade-stock"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Stock
          </label>
          <select
            id="trade-stock"
            value={selectedStockId}
            onChange={(e) => handleStockChange(e.target.value)}
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

          {selectedStock && (
            <div className="mt-3 flex items-center justify-between text-sm border-t border-gray-100 pt-3">
              <span className="text-gray-500">{selectedStock.sector}</span>
              <span className="font-medium text-gray-900">
                {formatPaise(selectedStock.currentPrice)}
                <span className="text-gray-400 font-normal"> / share</span>
              </span>
            </div>
          )}
        </Card>

        {/* Order Type + Style */}
        <Card>
          <div className="space-y-4">
            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-2">
                Order type
              </legend>
              <div
                role="radiogroup"
                aria-label="Order type"
                className="grid grid-cols-2 gap-2"
              >
                {(["BUY", "SELL"] as OrderType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={orderType === t}
                    onClick={() => handleOrderTypeChange(t)}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-md text-sm font-semibold border transition-colors ${
                      orderType === t
                        ? t === "BUY"
                          ? "bg-green-600 text-white border-green-600"
                          : "bg-red-600 text-white border-red-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <CaretIcon direction={t === "BUY" ? "up" : "down"} />
                    {t === "BUY" ? "Buy" : "Sell"}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-2">
                Order style
              </legend>
              <div
                role="radiogroup"
                aria-label="Order style"
                className="grid grid-cols-2 gap-2"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={orderStyle === "MARKET"}
                  onClick={() => handleOrderStyleChange("MARKET")}
                  className={`py-2.5 px-4 rounded-md text-sm font-medium border transition-colors ${
                    orderStyle === "MARKET"
                      ? "bg-primary-700 text-white border-primary-700"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  Market
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={orderStyle === "LIMIT"}
                  onClick={() => handleOrderStyleChange("LIMIT")}
                  className={`py-2.5 px-4 rounded-md text-sm font-medium border transition-colors ${
                    orderStyle === "LIMIT"
                      ? "bg-primary-700 text-white border-primary-700"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  Limit
                </button>
              </div>
            </fieldset>
          </div>
        </Card>

        {/* Quantity + Price */}
        <Card>
          <div className="space-y-4">
            <Input
              label="Quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={ORDER_MAX_QUANTITY}
              placeholder="Number of shares"
              value={quantity}
              onChange={(e) => handleQuantityChange(e.target.value)}
              error={quantityError}
              required
            />

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
                onChange={(e) => handlePriceChange(e.target.value)}
                error={priceError}
                required
              />
            )}
          </div>
        </Card>

        {/* Order Book — LIMIT only, so the user can set an informed price */}
        {isLimit && (
          <Card title="Order Book">
            <OrderBookLadder
              book={orderBook}
              loading={orderBookLoading}
              error={orderBookError}
            />
          </Card>
        )}
      </div>

      {/* ─── Sticky action footer ──────────────────────────────────────
          Always visible regardless of scroll position. The error/success
          alert lives here — directly above the button the user is about
          to press — instead of at the top of the page where it's easy
          to miss on a second or third attempt. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur-sm shadow-[0_-6px_20px_-8px_rgba(0,0,0,0.10)]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          {error && (
            <div role="alert" aria-live="assertive" className="mb-3">
              <Alert variant="error">{error}</Alert>
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-gray-500 truncate">{recapLine}</p>
              <p
                className={`text-lg font-bold leading-tight ${
                  orderType === "BUY" ? "text-red-600" : "text-green-600"
                }`}
              >
                {selectedStock && quantityNum > 0
                  ? formatPaise(estimatedCost)
                  : "—"}
                <span className="ml-1.5 text-xs font-normal text-gray-400">
                  {orderType === "BUY" ? "est. cost" : "est. proceeds"}
                </span>
              </p>
            </div>

            <Button
              type="submit"
              variant={orderType === "BUY" ? "primary" : "danger"}
              size="lg"
              disabled={!canSubmit}
              className="shrink-0 px-8"
            >
              {submitting
                ? "Placing..."
                : orderType === "BUY"
                  ? "Buy shares"
                  : "Sell shares"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
