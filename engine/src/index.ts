/**
 * Nebula Engine — Entry Point
 *
 * Standalone Node.js process that simulates stock prices using Geometric
 * Brownian Motion, maintains a Redis-backed order book, and matches
 * crossed orders using price-time priority.
 *
 * The engine knows NOTHING about users, wallets, auth, Prisma, or NestJS.
 * It only publishes/subscribes to Redis channels — the NestJS server
 * consumes price/fill events and handles database updates, wallet
 * settlement, and WebSocket broadcasting.
 *
 * Market hours: 24/7 except the daily 12:00 AM – 1:00 AM settlement window.
 * Tick interval: PRICE_UPDATE_INTERVAL_MS from env (default 3000ms).
 *
 * Redis channels:
 *   market:prices   (publish) — price tick for each unhalted stock
 *   orders:filled   (publish) — one message per fill event produced by matching
 *   orders:new      (subscribe) — server publishes new LIMIT orders here
 *   orders:cancel   (subscribe) — server publishes cancellation requests here
 */

import Redis from 'ioredis';
import { createServer, type Server } from 'node:http';
import { z } from 'zod';
import { STOCKS } from './stocks.config';
import { simulateTick } from './price-simulator';
import { isMarketOpen } from './market-hours';
import { addOrder, type Order } from './order-book';
import { matchOrders, cancelOrder } from './matching-engine';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const TICK_INTERVAL = parseInt(
  process.env.PRICE_UPDATE_INTERVAL_MS || '3000',
  10,
);
const HEALTH_PORT = parseInt(process.env.ENGINE_HTTP_PORT || '3003', 10);

// A quick symbol -> config lookup, built once. Also used to validate
// incoming orders reference a real stock before they touch the book.
const STOCKS_BY_SYMBOL = new Map(STOCKS.map((s) => [s.symbol, s]));

// ─── Redis connections ──────────────────────────────────────────────────────
//
// Two separate ioredis connections are required, not a style choice: once a
// connection issues SUBSCRIBE it enters pub/sub mode and the Redis protocol
// no longer permits it to run ordinary commands (GET, HSET, ZADD, PUBLISH,
// ...) on that same connection. `redis` stays a normal command connection
// (used by the order book, matching engine, and for publishing); `subscriber`
// is dedicated to listening on orders:new / orders:cancel.

const redis = new Redis(REDIS_URL);
const subscriber = new Redis(REDIS_URL);

redis.on('connect', () => {
  console.log('[Engine] Connected to Redis (command connection)');
});
redis.on('error', (err) => {
  console.error('[Engine] Redis error (command connection):', err.message);
});

subscriber.on('connect', () => {
  console.log('[Engine] Connected to Redis (subscriber connection)');
});
subscriber.on('error', (err) => {
  console.error('[Engine] Redis error (subscriber connection):', err.message);
});

// ─── Incoming message schemas ───────────────────────────────────────────────
//
// Messages arrive as untrusted JSON strings over Redis pub/sub — validated
// with Zod before anything touches the order book. Malformed messages are
// logged and dropped; they never halt the engine.

const NewOrderMessageSchema = z.object({
  orderId: z.string().min(1),
  userId: z.string().min(1),
  stockSymbol: z.string().min(1),
  type: z.enum(['BUY', 'SELL']),
  price: z.number().int().positive(), // paise
  quantity: z.number().int().positive(),
});

const CancelOrderMessageSchema = z.object({
  orderId: z.string().min(1),
});

/**
 * Parses and validates a raw pub/sub message payload. Logs and returns null
 * on any failure (invalid JSON or schema mismatch) — never throws.
 */
function parseMessage<T>(
  channel: string,
  raw: string,
  schema: z.ZodType<T>,
): T | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    console.error(`[Engine] Ignoring non-JSON message on ${channel}:`, raw);
    return null;
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    console.error(
      `[Engine] Ignoring malformed message on ${channel}:`,
      result.error.flatten(),
    );
    return null;
  }

  return result.data;
}

// ─── orders:new handler ─────────────────────────────────────────────────────

