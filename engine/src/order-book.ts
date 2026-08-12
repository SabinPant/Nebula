/**
 * Order Book
 *
 * Redis-backed order book with price-time priority matching support.
 * The engine knows NOTHING about users, wallets, auth, Prisma, or NestJS —
 * orders are opaque records identified by userId/stockSymbol strings only.
 *
 * Redis data structures:
 *   order:{orderId}            — hash, full order record (JSON-encoded fields via Zod)
 *   orderbook:buy:{symbol}     — sorted set of order IDs, price-time priority (best buy first)
 *   orderbook:sell:{symbol}    — sorted set of order IDs, price-time priority (best sell first)
 *
 * Score encoding (price-time priority in a single ZSET score):
 *   Buy side  — score = -price * 1e13 + createdAtMs
 *               Highest price sorts first (most negative score); equal prices
 *               resolve by earliest createdAt (smaller createdAtMs sorts first).
 *   Sell side — score =  price * 1e13 + createdAtMs
 *               Lowest price sorts first; equal prices resolve by earliest createdAt.
 *
 * createdAtMs (epoch milliseconds) fits well under 1e13, so it never overflows
 * into the price component. This lets ZRANGE 0 0 return the correct best order
 * for either side without a secondary sort step.
 *
 * All Redis reads are validated through Zod — malformed data is rejected and
 * logged, never allowed to halt the engine process.
 */

import type { Redis } from 'ioredis';
import { z } from 'zod';

// ─── Schema ─────────────────────────────────────────────────────────────────

export const OrderSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  stockSymbol: z.string().min(1),
  type: z.enum(['BUY', 'SELL']),
  price: z.number().int().positive(), // paise
  quantity: z.number().int().positive(),
  filledQuantity: z.number().int().nonnegative(),
  status: z.enum(['PENDING', 'PARTIALLY_FILLED', 'COMPLETED', 'CANCELLED']),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export type Order = z.infer<typeof OrderSchema>;

// ─── Internal helpers ───────────────────────────────────────────────────────

const PRICE_SCALE = 1e13;

function orderKey(orderId: string): string {
  return `order:${orderId}`;
}

function buyBookKey(symbol: string): string {
  return `orderbook:buy:${symbol}`;
}

function sellBookKey(symbol: string): string {
  return `orderbook:sell:${symbol}`;
}

function bookKey(symbol: string, type: Order['type']): string {
  return type === 'BUY' ? buyBookKey(symbol) : sellBookKey(symbol);
}

function computeScore(order: Pick<Order, 'type' | 'price' | 'createdAt'>): number {
  const createdAtMs = new Date(order.createdAt).getTime();
  return order.type === 'BUY'
    ? -order.price * PRICE_SCALE + createdAtMs
    : order.price * PRICE_SCALE + createdAtMs;
}

/**
 * Serializes an order into a flat string-value record for HSET.
 * Redis hashes only store strings — numbers and booleans are stringified
 * and parsed back on read via the Zod schema (which coerces from string).
 */
function toHashFields(order: Order): Record<string, string> {
  return {
    id: order.id,
    userId: order.userId,
    stockSymbol: order.stockSymbol,
    type: order.type,
    price: String(order.price),
    quantity: String(order.quantity),
    filledQuantity: String(order.filledQuantity),
    status: order.status,
    createdAt: order.createdAt,
  };
}

const HashOrderSchema = OrderSchema.extend({
  price: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive(),
  filledQuantity: z.coerce.number().int().nonnegative(),
});

/**
 * Parses a Redis hash (Record<string, string>) back into a validated Order.
 * Returns null and logs on malformed data — never throws.
 */
function parseHash(raw: Record<string, string> | null | undefined, orderId: string): Order | null {
  if (!raw || Object.keys(raw).length === 0) {
    return null;
  }

  const result = HashOrderSchema.safeParse(raw);
  if (!result.success) {
    console.error(
      `[OrderBook] Malformed order data for ${orderId}:`,
      result.error.flatten(),
    );
    return null;
  }

  return result.data;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Adds an order to the book: stores the order hash and indexes it into the
 * appropriate side's sorted set (price-time priority score).
 */
export async function addOrder(redis: Redis, order: Order): Promise<void> {
  const parsed = OrderSchema.parse(order); // throws on caller bug — fail loud at the boundary
  const score = computeScore(parsed);

  const pipeline = redis.pipeline();
  pipeline.hset(orderKey(parsed.id), toHashFields(parsed));
  pipeline.zadd(bookKey(parsed.stockSymbol, parsed.type), score, parsed.id);
  await pipeline.exec();
}

/**
 * Removes an order from the book entirely: deletes the hash and removes
 * its ID from the sorted set. Safe to call even if the order is already gone.
 */
export async function removeOrder(redis: Redis, orderId: string): Promise<void> {
  const order = await getOrder(redis, orderId);
  if (!order) {
    return;
  }

  const pipeline = redis.pipeline();
  pipeline.del(orderKey(orderId));
  pipeline.zrem(bookKey(order.stockSymbol, order.type), orderId);
  await pipeline.exec();
}

/**
 * Fetches a single order by ID. Returns null if it doesn't exist or is malformed.
 */
export async function getOrder(redis: Redis, orderId: string): Promise<Order | null> {
  const raw = await redis.hgetall(orderKey(orderId));
  return parseHash(raw, orderId);
}

/**
 * Returns the highest-priority BUY order (highest price, earliest at that price)
 * for a symbol, or null if the buy side is empty.
 */
export async function getBestBuy(redis: Redis, symbol: string): Promise<Order | null> {
  const ids = await redis.zrange(buyBookKey(symbol), 0, 0);
  if (ids.length === 0) {
    return null;
  }
  return getOrder(redis, ids[0]);
}

/**
 * Returns the highest-priority SELL order (lowest price, earliest at that price)
 * for a symbol, or null if the sell side is empty.
 */
export async function getBestSell(redis: Redis, symbol: string): Promise<Order | null> {
  const ids = await redis.zrange(sellBookKey(symbol), 0, 0);
  if (ids.length === 0) {
    return null;
  }
  return getOrder(redis, ids[0]);
}

export interface OrderBookSnapshot {
  symbol: string;
  buy: Order[];
  sell: Order[];
}

/**
 * Returns the full order book (both sides, in priority order) for a symbol.
 * Intended for debugging and admin visibility — not for hot-path matching.
 */
export async function getOrderBook(redis: Redis, symbol: string): Promise<OrderBookSnapshot> {
  const [buyIds, sellIds] = await Promise.all([
    redis.zrange(buyBookKey(symbol), 0, -1),
    redis.zrange(sellBookKey(symbol), 0, -1),
  ]);

  const [buy, sell] = await Promise.all([
    Promise.all(buyIds.map((id) => getOrder(redis, id))),
    Promise.all(sellIds.map((id) => getOrder(redis, id))),
  ]);

  return {
    symbol,
    buy: buy.filter((o): o is Order => o !== null),
    sell: sell.filter((o): o is Order => o !== null),
  };
}

/**
 * Updates an order's quantity and filledQuantity after a partial fill.
 * The sorted-set score is unchanged — price-time priority for a partially
 * filled order is preserved (it keeps its original place in the queue).
 */
export async function updateOrderQuantity(
  redis: Redis,
  orderId: string,
  newQuantity: number,
  newFilled: number,
): Promise<void> {
  await redis.hset(orderKey(orderId), {
    quantity: String(newQuantity),
    filledQuantity: String(newFilled),
  });
}
