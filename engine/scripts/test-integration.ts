/**
 * Integration test for the wired-up engine (index.ts).
 *
 * Not a Jest suite — spawns the REAL engine process (src/index.ts via tsx)
 * against a real local Redis, drives it purely through the public Redis
 * pub/sub contract (orders:new / orders:cancel / orders:filled), and
 * verifies the whole pipeline end-to-end. This proves the actual wiring —
 * subscriptions, handlers, matching, publishing — works together, not just
 * that the individual functions work in isolation (already covered by
 * test-order-book.ts and test-matching-engine.ts).
 *
 * Run with: npx tsx scripts/test-integration.ts
 * Requires Redis reachable at REDIS_URL (default redis://localhost:6379).
 */

import Redis from 'ioredis';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { get as httpGet } from 'node:http';
import path from 'node:path';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ENGINE_ENTRY = path.resolve(__dirname, '../src/index.ts');
const TEST_HEALTH_PORT = 3103; // avoid colliding with a real engine on 3003
const TICK_INTERVAL_MS = 500; // fast ticks so tests don't wait long
const ENGINE_BOOT_TIMEOUT_MS = 15_000;
const FILL_WAIT_TIMEOUT_MS = 10_000;

// A real seeded stock symbol — matching-relevant logic (matchOrders) doesn't
// care about the symbol being "real" beyond STOCKS_BY_SYMBOL validation in
// index.ts's orders:new handler, so we must use one that actually exists.
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Kills a process and its full descendant tree. Plain child.kill() is not
 * reliable for a spawned .cmd wrapper on Windows — the wrapper's own exit
 * does not guarantee node/tsx underneath has stopped. taskkill /T walks the
 * whole tree; /F forces it. On POSIX this falls back to a plain kill(pid).
 */
function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } catch {
      // Process may have already exited between the check and this call — fine.
    }
  } else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Same — already gone.
    }
  }
}

