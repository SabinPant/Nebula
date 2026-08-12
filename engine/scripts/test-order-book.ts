/**
 * Manual smoke test for order-book.ts
 *
 * Not a Jest suite — a standalone script exercising the order book against
 * a real local Redis instance. Run with: npx tsx scripts/test-order-book.ts
 *
 * Requires Redis reachable at REDIS_URL (default redis://localhost:6379).
 * All test keys are prefixed with a random run ID and cleaned up on exit,
 * whether the run passes or fails.
 */

import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import {
  addOrder,
  removeOrder,
  getOrder,
  getBestBuy,
  getBestSell,
  getOrderBook,
  updateOrderQuantity,
  type Order,
} from '../src/order-book';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SYMBOL = `NABIL_TEST_${randomUUID().slice(0, 8)}`; // isolate from any real NABIL book

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

function makeOrder(overrides: Partial<Order>): Order {
  const now = new Date();
  return {
    id: randomUUID(),
    userId: 'test-user-1',
    stockSymbol: SYMBOL,
    type: 'BUY',
    price: 100,
    quantity: 1,
    filledQuantity: 0,
    status: 'PENDING',
    createdAt: now.toISOString(),
    ...overrides,
  };
}

async function main(): Promise<void> {
  const redis = new Redis(REDIS_URL);
  const createdOrderIds: string[] = [];

  try {
    await redis.connect().catch(() => {
      // ioredis auto-connects by default; connect() throws if already connecting.
      // Swallow — ping() below is the real readiness check.
    });
    await redis.ping();
    console.log(`Connected to Redis at ${REDIS_URL}\n`);

    // ── Step 3: Add 3 test orders ─────────────────────────────────────────
    console.log('Step 3: Adding test orders');

    const buy485 = makeOrder({
      type: 'BUY',
      price: 48_500, // Rs. 485.00 in paise
      quantity: 10,
      createdAt: new Date(Date.now() - 2000).toISOString(), // earliest
    });
    const buy490 = makeOrder({
      type: 'BUY',
      price: 49_000, // Rs. 490.00 in paise
      quantity: 5,
      createdAt: new Date(Date.now() - 1000).toISOString(),
    });
    const sell492 = makeOrder({
      type: 'SELL',
      price: 49_200, // Rs. 492.00 in paise
      quantity: 8,
      createdAt: new Date().toISOString(),
    });

    for (const order of [buy485, buy490, sell492]) {
      await addOrder(redis, order);
      createdOrderIds.push(order.id);
    }
    console.log(`  Added ${createdOrderIds.length} orders for symbol ${SYMBOL}\n`);

    // Sanity: each order round-trips via getOrder
    const fetchedBuy485 = await getOrder(redis, buy485.id);
    assert(fetchedBuy485 !== null, 'getOrder returns the Rs. 485 BUY order');
    assert(fetchedBuy485?.price === 48_500, 'Rs. 485 BUY order price round-trips correctly');
    assert(fetchedBuy485?.quantity === 10, 'Rs. 485 BUY order quantity round-trips correctly');
    assert(typeof fetchedBuy485?.price === 'number', 'price is a number, not a string, after round-trip');

    // ── Step 4: getBestBuy returns Rs. 490 (highest price) ─────────────────
    console.log('\nStep 4: getBestBuy — highest price wins');
    const bestBuy = await getBestBuy(redis, SYMBOL);
    assert(bestBuy !== null, 'getBestBuy returns a non-null order');
    assert(bestBuy?.id === buy490.id, 'getBestBuy returns the Rs. 490 order (not Rs. 485)');
    assert(bestBuy?.price === 49_000, 'getBestBuy order has price 49000 paise');

    // ── Step 5: getBestSell returns Rs. 492 (lowest / only price) ──────────
    console.log('\nStep 5: getBestSell — lowest price wins');
    const bestSell = await getBestSell(redis, SYMBOL);
    assert(bestSell !== null, 'getBestSell returns a non-null order');
    assert(bestSell?.id === sell492.id, 'getBestSell returns the Rs. 492 order');
    assert(bestSell?.price === 49_200, 'getBestSell order has price 49200 paise');

    // ── Price-time priority tiebreak check ──────────────────────────────────
    // Add a second BUY at the same best price (49000) but later createdAt —
    // best buy must still be the earlier order at that price.
    console.log('\nStep 5b: price-time priority — equal price, earlier order wins');
    const buy490Later = makeOrder({
      type: 'BUY',
      price: 49_000,
      quantity: 3,
      createdAt: new Date().toISOString(), // later than buy490
    });
    await addOrder(redis, buy490Later);
    createdOrderIds.push(buy490Later.id);

    const bestBuyAfterTie = await getBestBuy(redis, SYMBOL);
    assert(
      bestBuyAfterTie?.id === buy490.id,
      'getBestBuy still returns the earlier Rs. 490 order at equal price (time priority)',
    );

    // Clean up the tie-break order immediately — not needed for later steps
    await removeOrder(redis, buy490Later.id);

    // ── Step 6: getOrderBook returns both sides correctly ───────────────────
    console.log('\nStep 6: getOrderBook — both sides in priority order');
    const book = await getOrderBook(redis, SYMBOL);
    assert(book.symbol === SYMBOL, 'getOrderBook echoes the requested symbol');
    assert(book.buy.length === 2, `getOrderBook has 2 buy orders (got ${book.buy.length})`);
    assert(book.sell.length === 1, `getOrderBook has 1 sell order (got ${book.sell.length})`);
    assert(
      book.buy[0]?.id === buy490.id && book.buy[1]?.id === buy485.id,
      'getOrderBook buy side is ordered best-first (490 then 485)',
    );
    assert(book.sell[0]?.id === sell492.id, 'getOrderBook sell side contains the 492 order');

    // ── Step 7: updateOrderQuantity on a partial fill ───────────────────────
    console.log('\nStep 7: updateOrderQuantity — partial fill');
    // Partially fill the Rs. 485 BUY order: 10 qty, 4 filled -> 6 remaining
    await updateOrderQuantity(redis, buy485.id, 6, 4);
    const partiallyFilled = await getOrder(redis, buy485.id);
    assert(partiallyFilled?.quantity === 6, 'quantity updated to 6 after partial fill');
    assert(partiallyFilled?.filledQuantity === 4, 'filledQuantity updated to 4 after partial fill');

    // Confirm the order kept its place in the book (score/priority unchanged)
    const bookAfterPartialFill = await getOrderBook(redis, SYMBOL);
    assert(
      bookAfterPartialFill.buy.some((o) => o.id === buy485.id),
      'partially filled order remains indexed in the buy book',
    );

    // ── Step 8: removeOrder ──────────────────────────────────────────────────
    console.log('\nStep 8: removeOrder');
    await removeOrder(redis, sell492.id);
    const afterRemoveOrder = await getOrder(redis, sell492.id);
    assert(afterRemoveOrder === null, 'getOrder returns null after removeOrder');

    const bookAfterRemove = await getOrderBook(redis, SYMBOL);
    assert(bookAfterRemove.sell.length === 0, 'sell side is empty after removing the only sell order');

    const bestSellAfterRemove = await getBestSell(redis, SYMBOL);
    assert(bestSellAfterRemove === null, 'getBestSell returns null when sell side is empty');

    // removeOrder on an already-removed / nonexistent order should be a safe no-op
    await removeOrder(redis, sell492.id);
    console.log('  (removeOrder on already-removed order did not throw — OK)');

    // ── Results ───────────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(50));
  } finally {
    // ── Step 9: clean up all test data from Redis ─────────────────────────
    console.log('\nStep 9: Cleaning up test data');
    const remaining = await getOrderBook(redis, SYMBOL);
    const remainingIds = [...remaining.buy, ...remaining.sell].map((o) => o.id);
    for (const id of remainingIds) {
      await removeOrder(redis, id);
    }
    // Belt-and-braces: delete the sorted sets themselves in case they're
    // empty-but-present, and any order hashes not reachable from the book
    // (e.g. if a bug left a hash orphaned with no ZSET entry).
    await redis.del(`orderbook:buy:${SYMBOL}`, `orderbook:sell:${SYMBOL}`);
    for (const id of createdOrderIds) {
      await redis.del(`order:${id}`);
    }
    console.log('  Test keys removed from Redis');

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
