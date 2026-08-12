/**
 * Quick test for MarketService.getOrderBook (price-level aggregation).
 *
 * Not a Jest suite — constructs the REAL MarketService with its REAL
 * dependencies (MarketRepository backed by a real PrismaClient, and a
 * real ioredis connection wrapped in a minimal RedisClient-shaped stub —
 * PrismaService/RedisClient are plain classes with trivial constructors,
 * so no NestJS TestingModule bootstrap is needed for this). Only the
 * order book data itself is "mocked," in the sense that this script
 * writes it directly into Redis rather than running the real engine —
 * same approach as test-order-book-reader.ts, and for the same reason:
 * the thing under test (aggregation) doesn't care how the raw per-order
 * records got into Redis, only that they're in the documented shape.
 *
 * getOrderBook() requires the symbol to resolve to a real Stock row (via
 * findStockBySymbol), so the aggregation cases below seed mock orders
 * directly under the real seeded NABIL symbol rather than a synthetic
 * one — safe because NABIL's book is read (and confirmed empty) before
 * seeding, and every seeded order/key is deleted in the finally block
 * regardless of pass/fail, so no test data survives against the real
 * symbol either during or after the run.
 *
 * Run with: npx tsx scripts/test-order-book-service.ts (from server/)
 * Requires Postgres + Redis reachable per .env.development, and NABIL
 * seeded (npx prisma db seed).
 */

import { PrismaClient } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { MarketService } from '../src/modules/market/market.service';
import { MarketRepository } from '../src/modules/market/market.repository';
import type { RedisClient } from '../src/core/database/redis.client';