/** Polls until nothing is listening on `port`, or the timeout elapses. */
async function waitForPortRelease(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const stillListening = await new Promise<boolean>((resolve) => {
      const req = httpGet({ host: '127.0.0.1', port, path: '/', timeout: 300 }, (res) => {
        res.destroy();
        resolve(true); // got a response — still listening
      });
      req.on('error', () => resolve(false)); // connection refused — port is free
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
    if (!stillListening) return true;
    await sleep(200);
  }
  return false;
}

/** Waits for a specific line to appear on the child process's stdout. */
function waitForLog(child: ChildProcess, match: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for engine log containing: "${match}"`));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      if (chunk.toString().includes(match)) {
        clearTimeout(timer);
        child.stdout?.off('data', onData);
        resolve();
      }
    };
    child.stdout?.on('data', onData);
  });
}

/** Waits for a message on a given Redis pub/sub channel matching a predicate. */
function waitForMessage<T>(
  subscriber: Redis,
  channel: string,
  predicate: (msg: T) => boolean,
  timeoutMs: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscriber.off('message', onMessage);
      reject(new Error(`Timed out waiting for message on ${channel}`));
    }, timeoutMs);

    const onMessage = (ch: string, raw: string) => {
      if (ch !== channel) return;
      let parsed: T;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      if (predicate(parsed)) {
        clearTimeout(timer);
        subscriber.off('message', onMessage);
        resolve(parsed);
      }
    };
    subscriber.on('message', onMessage);
  });
}

interface FillEventMsg {
  buyOrderId: string;
  sellOrderId: string;
  symbol: string;
  price: number;
  quantity: number;
  timestamp: string;
}

async function main(): Promise<void> {
  console.log(`Spawning engine: npx tsx ${ENGINE_ENTRY}\n`);

  // Spawn the real node.exe (process.execPath) directly against tsx's CLI
  // entry (a plain .mjs file), instead of going through `npx` or the
  // `tsx.cmd`/`tsx` bin shim.
  //
  // Two Windows-specific problems ruled those out:
  //   - `npx` resolves to npx.cmd, which plain spawn() cannot exec at all
  //     (ENOENT) without shell:true.
  //   - shell:true makes the shell process child.pid, so killing it does
  //     NOT kill the tsx/node process it launched underneath — this left
  //     an orphaned engine (still bound to Redis and its health port)
  //     running after the test believed it had shut down.
  //   - tsx.cmd directly (no shell) hits a third problem: spawn() cannot
  //     exec a .cmd file at all without a shell — it's a batch script, not
  //     a real executable — and fails with EINVAL.
  // Invoking node.exe with tsx's .mjs CLI as an argument sidesteps all
  // three: it's a real executable, no shell layer, and child.pid is the
  // actual engine process, so SIGTERM/kill reliably reaches it.
  //
  // Resolved via require.resolve (Node's own module resolution), not a
  // hardcoded `../node_modules/tsx/...` path — this is a monorepo and tsx
  // is hoisted to the workspace root (E:\Nebula\node_modules), not
  // installed inside engine/. require.resolve walks up node_modules
  // exactly the way `import 'tsx'` would, so it finds tsx regardless of
  // which level it's hoisted to.
  //
  // require.resolve('tsx/dist/cli.mjs') itself is blocked by tsx's
  // package.json "exports" map (that subpath isn't declared as public),
  // so instead resolve the package root via its package.json (which
  // exports maps always allow) and join the known relative path from there.
  const tsxPackageJson = require.resolve('tsx/package.json');
  const tsxCliEntry = path.join(path.dirname(tsxPackageJson), 'dist', 'cli.mjs');

  const child = spawn(process.execPath, [tsxCliEntry, ENGINE_ENTRY], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      REDIS_URL,
      ENGINE_HTTP_PORT: String(TEST_HEALTH_PORT),
      PRICE_UPDATE_INTERVAL_MS: String(TICK_INTERVAL_MS),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let engineOutput = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    engineOutput += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    engineOutput += chunk.toString();
  });

  const publisher = new Redis(REDIS_URL);
  const testSubscriber = new Redis(REDIS_URL);
  const createdOrderIds: string[] = [];

  try {
    // ── Wait for the engine to boot and subscribe ─────────────────────────
    console.log('Waiting for engine to boot...');
    await waitForLog(child, 'Subscribed to orders:new, orders:cancel', ENGINE_BOOT_TIMEOUT_MS);
    console.log('  Engine subscribed and running\n');

    await testSubscriber.subscribe('orders:filled');

    // ── Step: publish two crossing orders via orders:new ────────────────────
    console.log('Step: Publishing a crossing BUY/SELL pair via orders:new');

    const buyOrderId = randomUUID();
    const sellOrderId = randomUUID();
    createdOrderIds.push(buyOrderId, sellOrderId);

    const buyUserId = `integration-buyer-${randomUUID().slice(0, 8)}`;
    const sellUserId = `integration-seller-${randomUUID().slice(0, 8)}`;

    // Use a price far below/above any realistic GBM tick so the pair is
    // crossed on its own merits — the test does not depend on waiting for
    // a specific random price tick to cross a single resting order.
    const buyMsg = {
      orderId: buyOrderId,
      userId: buyUserId,
      stockSymbol: SYMBOL,
      type: 'BUY' as const,
      price: 1_000_000, // Rs. 10,000 — deliberately high, guarantees crossing
      quantity: 15,
    };
    const sellMsg = {
      orderId: sellOrderId,
      userId: sellUserId,
      stockSymbol: SYMBOL,
      type: 'SELL' as const,
      price: 100, // Rs. 1 — deliberately low, guarantees crossing
      quantity: 15,
    };

    const fillPromise = waitForMessage<FillEventMsg>(
      testSubscriber,
      'orders:filled',
      (msg) => msg.buyOrderId === buyOrderId && msg.sellOrderId === sellOrderId,
      FILL_WAIT_TIMEOUT_MS,
    );

    await publisher.publish('orders:new', JSON.stringify(buyMsg));
    await publisher.publish('orders:new', JSON.stringify(sellMsg));

    console.log('  Published BUY (Rs. 10000) and SELL (Rs. 1) — guaranteed to cross on next tick');

    // ── Step: wait for the fill on orders:filled ─────────────────────────
    console.log('\nStep: Waiting for fill event on orders:filled');
    const fill = await fillPromise;
    console.log(`  Received fill: ${fill.quantity} @ Rs. ${(fill.price / 100).toFixed(2)}`);

    // ── Step: verify the fill event is correct ───────────────────────────
    console.log('\nStep: Verifying fill event correctness');
    assert(fill.buyOrderId === buyOrderId, 'fill.buyOrderId matches the published BUY order');
    assert(fill.sellOrderId === sellOrderId, 'fill.sellOrderId matches the published SELL order');
    assert(fill.symbol === SYMBOL, `fill.symbol is ${SYMBOL}`);
    assert(fill.quantity === 15, 'fill.quantity is 15 (both orders fully consumed)');
    assert(fill.price === 100, "fill.price is the resting SELL order's limit price (100 paise)");
    assert(
      !Number.isNaN(new Date(fill.timestamp).getTime()),
      'fill.timestamp is a valid ISO date string',
    );
    assert(
      engineOutput.includes(`New order: BUY 15 ${SYMBOL}`),
      'engine logged the new BUY order per spec format',
    );
    assert(
      engineOutput.includes(`New order: SELL 15 ${SYMBOL}`),
      'engine logged the new SELL order per spec format',
    );
    assert(
      engineOutput.includes(`Fill: ${SYMBOL} 15 @ Rs.1.00`) ||
        engineOutput.includes(`Fill: ${SYMBOL} 15 @ Rs. 1.00`),
      'engine logged the fill event',
    );

    // ── Step: test order cancellation via orders:cancel ──────────────────
    console.log('\nStep: Testing order cancellation via orders:cancel');

    const cancelOrderId = randomUUID();
    createdOrderIds.push(cancelOrderId);
    const cancelUserId = `integration-canceller-${randomUUID().slice(0, 8)}`;

    // Place a resting order that will NOT cross anything (no counterparty),
    // so it's still sitting in the book when we cancel it.
    const restingMsg = {
      orderId: cancelOrderId,
      userId: cancelUserId,
      stockSymbol: SYMBOL,
      type: 'BUY' as const,
      price: 1, // Rs. 0.01 — will not cross any realistic sell
      quantity: 3,
    };
    await publisher.publish('orders:new', JSON.stringify(restingMsg));
    await sleep(TICK_INTERVAL_MS + 200); // let at least one tick process it into the book

    const orderKey = `order:${cancelOrderId}`;
    const existsBeforeCancel = await publisher.exists(orderKey);
    assert(existsBeforeCancel === 1, 'resting order exists in Redis before cancellation');

    await publisher.publish('orders:cancel', JSON.stringify({ orderId: cancelOrderId }));
    await waitForLog(child, `Order cancelled: ${cancelOrderId}`, FILL_WAIT_TIMEOUT_MS);

    const existsAfterCancel = await publisher.exists(orderKey);
    assert(existsAfterCancel === 0, 'order hash removed from Redis after cancellation');

    const buyBookMembers = await publisher.zscore(`orderbook:buy:${SYMBOL}`, cancelOrderId);
    assert(buyBookMembers === null, 'order ID removed from the buy-side sorted set after cancellation');

    // ── Step: malformed message handling (log-and-skip, no crash) ─────────
    console.log('\nStep: Verifying malformed messages do not crash the engine');
    await publisher.publish('orders:new', 'not valid json{{{');
    await publisher.publish(
      'orders:new',
      JSON.stringify({ orderId: 'x', stockSymbol: 'DOES_NOT_EXIST', type: 'BUY', price: 100, quantity: 1, userId: 'u' }),
    );
    await sleep(TICK_INTERVAL_MS + 200);
    assert(child.exitCode === null && !child.killed, 'engine process is still alive after malformed/invalid input');

    // ── Results ───────────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(50));
  } finally {
    // ── Cleanup ────────────────────────────────────────────────────────────
    console.log('\nCleaning up');

    // Stop the engine gracefully (exercises the SIGTERM shutdown path too).
    if (!child.killed && child.exitCode === null && child.pid !== undefined) {
      child.kill('SIGTERM');
      await Promise.race([
        new Promise<void>((resolve) => child.once('exit', () => resolve())),
        sleep(5000),
      ]);

      if (child.exitCode === null && !child.killed) {
        console.log('  Engine did not exit gracefully in time — force killing process tree');
        killProcessTree(child.pid);
      } else {
        console.log('  Engine shut down gracefully via SIGTERM');
      }
    }

    // Belt-and-braces: on Windows, `child.pid` for a spawned .cmd can be an
    // intermediate wrapper whose own exit doesn't guarantee the real
    // node/tsx process underneath has stopped listening yet. Confirm the
    // engine's health port is actually released before calling cleanup done
    // — a false "shut down gracefully" here previously left an orphaned
    // engine process running and bound to Redis after the test exited.
    const portFreed = await waitForPortRelease(TEST_HEALTH_PORT, 5000);
    assert(portFreed, `engine health port ${TEST_HEALTH_PORT} released after shutdown (no orphaned process)`);

    await testSubscriber.unsubscribe('orders:filled');

    // Remove any order hashes/book entries the test created.
    for (const id of createdOrderIds) {
      await publisher.del(`order:${id}`);
    }
    for (const id of createdOrderIds) {
      await publisher.zrem(`orderbook:buy:${SYMBOL}`, id);
      await publisher.zrem(`orderbook:sell:${SYMBOL}`, id);
    }

    await publisher.quit();
    await testSubscriber.quit();

    console.log('  Test keys removed from Redis');
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nTest script crashed:', err);
  process.exitCode = 1;
});