async function handleNewOrder(raw: string): Promise<void> {
  const msg = parseMessage('orders:new', raw, NewOrderMessageSchema);
  if (!msg) return;

  if (!STOCKS_BY_SYMBOL.has(msg.stockSymbol)) {
    console.error(
      `[Engine] Ignoring order ${msg.orderId} for unknown symbol ${msg.stockSymbol}`,
    );
    return;
  }

  const order: Order = {
    id: msg.orderId,
    userId: msg.userId,
    stockSymbol: msg.stockSymbol,
    type: msg.type,
    price: msg.price,
    quantity: msg.quantity,
    filledQuantity: 0,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  await addOrder(redis, order);

  console.log(
    `[Engine] New order: ${order.type} ${order.quantity} ${order.stockSymbol} @ Rs. ${(order.price / 100).toFixed(2)}`,
  );
}

// ─── orders:cancel handler ──────────────────────────────────────────────────

async function handleCancelOrder(raw: string): Promise<void> {
  const msg = parseMessage('orders:cancel', raw, CancelOrderMessageSchema);
  if (!msg) return;

  await cancelOrder(redis, msg.orderId);

  console.log(`[Engine] Order cancelled: ${msg.orderId}`);
}

subscriber.on('message', (channel, message) => {
  if (channel === 'orders:new') {
    handleNewOrder(message).catch((err) => {
      console.error('[Engine] Error handling orders:new message:', err);
    });
  } else if (channel === 'orders:cancel') {
    handleCancelOrder(message).catch((err) => {
      console.error('[Engine] Error handling orders:cancel message:', err);
    });
  }
});

// ─── Health check HTTP server ────────────────────────────────────────────

const healthServer: Server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    uptime: process.uptime(),
    stocks: STOCKS.length,
    timestamp: new Date().toISOString(),
  }));
});

healthServer.listen(HEALTH_PORT, () => {
  console.log(`[Engine] Health endpoint listening on port ${HEALTH_PORT}`);
});

// ─── Main simulation loop ────────────────────────────────────────────────
//
// Runs at the configured tick interval. For each unhalted stock:
//   1. Generate the next GBM price tick and publish it.
//   2. Run order matching against the (possibly newly-crossed) book.
//   3. Publish every resulting fill event.

async function tick(): Promise<void> {
  if (!isMarketOpen()) {
    return;
  }

  for (const stock of STOCKS) {
    if (stock.isHalted) {
      continue;
    }

    const result = simulateTick(stock);
    await redis.publish('market:prices', JSON.stringify(result));

    // Log every ~10th tick per stock to avoid log spam.
    if (Math.random() < 0.1) {
      console.log(
        `[Engine] ${result.symbol}: Rs. ${(result.price / 100).toFixed(2)} ` +
        `(${result.changePercent >= 0 ? '+' : ''}${result.changePercent}%)` +
        `${result.isHalted ? ' [HALTED]' : ''}`,
      );
    }

    const fills = await matchOrders(redis, stock.symbol, result.price);

    for (const fill of fills) {
      await redis.publish('orders:filled', JSON.stringify(fill));
      console.log(
        `[Engine] Fill: ${fill.symbol} ${fill.quantity} @ Rs. ${(fill.price / 100).toFixed(2)}`,
      );
    }
  }
}

// ─── Graceful shutdown ───────────────────────────────────────────────────
//
// A single shutdown routine, registered once per signal, handles everything:
// unsubscribe from both channels, stop the tick loop, close the health
// server, and close both Redis connections. Using one function (instead of
// separate handlers layered on top of each other) avoids the double-listener
// bookkeeping the original file needed to make SIGTERM close the health
// server too.

let shuttingDown = false;
let tickTimer: NodeJS.Timeout | undefined;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[Engine] Received ${signal}, shutting down...`);

  if (tickTimer) {
    clearInterval(tickTimer);
  }

  try {
    await subscriber.unsubscribe('orders:new', 'orders:cancel');
  } catch (err) {
    console.error('[Engine] Error unsubscribing:', err);
  }

  await new Promise<void>((resolve) => {
    healthServer.close(() => resolve());
  });

  await Promise.all([redis.quit(), subscriber.quit()]);

  console.log('[Engine] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch((err) => {
    console.error('[Engine] Error during shutdown:', err);
    process.exit(1);
  });
});

process.on('SIGINT', () => {
  shutdown('SIGINT').catch((err) => {
    console.error('[Engine] Error during shutdown:', err);
    process.exit(1);
  });
});

// ─── Start the engine ────────────────────────────────────────────────────

async function start(): Promise<void> {
  await subscriber.subscribe('orders:new', 'orders:cancel');
  console.log('[Engine] Subscribed to orders:new, orders:cancel');

  console.log(`[Engine] Starting simulation — tick interval: ${TICK_INTERVAL}ms`);
  console.log(`[Engine] Simulating ${STOCKS.length} stocks`);

  tickTimer = setInterval(() => {
    tick().catch((err) => {
      console.error('[Engine] Error during tick:', err);
    });
  }, TICK_INTERVAL);

  // Run first tick immediately.
  await tick();
}

start().catch((err) => {
  console.error('[Engine] Fatal error during startup:', err);
  process.exit(1);
});
