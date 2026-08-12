/**
 * Order Book Ladder
 *
 * Two-column depth ladder: BUY (bids) on the left, SELL (asks) on the
 * right, prices facing each other across a center divider — the standard
 * order-book visual convention. Each side is capped to the top
 * ORDER_BOOK_ROWS_SHOWN levels; callers are expected to pass data that's
 * already sorted (buy descending by price, sell ascending by price — the
 * server's GET /market/stocks/:symbol/orderbook endpoint returns levels
 * pre-sorted), so the best price is always the row closest to the divider
 * with no re-sorting needed here.
 *
 * Purely presentational — fetching, polling, and stale-response handling
 * are the caller's responsibility (see Market.tsx and Trade.tsx for the
 * two current call sites, which each fetch/poll independently for
 * whichever stock they have selected).
 */

import { Alert } from "../ui/Alert";
import { formatPaise } from "../../lib/utils";

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

export interface OrderBook {
  symbol: string;
  buy: OrderBookLevel[];
  sell: OrderBookLevel[];
  timestamp: string;
}

const ORDER_BOOK_ROWS_SHOWN = 5;

export interface OrderBookLadderProps {
  book: OrderBook | null;
  loading: boolean;
  error: string;
}

export function OrderBookLadder({ book, loading, error }: OrderBookLadderProps) {
  if (loading && !book) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-6 h-6 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !book) {
    return <Alert variant="error">{error}</Alert>;
  }

  if (!book) return null;

  const buyRows = book.buy.slice(0, ORDER_BOOK_ROWS_SHOWN);
  const sellRows = book.sell.slice(0, ORDER_BOOK_ROWS_SHOWN);

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-4">
      {/* Buy side — quantity then price, right-aligned toward the divider */}
      <div className="min-w-0">
        <div className="flex items-center justify-between text-[11px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide pb-1.5 mb-1.5 border-b border-gray-100">
          <span>Qty</span>
          <span>Bid</span>
        </div>
        {buyRows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No open orders</p>
        ) : (
          <div className="space-y-0.5">
            {buyRows.map((level) => (
              <div
                key={level.price}
                className="flex items-center justify-between gap-2 py-1 px-1.5 rounded hover:bg-green-50/60 transition-colors"
              >
                <span className="text-xs sm:text-sm font-medium text-green-600 truncate">
                  {level.quantity.toLocaleString("en-IN")}
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-xs sm:text-sm font-semibold text-green-700">
                    {formatPaise(level.price)}
                  </span>
                  <span className="block text-[10px] text-gray-400 leading-tight">
                    {level.orderCount} order{level.orderCount === 1 ? "" : "s"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sell side — price then quantity, left-aligned toward the divider */}
      <div className="min-w-0 border-l border-gray-100 pl-2 sm:pl-4">
        <div className="flex items-center justify-between text-[11px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide pb-1.5 mb-1.5 border-b border-gray-100">
          <span>Ask</span>
          <span>Qty</span>
        </div>
        {sellRows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No open orders</p>
        ) : (
          <div className="space-y-0.5">
            {sellRows.map((level) => (
              <div
                key={level.price}
                className="flex items-center justify-between gap-2 py-1 px-1.5 rounded hover:bg-red-50/60 transition-colors"
              >
                <span className="shrink-0">
                  <span className="block text-xs sm:text-sm font-semibold text-red-600">
                    {formatPaise(level.price)}
                  </span>
                  <span className="block text-[10px] text-gray-400 leading-tight">
                    {level.orderCount} order{level.orderCount === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="text-xs sm:text-sm font-medium text-red-500 truncate text-right">
                  {level.quantity.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