loadEnv({ path: path.resolve(__dirname, '..', '.env.development') });

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SYMBOL = 'NABIL';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${message}`);
  } else {
    failed++;
    console.error(`  \x1b[31m✗\x1b[0m ${message}`);
  }
}

// ─── Mock order book writer ──────────────────────────────────────────────
//
// Same deliberate reimplementation as test-order-book-reader.ts — writes
// directly to Redis in the documented key/score shape, independent of
// both the engine's and the reader's own code, so this test genuinely
// exercises "aggregation over data found in Redis," not a round-trip
// through code paths that could hide a shared bug.

const PRICE_SCALE = 1e13;

function orderKey(id: string): string {
  return `order:${id}`;
}
function buyBookKey(symbol: string): string {
  return `orderbook:buy:${symbol}`;
}
function sellBookKey(symbol: string): string {
  return `orderbook:sell:${symbol}`;
}
function computeScore(type: 'BUY' | 'SELL', price: number, createdAtMs: number): number {
  return type === 'BUY' ? -price * PRICE_SCALE + createdAtMs : price * PRICE_SCALE + createdAtMs;
}

interface MockOrder {
  id: string;
  userId: string;
  stockSymbol: string;
  type: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  filledQuantity: number;
  status: 'PENDING' | 'PARTIALLY_FILLED';
  createdAt: string;
}

async function writeMockOrder(redis: Redis, order: MockOrder): Promise<void> {
  const createdAtMs = new Date(order.createdAt).getTime();
  const score = computeScore(order.type, order.price, createdAtMs);
  const bookKey = order.type === 'BUY' ? buyBookKey(order.stockSymbol) : sellBookKey(order.stockSymbol);

  const pipeline = redis.pipeline();
  pipeline.hset(orderKey(order.id), {
    id: order.id,
    userId: order.userId,
    stockSymbol: order.stockSymbol,
    type: order.type,
    price: String(order.price),
    quantity: String(order.quantity),
    filledQuantity: String(order.filledQuantity),
    status: order.status,
    createdAt: order.createdAt,
  });
  pipeline.zadd(bookKey, score, order.id);
  await pipeline.exec();
}

function makeMockOrder(overrides: Partial<MockOrder>): MockOrder {
  return {
    id: randomUUID(),
    userId: `test-user-${randomUUID().slice(0, 6)}`,
    stockSymbol: SYMBOL,
    type: 'BUY',
    price: 48500,
    quantity: 10,
    filledQuantity: 0,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Minimal RedisClient stand-in — MarketService only ever calls .getClient(). */
function makeRedisClientStub(redis: Redis): RedisClient {
  return { getClient: () => redis } as unknown as RedisClient;
}

async function main(): Promise<void> {
  const redis = new Redis(REDIS_URL);
  const prisma = new PrismaClient();
  const createdOrderIds: string[] = [];

  try {
    await redis.ping();
    console.log(`Connected to Redis at ${REDIS_URL}`);

    const nabil = await prisma.stock.findUnique({ where: { symbol: SYMBOL } });
    if (!nabil) {
      throw new Error(`Stock ${SYMBOL} not found — run "npx prisma db seed" in server/ before this test`);
    }
    console.log(`Found real ${SYMBOL} stock row for symbol validation\n`);

    const marketRepository = new MarketRepository(prisma as any);
    const marketService = new MarketService(marketRepository, makeRedisClientStub(redis));

    // Guard: refuse to run against a symbol that already has a live order
    // book — this test seeds and then fully deletes mock data under
    // SYMBOL, which would be destructive to real resting orders if any
    // existed. In dev, an idle NABIL book is the expected state.
    const preExisting = await redis.zcard(buyBookKey(SYMBOL));
    const preExistingSell = await redis.zcard(sellBookKey(SYMBOL));
    if (preExisting > 0 || preExistingSell > 0) {
      throw new Error(
        `Refusing to run: ${SYMBOL}'s order book is not empty (buy=${preExisting}, sell=${preExistingSell}). ` +
        `This test seeds mock orders under the real symbol and deletes them afterward — ` +
        `run it against an idle dev environment only.`,
      );
    }

    // ── Step 1: symbol validation — nonexistent stock ───────────────────
    console.log('Step 1: Symbol validation for a stock that does not exist');
    let threw = false;
    let thrownError: unknown;
    try {
      await marketService.getOrderBook('DOES_NOT_EXIST_XYZ');
    } catch (err) {
      threw = true;
      thrownError = err;
    }
    assert(threw, 'getOrderBook throws for an unknown symbol');
    assert(thrownError instanceof NotFoundException, 'the thrown error is a NotFoundException');

    // ── Step 2: empty book for a real, valid symbol ──────────────────────
    console.log('\nStep 2: Valid symbol with no resting orders (empty book)');
    const emptyResult = await marketService.getOrderBook(SYMBOL);
    assert(emptyResult.symbol === SYMBOL, 'symbol echoed back uppercased');
    assert(Array.isArray(emptyResult.buy) && emptyResult.buy.length === 0, 'empty buy array, not null/undefined');
    assert(Array.isArray(emptyResult.sell) && emptyResult.sell.length === 0, 'empty sell array, not null/undefined');
    assert(typeof emptyResult.timestamp === 'string', 'timestamp is present and is a string');
    assert(!Number.isNaN(new Date(emptyResult.timestamp).getTime()), 'timestamp parses as a valid date');

    // ── Step 3: symbol lookup is case-insensitive ────────────────────────
    console.log('\nStep 3: Symbol lookup is case-insensitive');
    const lowercaseResult = await marketService.getOrderBook('nabil');
    assert(lowercaseResult.symbol === SYMBOL, 'lowercase input symbol is normalized to uppercase in the response');

    // ── Step 4: seed a book with multiple orders per price level ─────────
    console.log('\nStep 4: Seeding a book with multiple orders at shared price levels');

    // Buy side: 48500 has 3 orders (one partially filled), 48450 has 1.
    const buy485a = makeMockOrder({ type: 'BUY', price: 48500, quantity: 200 });
    const buy485b = makeMockOrder({ type: 'BUY', price: 48500, quantity: 150 });
    const buy485c = makeMockOrder({
      type: 'BUY',
      price: 48500,
      quantity: 150, // remaining
      filledQuantity: 50, // already filled — original size was 200
      status: 'PARTIALLY_FILLED',
    });
    const buy484 = makeMockOrder({ type: 'BUY', price: 48450, quantity: 200 });

    // Sell side: 48550 has 2 orders, 48600 has 1.
    const sell4855a = makeMockOrder({ type: 'SELL', price: 48550, quantity: 100 });
    const sell4855b = makeMockOrder({ type: 'SELL', price: 48550, quantity: 50 });
    const sell486 = makeMockOrder({ type: 'SELL', price: 48600, quantity: 400 });

    const allOrders = [buy485a, buy485b, buy485c, buy484, sell4855a, sell4855b, sell486];
    for (const order of allOrders) {
      await writeMockOrder(redis, order);
      createdOrderIds.push(order.id);
    }
    console.log(`  Seeded ${allOrders.length} orders across 4 price levels for ${SYMBOL}\n`);

    // ── Step 5: verify aggregation — sums and order counts ───────────────
    console.log('Step 5: Verifying aggregation (sums, order counts)');
    const result = await marketService.getOrderBook(SYMBOL);

    assert(result.buy.length === 2, `2 distinct buy price levels (got ${result.buy.length})`);
    assert(result.sell.length === 2, `2 distinct sell price levels (got ${result.sell.length})`);

    const level48500 = result.buy.find((l) => l.price === 48500);
    assert(level48500 !== undefined, 'price level 48500 exists on the buy side');
    assert(
      level48500?.quantity === 500,
      `48500 sums to 500 (200 + 150 + 150 remaining, NOT the partial order's original 200) — got ${level48500?.quantity}`,
    );
    assert(level48500?.orderCount === 3, `48500 has orderCount 3 (got ${level48500?.orderCount})`);

    const level48450 = result.buy.find((l) => l.price === 48450);
    assert(level48450?.quantity === 200, `48450 sums to 200 (got ${level48450?.quantity})`);
    assert(level48450?.orderCount === 1, `48450 has orderCount 1 (got ${level48450?.orderCount})`);

    const sellLevel48550 = result.sell.find((l) => l.price === 48550);
    assert(sellLevel48550?.quantity === 150, `48550 sums to 150 (100 + 50) (got ${sellLevel48550?.quantity})`);
    assert(sellLevel48550?.orderCount === 2, `48550 has orderCount 2 (got ${sellLevel48550?.orderCount})`);

    const sellLevel48600 = result.sell.find((l) => l.price === 48600);
    assert(sellLevel48600?.quantity === 400, `48600 sums to 400 (got ${sellLevel48600?.quantity})`);
    assert(sellLevel48600?.orderCount === 1, `48600 has orderCount 1 (got ${sellLevel48600?.orderCount})`);

    // ── Step 6: verify sort direction ─────────────────────────────────────
    console.log('\nStep 6: Verifying sort direction');
    assert(
      result.buy[0].price === 48500 && result.buy[1].price === 48450,
      'buy side sorted price DESCENDING (48500 before 48450)',
    );
    assert(
      result.sell[0].price === 48550 && result.sell[1].price === 48600,
      'sell side sorted price ASCENDING (48550 before 48600)',
    );

    // ── Step 7: response shape sanity ─────────────────────────────────────
    console.log('\nStep 7: Response shape');
    for (const level of [...result.buy, ...result.sell]) {
      assert(
        typeof level.price === 'number' && typeof level.quantity === 'number' && typeof level.orderCount === 'number',
        `level { price: ${level.price}, quantity: ${level.quantity}, orderCount: ${level.orderCount} } has all-numeric fields`,
      );
    }
    assert(
      Object.keys(result).sort().join(',') === 'buy,sell,symbol,timestamp',
      `top-level response has exactly the expected keys (got ${Object.keys(result).sort().join(',')})`,
    );

    // ── Results ───────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(50));
  } finally {
    console.log('\nCleaning up test data');
    for (const id of createdOrderIds) {
      await redis.del(orderKey(id));
    }
    await redis.del(buyBookKey(SYMBOL), sellBookKey(SYMBOL));
    console.log(`  Removed ${createdOrderIds.length} order hashes and both book sorted sets`);

    await redis.quit();
    await prisma.$disconnect();
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nTest script crashed:', err);
  process.exitCode = 1;
});
