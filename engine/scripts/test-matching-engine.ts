/**
 * Manual smoke test for matching-engine.ts
 *
 * Not a Jest suite — a standalone script exercising matchOrders/cancelOrder
 * against a real local Redis instance. Run with:
 *   npx tsx scripts/test-matching-engine.ts
 *
 * Requires Redis reachable at REDIS_URL (default redis://localhost:6379).
 * Each scenario runs on its own randomly-suffixed symbol so scenarios never
 * interfere with each other, and all test keys are cleaned up on exit.
 */

import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { addOrder, getOrder, getOrderBook, type Order } from '../src/order-book';
import { matchOrders, cancelOrder } from '../src/matching-engine';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let passed = 0;
let failed = 0;
const usedSymbols = new Set<string>();
// Every order ID ever created by makeOrder, tracked independently of the
// book's ZSETs — a fill can delete an order's ZSET entry while (in a buggy
// implementation) leaving its order:{id} hash behind. Cleanup must not rely
// on the book to enumerate what to delete, or it would miss exactly that
// kind of orphaned key.
const createdOrderIds = new Set<string>();

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${message}`);
  } else {
    failed++;
    console.error(`  \x1b[31m✗\x1b[0m ${message}`);
  }
}

function testSymbol(label: string): string {
  const symbol = `${label}_${randomUUID().slice(0, 8)}`;
  usedSymbols.add(symbol);
  return symbol;
}

function makeOrder(symbol: string, overrides: Partial<Order>): Order {
  const order: Order = {
    id: randomUUID(),
    userId: 'user-1',
    stockSymbol: symbol,
    type: 'BUY',
    price: 100,
    quantity: 1,
    filledQuantity: 0,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  createdOrderIds.add(order.id);
  return order;
}

async function cleanupSymbol(redis: Redis, symbol: string): Promise<void> {
  await redis.del(`orderbook:buy:${symbol}`, `orderbook:sell:${symbol}`);
}

async function main(): Promise<void> {
  const redis = new Redis(REDIS_URL);

  try {
    await redis.ping();
    console.log(`Connected to Redis at ${REDIS_URL}\n`);

    // ── Scenario 1: Full match (equal quantities) ──────────────────────────
    console.log('Scenario 1: Full match (equal quantities)');
    {
      const symbol = testSymbol('FULL');
      const buy = makeOrder(symbol, { userId: 'alice', type: 'BUY', price: 500, quantity: 10 });
      const sell = makeOrder(symbol, { userId: 'bob', type: 'SELL', price: 500, quantity: 10 });
      await addOrder(redis, buy);
      await addOrder(redis, sell);

      const fills = await matchOrders(redis, symbol, 500);

      assert(fills.length === 1, `exactly 1 fill event produced (got ${fills.length})`);
      assert(fills[0]?.quantity === 10, 'fill quantity is 10 (both fully consumed)');
      assert(fills[0]?.price === 500, 'fill price is the sell order limit price (500)');
      assert(fills[0]?.buyOrderId === buy.id, 'fill references correct buyOrderId');
      assert(fills[0]?.sellOrderId === sell.id, 'fill references correct sellOrderId');

      const buyAfter = await getOrder(redis, buy.id);
      const sellAfter = await getOrder(redis, sell.id);
      assert(buyAfter === null, 'buy order removed from Redis (fully filled)');
      assert(sellAfter === null, 'sell order removed from Redis (fully filled)');
    }

    // ── Scenario 2: Partial fill — buy larger than sell ─────────────────────
    console.log('\nScenario 2: Partial fill (buy larger than sell)');
    {
      const symbol = testSymbol('BUYBIG');
      const buy = makeOrder(symbol, { userId: 'alice', type: 'BUY', price: 500, quantity: 10 });
      const sell = makeOrder(symbol, { userId: 'bob', type: 'SELL', price: 500, quantity: 4 });
      await addOrder(redis, buy);
      await addOrder(redis, sell);

      const fills = await matchOrders(redis, symbol, 500);

      assert(fills.length === 1, `exactly 1 fill event produced (got ${fills.length})`);
      assert(fills[0]?.quantity === 4, 'fill quantity is 4 (limited by smaller sell)');

      const buyAfter = await getOrder(redis, buy.id);
      const sellAfter = await getOrder(redis, sell.id);
      assert(sellAfter === null, 'sell order removed from Redis (fully filled)');
      assert(buyAfter !== null, 'buy order still exists (partially filled)');
      assert(buyAfter?.status === 'PARTIALLY_FILLED', 'buy order status is PARTIALLY_FILLED');
      assert(buyAfter?.quantity === 6, 'buy order remaining quantity is 6 (10 - 4)');
      assert(buyAfter?.filledQuantity === 4, 'buy order filledQuantity is 4');

      const book = await getOrderBook(redis, symbol);
      assert(
        book.buy.some((o) => o.id === buy.id),
        'partially filled buy order remains indexed in the book',
      );
    }

    // ── Scenario 3: Partial fill — sell larger than buy ─────────────────────
    console.log('\nScenario 3: Partial fill (sell larger than buy)');
    {
      const symbol = testSymbol('SELLBIG');
      const buy = makeOrder(symbol, { userId: 'alice', type: 'BUY', price: 500, quantity: 3 });
      const sell = makeOrder(symbol, { userId: 'bob', type: 'SELL', price: 500, quantity: 9 });
      await addOrder(redis, buy);
      await addOrder(redis, sell);

      const fills = await matchOrders(redis, symbol, 500);

      assert(fills.length === 1, `exactly 1 fill event produced (got ${fills.length})`);
      assert(fills[0]?.quantity === 3, 'fill quantity is 3 (limited by smaller buy)');

      const buyAfter = await getOrder(redis, buy.id);
      const sellAfter = await getOrder(redis, sell.id);
      assert(buyAfter === null, 'buy order removed from Redis (fully filled)');
      assert(sellAfter !== null, 'sell order still exists (partially filled)');
      assert(sellAfter?.status === 'PARTIALLY_FILLED', 'sell order status is PARTIALLY_FILLED');
      assert(sellAfter?.quantity === 6, 'sell order remaining quantity is 6 (9 - 3)');
      assert(sellAfter?.filledQuantity === 3, 'sell order filledQuantity is 3');
    }

    // ── Scenario 4: Self-trade prevention ────────────────────────────────────
    console.log('\nScenario 4: Self-trade prevention');
    {
      const symbol = testSymbol('SELFTRADE');
      // Same user on both sides, crossed prices — must NOT match.
      const buy = makeOrder(symbol, { userId: 'carol', type: 'BUY', price: 500, quantity: 5 });
      const sell = makeOrder(symbol, { userId: 'carol', type: 'SELL', price: 500, quantity: 5 });
      await addOrder(redis, buy);
      await addOrder(redis, sell);

      const fills = await matchOrders(redis, symbol, 500);

      assert(fills.length === 0, `no fills produced for same-user crossed orders (got ${fills.length})`);

      const buyAfter = await getOrder(redis, buy.id);
      const sellAfter = await getOrder(redis, sell.id);
      assert(buyAfter?.status === 'PENDING', 'buy order remains PENDING (untouched)');
      assert(sellAfter?.status === 'PENDING', 'sell order remains PENDING (untouched)');

      // Now add a third order from a DIFFERENT user that crosses both —
      // it should match against carol's resting order, skipping the self-trade.
      const daveSell = makeOrder(symbol, {
        userId: 'dave',
        type: 'SELL',
        price: 500,
        quantity: 5,
        createdAt: new Date(Date.now() + 1000).toISOString(), // after carol's sell
      });
      await addOrder(redis, daveSell);

      const fills2 = await matchOrders(redis, symbol, 500);
      assert(fills2.length === 1, `carol's buy matches dave's sell instead (got ${fills2.length} fills)`);
      assert(
        fills2[0]?.buyOrderId === buy.id && fills2[0]?.sellOrderId === daveSell.id,
        'fill correctly pairs carol (buy) with dave (sell), not carol with herself',
      );

      // Carol's own sell should remain resting, unmatched, since no other buyer exists.
      const carolSellAfter = await getOrder(redis, sell.id);
      assert(
        carolSellAfter?.status === 'PENDING',
        "carol's original sell order is still PENDING (never matched against herself)",
      );
    }

    // ── Scenario 5: Multiple matches in one tick ─────────────────────────────
    console.log('\nScenario 5: Multiple matches in one tick');
    {
      const symbol = testSymbol('MULTI');
      // One big sell order that should sweep through two smaller buy orders.
      const buy1 = makeOrder(symbol, {
        userId: 'alice',
        type: 'BUY',
        price: 510,
        quantity: 3,
        createdAt: new Date(Date.now() - 2000).toISOString(),
      });
      const buy2 = makeOrder(symbol, {
        userId: 'bob',
        type: 'BUY',
        price: 505,
        quantity: 4,
        createdAt: new Date(Date.now() - 1000).toISOString(),
      });
      const bigSell = makeOrder(symbol, { userId: 'carol', type: 'SELL', price: 500, quantity: 6 });

      await addOrder(redis, buy1);
      await addOrder(redis, buy2);
      await addOrder(redis, bigSell);

      const fills = await matchOrders(redis, symbol, 500);

      assert(fills.length === 2, `2 fill events produced in one matchOrders call (got ${fills.length})`);
      assert(
        fills[0]?.buyOrderId === buy1.id,
        'first fill matches the higher-priced buy order (510) first — price priority',
      );
      assert(fills[0]?.quantity === 3, 'first fill fully consumes buy1 (qty 3)');
      assert(
        fills[1]?.buyOrderId === buy2.id,
        'second fill matches the next-best buy order (505)',
      );
      assert(fills[1]?.quantity === 3, 'second fill takes the remaining 3 shares from bigSell (6 - 3)');

      const buy1After = await getOrder(redis, buy1.id);
      const buy2After = await getOrder(redis, buy2.id);
      const sellAfter = await getOrder(redis, bigSell.id);
      assert(buy1After === null, 'buy1 fully filled and removed');
      assert(buy2After !== null && buy2After.status === 'PARTIALLY_FILLED', 'buy2 partially filled (3 of 4)');
      assert(buy2After?.quantity === 1, 'buy2 has 1 share remaining');
      assert(sellAfter === null, 'bigSell fully filled and removed (3 + 3 = 6)');

      // Both fills should have used the resting sell order's price (500), not the buy prices.
      assert(
        fills.every((f) => f.price === 500),
        'all fills priced at the resting sell limit price (500), not the buy prices',
      );
    }

    // ── Scenario 6: No match when prices don't cross ────────────────────────
    console.log("\nScenario 6: No match when prices don't cross");
    {
      const symbol = testSymbol('NOCROSS');
      const buy = makeOrder(symbol, { userId: 'alice', type: 'BUY', price: 490, quantity: 5 });
      const sell = makeOrder(symbol, { userId: 'bob', type: 'SELL', price: 500, quantity: 5 });
      await addOrder(redis, buy);
      await addOrder(redis, sell);

      const fills = await matchOrders(redis, symbol, 495);

      assert(fills.length === 0, `no fills when bestBuy (490) < bestSell (500) (got ${fills.length})`);

      const buyAfter = await getOrder(redis, buy.id);
      const sellAfter = await getOrder(redis, sell.id);
      assert(buyAfter?.status === 'PENDING', 'buy order remains PENDING and untouched');
      assert(sellAfter?.status === 'PENDING', 'sell order remains PENDING and untouched');
      assert(buyAfter?.quantity === 5, 'buy order quantity unchanged');
      assert(sellAfter?.quantity === 5, 'sell order quantity unchanged');
    }

    // ── Scenario 7: Cancel order removes from book ───────────────────────────
    console.log('\nScenario 7: cancelOrder removes from book');
    {
      const symbol = testSymbol('CANCEL');
      const order = makeOrder(symbol, { userId: 'alice', type: 'BUY', price: 500, quantity: 7 });
      await addOrder(redis, order);

      await cancelOrder(redis, order.id);

      const afterCancel = await getOrder(redis, order.id);
      assert(afterCancel === null, 'order hash removed from Redis after cancelOrder');

      const book = await getOrderBook(redis, symbol);
      assert(book.buy.length === 0, 'buy side is empty after cancelling the only order');

      // Cancelling again (already gone) must be a safe no-op, not throw.
      await cancelOrder(redis, order.id);
      console.log('  (cancelOrder on already-cancelled/missing order did not throw — OK)');

      // Cancelling a PARTIALLY_FILLED order should also work.
      const partial = makeOrder(symbol, {
        userId: 'alice',
        type: 'SELL',
        price: 500,
        quantity: 4,
        filledQuantity: 6,
        status: 'PARTIALLY_FILLED',
      });
      await addOrder(redis, partial);
      await cancelOrder(redis, partial.id);
      const partialAfter = await getOrder(redis, partial.id);
      assert(partialAfter === null, 'PARTIALLY_FILLED order also removed from book on cancel');
    }

    // ── Results ───────────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(50));
  } finally {
    console.log('\nCleaning up test data');
    for (const symbol of usedSymbols) {
      await cleanupSymbol(redis, symbol);
    }
    // Delete every order hash by tracked ID — not by re-scanning the book —
    // so a fill/cancel that already removed an order (or, in a buggy
    // implementation, left an orphaned hash with no ZSET entry) can't hide
    // a leaked key from cleanup.
    if (createdOrderIds.size > 0) {
      await redis.del(...[...createdOrderIds].map((id) => `order:${id}`));
    }
    console.log(
      `  Cleaned up ${usedSymbols.size} test symbols, ${createdOrderIds.size} order records`,
    );
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
