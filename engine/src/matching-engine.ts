/**
 * Matching Engine
 *
 * Core order matching logic. Runs once per stock, after each price tick,
 * to check whether resting orders on the book can now cross.
 *
 * The engine knows NOTHING about users, wallets, auth, Prisma, or NestJS —
 * matching only touches the order book (Redis) and returns fill events.
 * The NestJS server consumes those fill events to settle wallets/holdings.
 *
 * Order quantity convention (set by order-book.ts / the server):
 *   `quantity`       — REMAINING (unfilled) quantity, decremented on each fill
 *   `filledQuantity` — cumulative quantity filled so far
 * This mirrors how updateOrderQuantity is called: (newQuantity, newFilled).
 *
 * Matching rule (price-time priority book, crossed-price check):
 *   bestBuy.price >= bestSell.price  →  orders cross, a trade can occur
 *   Fill price = the resting SELL order's limit price (spec requirement —
 *   the earlier-resting sell order sets the price the buyer pays).
 */

import type { Redis } from 'ioredis';
import { z } from 'zod';
import { getOrder, removeOrder, updateOrderQuantity, type Order } from './order-book';

// ─── Schema ─────────────────────────────────────────────────────────────────

export const FillEventSchema = z.object({
  buyOrderId: z.string().min(1),
  sellOrderId: z.string().min(1),
  symbol: z.string().min(1),
  price: z.number().int().positive(), // paise — the sell order's limit price
  quantity: z.number().int().positive(), // shares filled
  timestamp: z.string().min(1), // ISO
});

export type FillEvent = z.infer<typeof FillEventSchema>;

// Safety bound on self-trade skip-and-retry — prevents any pathological
// same-user book (e.g. a bug flooding one user's orders) from looping forever.
const MAX_MATCH_ITERATIONS = 1000;

/**
 * Returns true if an order is in a matchable state.
 * COMPLETED/CANCELLED orders should never be indexed in the book, but this
 * is checked defensively — matching must never fill dead orders.
 */
function isMatchable(order: Order): boolean {
  return order.status === 'PENDING' || order.status === 'PARTIALLY_FILLED';
}

/**
 * Applies a fill to one side of a matched pair: decrements remaining
 * quantity, increments filledQuantity, and either removes the order from
 * the book (fully filled) or updates it in place (partial fill).
 */
async function applyFill(redis: Redis, order: Order, fillQuantity: number): Promise<void> {
  const newFilled = order.filledQuantity + fillQuantity;
  const newRemaining = order.quantity - fillQuantity;

  if (newRemaining <= 0) {
    // Fully filled — remove from the book entirely. There is no valid
    // intermediate state to persist: OrderSchema requires quantity > 0,
    // and the order is being deleted immediately anyway, so writing
    // quantity: 0 first would only fail its own re-validation inside
    // removeOrder's getOrder call. Delete directly instead.
    await removeOrder(redis, order.id);
  } else {
    // Partial fill — stays in the book, keeps its price-time priority slot.
    await updateOrderQuantity(redis, order.id, newRemaining, newFilled);
    await redis.hset(`order:${order.id}`, { status: 'PARTIALLY_FILLED' });
  }
}

/**
 * Looks up the best BUY/SELL orders for a symbol, skipping past any
 * leading same-user collision so the returned pair (if any) is always a
 * legally matchable, different-user pair — or as close to the book's true
 * best as self-trade prevention allows.
 *
 * Depth is bounded (BOOK_PEEK_DEPTH) rather than unbounded ZRANGE 0 -1,
 * since a single user flooding one side of the book should not force a
 * full-book scan on every tick.
 */
const BOOK_PEEK_DEPTH = 25;

