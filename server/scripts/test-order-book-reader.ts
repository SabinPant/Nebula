/**
 * Quick test for order-book.reader.ts.
 *
 * Not a Jest suite — a standalone script that writes mock order hashes and
 * sorted-set entries directly into a real local Redis (using the exact
 * same key/score convention engine/src/order-book.ts uses when it writes),
 * then reads them back through the reader to verify priority ordering,
 * Zod validation, and malformed-data handling.
 *
 * This does NOT spin up the real engine — the reader's whole point is
 * that it doesn't need to. It only needs Redis to already contain data in
 * the documented shape, however it got there.
 *
 * Run with: npx tsx scripts/test-order-book-reader.ts (from server/)
 * Requires Redis reachable per .env.development.
 */

import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import {
  getOrder,
  readBuyOrders,
  readSellOrders,
  readOrderBook,
  type Order,
} from '../src/modules/market/order-book.reader';

loadEnv({ path: path.resolve(__dirname, '..', '.env.development') });

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

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

// ─── Mock order book writer ─────────────────────────────────────────────
//
// Deliberately reimplements the engine's write-side key/score convention
// here rather than importing engine/src/order-book.ts — the reader under
// test must never depend on the engine package, and this test should
// exercise that same boundary: it proves the reader works against "Redis
// in the documented shape," not "Redis written by the engine's own code."

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
  status: 'PENDING' | 'PARTIALLY_FILLED' | 'COMPLETED' | 'CANCELLED';
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
    userId: 'test-user-1',
    stockSymbol: 'NABIL_TEST',
    type: 'BUY',
    price: 48500,
    quantity: 10,
    filledQuantity: 0,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function main(): Promise<void> {
  const redis = new Redis(REDIS_URL);
  const SYMBOL = `NABIL_TEST_${randomUUID().slice(0, 8)}`; // isolate from any real book
  const createdOrderIds: string[] = [];

  try {
    await redis.ping();
    console.log(`Connected to Redis at ${REDIS_URL}\n`);

    // ── Step 1: seed a realistic mixed book ─────────────────────────────
    console.log('Step 1: Seeding mock orders directly into Redis');

    const buyHigh = makeMockOrder({
      stockSymbol: SYMBOL,
      type: 'BUY',
      price: 49000,
      quantity: 5,
      createdAt: new Date(Date.now() - 3000).toISOString(),
    });
    const buyLowEarlier = makeMockOrder({
      stockSymbol: SYMBOL,
      type: 'BUY',
      price: 48500,
      quantity: 10,
      createdAt: new Date(Date.now() - 2000).toISOString(),
    });
    const buyLowLater = makeMockOrder({
      stockSymbol: SYMBOL,
      type: 'BUY',
      price: 48500, // same price as buyLowEarlier — time priority decides order
      quantity: 7,
      createdAt: new Date(Date.now() - 1000).toISOString(),
    });
    const sellLow = makeMockOrder({
      stockSymbol: SYMBOL,
      type: 'SELL',
      price: 49200,
      quantity: 8,
      createdAt: new Date(Date.now() - 1500).toISOString(),
    });
    const sellHigh = makeMockOrder({
      stockSymbol: SYMBOL,
      type: 'SELL',
      price: 49500,
      quantity: 3,
      createdAt: new Date().toISOString(),
    });
    const partiallyFilled = makeMockOrder({
      stockSymbol: SYMBOL,
      type: 'SELL',
      price: 49300,
      quantity: 4, // remaining
      filledQuantity: 6, // already partially filled
      status: 'PARTIALLY_FILLED',
      createdAt: new Date().toISOString(),
    });

    for (const order of [buyHigh, buyLowEarlier, buyLowLater, sellLow, sellHigh, partiallyFilled]) {
      await writeMockOrder(redis, order);
      createdOrderIds.push(order.id);
    }
    console.log(`  Seeded ${createdOrderIds.length} orders for symbol ${SYMBOL}\n`);

    // ── Step 2: getOrder round-trips a single order correctly ──────────
    console.log('Step 2: getOrder — single order round-trip');
    const fetched = await getOrder(redis, buyHigh.id);
    assert(fetched !== null, 'getOrder returns the seeded order');
    assert(fetched?.price === 49000, 'price round-trips as a number (not a string)');
    assert(typeof fetched?.price === 'number', 'price type is number after Zod coercion');
    assert(fetched?.quantity === 5, 'quantity round-trips correctly');
    assert(fetched?.status === 'PENDING', 'status round-trips correctly');

    const missing = await getOrder(redis, randomUUID());
    assert(missing === null, 'getOrder returns null for a nonexistent order ID');

    // ── Step 3: readBuyOrders — price-time priority ─────────────────────
    console.log('\nStep 3: readBuyOrders — price-time priority order');
    const buys = await readBuyOrders(redis, SYMBOL);
    assert(buys.length === 3, `readBuyOrders returns all 3 buy orders (got ${buys.length})`);
    assert(buys[0].id === buyHigh.id, 'highest price (49000) is first');
    assert(buys[1].id === buyLowEarlier.id, 'equal-price tie broken by earlier createdAt (second)');
    assert(buys[2].id === buyLowLater.id, 'equal-price tie broken by earlier createdAt (later order last)');

    // ── Step 4: readSellOrders — price-time priority ────────────────────
    console.log('\nStep 4: readSellOrders — price-time priority order');
    const sells = await readSellOrders(redis, SYMBOL);
    assert(sells.length === 3, `readSellOrders returns all 3 sell orders (got ${sells.length})`);
    assert(sells[0].id === sellLow.id, 'lowest price (49200) is first');
    assert(sells[1].id === partiallyFilled.id, 'middle price (49300) is second');
    assert(sells[2].id === sellHigh.id, 'highest price (49500) is last');

    // ── Step 5: partially filled orders carry correct remaining data ────
    console.log('\nStep 5: Partially filled order data integrity');
    const partial = sells.find((o) => o.id === partiallyFilled.id);
    assert(partial?.status === 'PARTIALLY_FILLED', 'partially filled order keeps its status');
    assert(partial?.quantity === 4, 'quantity reflects REMAINING shares (4), not original');
    assert(partial?.filledQuantity === 6, 'filledQuantity reflects shares already filled (6)');

    // ── Step 6: readOrderBook — both sides together ─────────────────────
    console.log('\nStep 6: readOrderBook — combined snapshot');
    const book = await readOrderBook(redis, SYMBOL);
    assert(book.symbol === SYMBOL, 'readOrderBook echoes the requested symbol');
    assert(book.buy.length === 3, 'readOrderBook.buy has all 3 buy orders');
    assert(book.sell.length === 3, 'readOrderBook.sell has all 3 sell orders');
    assert(book.buy[0].id === buyHigh.id, 'readOrderBook.buy is in the same priority order as readBuyOrders');
    assert(book.sell[0].id === sellLow.id, 'readOrderBook.sell is in the same priority order as readSellOrders');

    // ── Step 7: empty book ───────────────────────────────────────────────
    console.log('\nStep 7: Empty order book (symbol with no orders)');
    const emptySymbol = `EMPTY_TEST_${randomUUID().slice(0, 8)}`;
    const emptyBook = await readOrderBook(redis, emptySymbol);
    assert(emptyBook.buy.length === 0, 'empty symbol returns an empty buy array, not null/undefined');
    assert(emptyBook.sell.length === 0, 'empty symbol returns an empty sell array, not null/undefined');

    // ── Step 8: malformed data is skipped, not thrown ────────────────────
    console.log('\nStep 8: Malformed order data — logged and skipped, never thrown');
    const malformedId = randomUUID();
    // Write a hash with an invalid price (non-numeric) directly, and index
    // it into the buy book exactly like a real order would be.
    await redis.hset(orderKey(malformedId), {
      id: malformedId,
      userId: 'test-user-1',
      stockSymbol: SYMBOL,
      type: 'BUY',
      price: 'not-a-number',
      quantity: '5',
      filledQuantity: '0',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });
    await redis.zadd(buyBookKey(SYMBOL), computeScore('BUY', 1, Date.now()), malformedId);
    createdOrderIds.push(malformedId);

    let threw = false;
    let buysAfterMalformed: Order[] = [];
    try {
      buysAfterMalformed = await readBuyOrders(redis, SYMBOL);
    } catch {
      threw = true;
    }
    assert(!threw, 'readBuyOrders does not throw when one entry is malformed');
    assert(
      buysAfterMalformed.length === 3,
      `malformed order is silently skipped — still only 3 valid buy orders (got ${buysAfterMalformed.length})`,
    );
    assert(
      !buysAfterMalformed.some((o) => o.id === malformedId),
      'the malformed order ID does not appear in the results',
    );

    const malformedDirect = await getOrder(redis, malformedId);
    assert(malformedDirect === null, 'getOrder returns null directly for the malformed order');

    // Also verify a completely missing hash (ID in the ZSET but hash
    // never written / already expired) is handled the same way.
    const orphanedId = randomUUID();
    await redis.zadd(buyBookKey(SYMBOL), computeScore('BUY', 2, Date.now()), orphanedId);
    createdOrderIds.push(orphanedId);
    const buysAfterOrphan = await readBuyOrders(redis, SYMBOL);
    assert(
      buysAfterOrphan.length === 3,
      `orphaned ZSET entry (no hash) is silently skipped — still only 3 valid buy orders (got ${buysAfterOrphan.length})`,
    );

    // ── Results ───────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(50));
  } finally {
    // ── Cleanup ────────────────────────────────────────────────────────
    console.log('\nCleaning up test data');
    for (const id of createdOrderIds) {
      await redis.del(orderKey(id));
    }
    await redis.del(buyBookKey(SYMBOL), sellBookKey(SYMBOL));
    console.log(`  Removed ${createdOrderIds.length} order hashes and both book sorted sets`);

    await redis.quit();
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nTest script crashed:', err);
  process.exitCode = 1;
});
