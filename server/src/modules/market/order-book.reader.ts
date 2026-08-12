/**
 * Order Book Reader
 *
 * Read-only server-side view of the engine's Redis-backed order book.
 * Intentionally does NOT import anything from the engine package — the
 * server and engine are independent processes (the engine has zero
 * knowledge of Prisma, NestJS, users, or wallets, and must stay that way).
 *
 * The Redis key/schema convention below is a deliberate duplication of
 * engine/src/order-book.ts, not an accident: Redis is the documented
 * public contract between the two processes (the same way orders:new's
 * message shape is already independently duplicated in both
 * trading.service.ts and engine/src/index.ts). If the engine ever changes
 * this schema, both sides must be updated together — this file is one of
 * the two places that happens.
 *
 * Redis data structures (must match engine/src/order-book.ts exactly):
 *   order:{orderId}            — hash, full order record
 *   orderbook:buy:{symbol}     — sorted set of order IDs, best buy first
 *   orderbook:sell:{symbol}    — sorted set of order IDs, best sell first
 *
 * The sorted-set score already encodes price-time priority (see the
 * engine's scoring scheme), so a plain ZRANGE 0 -1 returns orders in
 * priority order with no secondary sort needed here.
 *
 * This module is read-only: it never writes to the order book. Placing,
 * cancelling, and matching orders all remain the engine's and
 * TradingService's responsibility.
 *
 * All Redis reads are validated through Zod — malformed data is logged
 * and skipped, never allowed to throw or crash the server.
 */

import type { Redis } from 'ioredis';
import { Logger } from '@nestjs/common';
import { z } from 'zod';

const logger = new Logger('OrderBookReader');

// ─── Schema ─────────────────────────────────────────────────────────────────
//
// Mirrors engine/src/order-book.ts's OrderSchema/HashOrderSchema exactly.
// z.coerce is required on the numeric fields because Redis hashes only
// store strings (HSET/HGETALL round-trip everything as text) — the engine
// stringifies numbers on write, and this schema coerces them back on read.

export const OrderSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  stockSymbol: z.string().min(1),
  type: z.enum(['BUY', 'SELL']),
  price: z.coerce.number().int().positive(), // paise
  quantity: z.coerce.number().int().positive(), // shares
  filledQuantity: z.coerce.number().int().nonnegative(), // shares
  status: z.enum(['PENDING', 'PARTIALLY_FILLED', 'COMPLETED', 'CANCELLED']),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export type Order = z.infer<typeof OrderSchema>;

// ─── Internal helpers ───────────────────────────────────────────────────────

function orderKey(orderId: string): string {
  return `order:${orderId}`;
}

function buyBookKey(symbol: string): string {
  return `orderbook:buy:${symbol}`;
}

function sellBookKey(symbol: string): string {
  return `orderbook:sell:${symbol}`;
}

/**
 * Parses a Redis hash (Record<string, string>) back into a validated Order.
 * Returns null and logs on malformed or missing data — never throws. A
 * single corrupt order must never take down an order book read that other
 * orders are perfectly fine to serve.
 */
function parseOrderHash(
  raw: Record<string, string> | null | undefined,
  orderId: string,
): Order | null {
  if (!raw || Object.keys(raw).length === 0) {
    return null;
  }

  const result = OrderSchema.safeParse(raw);
  if (!result.success) {
    logger.error(
      `Malformed order data for ${orderId}: ${JSON.stringify(result.error.flatten())}`,
    );
    return null;
  }

  return result.data;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetches a single order by ID from its Redis hash. Returns null if the
 * order doesn't exist (already filled/cancelled/removed from the book) or
 * is malformed.
 */
export async function getOrder(redis: Redis, orderId: string): Promise<Order | null> {
  const raw = await redis.hgetall(orderKey(orderId));
  return parseOrderHash(raw, orderId);
}

/**
 * Returns the BUY side of a symbol's order book, in price-time priority
 * order (highest price first, earliest at that price first). Malformed or
 * missing individual orders are skipped, not thrown.
 */
export async function readBuyOrders(redis: Redis, symbol: string): Promise<Order[]> {
  const ids = await redis.zrange(buyBookKey(symbol), 0, -1);
  const orders = await Promise.all(ids.map((id) => getOrder(redis, id)));
  return orders.filter((o): o is Order => o !== null);
}

/**
 * Returns the SELL side of a symbol's order book, in price-time priority
 * order (lowest price first, earliest at that price first). Malformed or
 * missing individual orders are skipped, not thrown.
 */
export async function readSellOrders(redis: Redis, symbol: string): Promise<Order[]> {
  const ids = await redis.zrange(sellBookKey(symbol), 0, -1);
  const orders = await Promise.all(ids.map((id) => getOrder(redis, id)));
  return orders.filter((o): o is Order => o !== null);
}

export interface OrderBookSnapshot {
  symbol: string;
  buy: Order[];
  sell: Order[];
}

/**
 * Returns both sides of a symbol's order book, each already in
 * price-time priority order. This is the primary entry point for the
 * order book ladder endpoint (MarketService aggregates these into
 * price-level rows before returning them to the client).
 */
export async function readOrderBook(redis: Redis, symbol: string): Promise<OrderBookSnapshot> {
  const [buy, sell] = await Promise.all([
    readBuyOrders(redis, symbol),
    readSellOrders(redis, symbol),
  ]);

  return { symbol, buy, sell };
}