async function findMatchablePair(
  redis: Redis,
  symbol: string,
): Promise<{ buy: Order; sell: Order } | null> {
  const [buyIds, sellIds] = await Promise.all([
    redis.zrange(`orderbook:buy:${symbol}`, 0, BOOK_PEEK_DEPTH - 1),
    redis.zrange(`orderbook:sell:${symbol}`, 0, BOOK_PEEK_DEPTH - 1),
  ]);

  if (buyIds.length === 0 || sellIds.length === 0) {
    return null;
  }

  const [buyOrders, sellOrders] = await Promise.all([
    Promise.all(buyIds.map((id) => getOrder(redis, id))),
    Promise.all(sellIds.map((id) => getOrder(redis, id))),
  ]);

  // Defensive cleanup: drop any order that shouldn't be in the book at all
  // (malformed, or a status that should never appear here).
  for (let i = 0; i < buyOrders.length; i++) {
    const order = buyOrders[i];
    if (order && !isMatchable(order)) {
      console.error(
        `[MatchingEngine] BUY ${order.id} has non-matchable status ${order.status} — removing from book`,
      );
      await removeOrder(redis, order.id);
      buyOrders[i] = null;
    }
  }
  for (let i = 0; i < sellOrders.length; i++) {
    const order = sellOrders[i];
    if (order && !isMatchable(order)) {
      console.error(
        `[MatchingEngine] SELL ${order.id} has non-matchable status ${order.status} — removing from book`,
      );
      await removeOrder(redis, order.id);
      sellOrders[i] = null;
    }
  }

  // Walk buy side (already price-time priority ordered) and, for each,
  // walk the sell side in priority order looking for the first different-user
  // order that still crosses. This preserves priority as closely as possible:
  // the true best buy is tried first, against the true best sell first.
  for (const buy of buyOrders) {
    if (!buy) continue;
    for (const sell of sellOrders) {
      if (!sell) continue;
      if (buy.price < sell.price) break; // sells are price-ascending — no further sell can cross either
      if (buy.userId === sell.userId) continue; // self-trade — try next sell
      return { buy, sell };
    }
  }

  return null;
}

/**
 * Matches resting orders for a single symbol after a price tick.
 *
 * Repeatedly finds the best matchable (non-self-trading) BUY/SELL pair,
 * fills them against each other, and returns every fill event produced.
 * Stops when no crossed, different-user pair remains within peek depth.
 *
 * `currentPrice` is accepted per the Sprint 9 contract (matching runs once
 * per stock per tick, after the new price is known) but resting-order
 * matching is driven entirely by the book's own crossed prices — the fill
 * price is always the resting SELL order's limit price, never currentPrice.
 */
export async function matchOrders(
  redis: Redis,
  symbol: string,
  currentPrice: number,
): Promise<FillEvent[]> {
  void currentPrice; // reserved for future use (e.g. market-order sweep at currentPrice)

  const fills: FillEvent[] = [];
  let iterations = 0;

  while (iterations < MAX_MATCH_ITERATIONS) {
    iterations++;

    const pair = await findMatchablePair(redis, symbol);
    if (!pair) {
      break; // no crossed, non-self-trading pair left — done for this tick
    }

    const { buy, sell } = pair;
    const fillQuantity = Math.min(buy.quantity, sell.quantity);
    const fillPrice = sell.price; // resting SELL order's limit price

    await Promise.all([applyFill(redis, buy, fillQuantity), applyFill(redis, sell, fillQuantity)]);

    const fillEvent: FillEvent = {
      buyOrderId: buy.id,
      sellOrderId: sell.id,
      symbol,
      price: fillPrice,
      quantity: fillQuantity,
      timestamp: new Date().toISOString(),
    };
    fills.push(fillEvent);

    console.log(
      `[MatchingEngine] Fill: ${symbol} ${fillQuantity} @ Rs. ${(fillPrice / 100).toFixed(2)} ` +
      `(buy ${buy.id.slice(0, 8)} vs sell ${sell.id.slice(0, 8)})`,
    );

    // Loop again — either or both sides may still have remaining quantity,
    // or a new best order is now exposed on one/both sides.
  }

  if (iterations >= MAX_MATCH_ITERATIONS) {
    console.error(
      `[MatchingEngine] Hit max match iterations (${MAX_MATCH_ITERATIONS}) for ${symbol} — aborting this tick's matching to avoid an infinite loop`,
    );
  }

  return fills;
}

/**
 * Cancels an order: called when the server cancels an order on behalf of
 * a trader or admin action.
 *
 * If the order is PENDING or PARTIALLY_FILLED, marks it CANCELLED and
 * removes it from the book. Orders already COMPLETED or CANCELLED are
 * left untouched (no-op) — cancelling a finished order is not an error,
 * just has no effect.
 */
export async function cancelOrder(redis: Redis, orderId: string): Promise<void> {
  const order = await getOrder(redis, orderId);

  if (!order) {
    console.log(`[MatchingEngine] cancelOrder: order ${orderId} not found — nothing to do`);
    return;
  }

  if (!isMatchable(order)) {
    console.log(
      `[MatchingEngine] cancelOrder: order ${orderId} already ${order.status} — no-op`,
    );
    return;
  }

  await redis.hset(`order:${orderId}`, { status: 'CANCELLED' });
  await removeOrder(redis, orderId);

  console.log(`[MatchingEngine] Cancelled order ${orderId} (${order.stockSymbol})`);
}
