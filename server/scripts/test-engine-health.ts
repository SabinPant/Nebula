/**
 * Quick test for EngineHealthService.
 *
 * Not a Jest suite — a standalone script that constructs the service
 * directly (with a minimal ConfigService stub, since this is a plain class
 * with one constructor dependency — no need to bootstrap a full Nest
 * TestingModule for it) and points it at a real local HTTP server this
 * script controls, so each check exercises the actual fetch/timeout/JSON
 * path rather than a monkey-patched global.fetch.
 *
 * Run with: npx tsx scripts/test-engine-health.ts (from server/)
 */

import { createServer, type Server } from 'node:http';
import type { ConfigService } from '@nestjs/config';
import { EngineHealthService } from '../src/modules/trading/engine-health.service';

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

/** Minimal ConfigService stand-in — EngineHealthService only ever calls .get(). */
function makeConfigStub(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

/**
 * A controllable fake engine health endpoint — one flag decides its behavior.
 * "Connection refused" isn't a mode here — it's exercised by actually
 * closing the server (see closeFakeEngine in main()), which is what a real
 * dead engine process looks like from the server's point of view.
 */
type FakeEngineMode = 'up' | 'down-500' | 'down-bad-status' | 'down-hang';

function startFakeEngine(getMode: () => FakeEngineMode, port: number): Server {
  const server = createServer((_req, res) => {
    const mode = getMode();

    if (mode === 'down-hang') {
      // Never respond — exercises the 3s AbortSignal.timeout path.
      return;
    }
    if (mode === 'down-500') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error' }));
      return;
    }
    if (mode === 'down-bad-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'degraded' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: 123, stocks: 10 }));
  });

  server.listen(port);
  return server;
}

async function main(): Promise<void> {
  const PORT = 3199; // dedicated to this test, distinct from the real engine's 3003
  let mode: FakeEngineMode = 'up';
  let fakeEngine: Server | undefined = startFakeEngine(() => mode, PORT);

  function closeFakeEngine(): Promise<void> {
    return new Promise((resolve) => {
      if (fakeEngine && fakeEngine.listening) {
        fakeEngine.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  // Short poll interval so the test doesn't sit around for 5s per assertion.
  const config = makeConfigStub({
    ENGINE_HTTP_URL: `http://127.0.0.1:${PORT}`,
    ENGINE_HEALTH_CHECK_INTERVAL_MS: '300',
  });

  const service = new EngineHealthService(config);

  try {
    // ── Initial state, before onModuleInit ────────────────────────────
    console.log('Step: Initial state before onModuleInit');
    assert(
      service.isEngineUp() === true,
      'isEngineUp() is optimistically true before any poll has run',
    );

    // ── onModuleInit polls immediately — engine is "up" ────────────────
    console.log('\nStep: onModuleInit with a healthy fake engine');
    mode = 'up';
    await service.onModuleInit();
    assert(service.isEngineUp() === true, 'isEngineUp() is true after init poll against a healthy engine');

    // ── Simulate the engine going down (connection refused) ────────────
    console.log('\nStep: Engine becomes unreachable (connection refused)');
    await closeFakeEngine();
    fakeEngine = undefined;
    await sleep(500); // let at least one interval tick fire against the closed port
    assert(
      service.isEngineUp() === false,
      'isEngineUp() becomes false once the engine stops responding (connection refused)',
    );

    // ── Engine comes back up ────────────────────────────────────────────
    console.log('\nStep: Engine comes back up');
    mode = 'up';
    fakeEngine = startFakeEngine(() => mode, PORT);
    await sleep(500);
    assert(
      service.isEngineUp() === true,
      'isEngineUp() becomes true again once the engine starts responding',
    );

    // ── Bad status field (200 OK, but status !== "ok") ──────────────────
    console.log('\nStep: Engine responds 200 but with a non-"ok" status field');
    mode = 'down-bad-status';
    await sleep(500);
    assert(
      service.isEngineUp() === false,
      'isEngineUp() is false when the engine responds 200 but status is not "ok"',
    );

    // ── Non-200 HTTP response ───────────────────────────────────────────
    console.log('\nStep: Engine responds with HTTP 500');
    // Force a clean up->down transition first, to prove this specific
    // failure mode also produces "down" on its own (not just carried over
    // from the previous already-false state).
    mode = 'up';
    await sleep(500);
    assert(service.isEngineUp() === true, '(setup) engine reported up again before the 500 case');
    mode = 'down-500';
    await sleep(500);
    assert(service.isEngineUp() === false, 'isEngineUp() is false when the engine responds with HTTP 500');

    // ── Timeout (engine hangs and never responds) ───────────────────────
    console.log('\nStep: Engine hangs — verifying the 3s fetch timeout path');
    mode = 'up';
    await sleep(500);
    assert(service.isEngineUp() === true, '(setup) engine reported up again before the hang case');
    mode = 'down-hang';
    // The service's internal timeout is 3s; wait past that plus one more
    // poll interval so the hung request has definitely been aborted and
    // the poll loop has run again.
    await sleep(3500);
    assert(
      service.isEngineUp() === false,
      'isEngineUp() is false after the engine hangs past the 3s fetch timeout',
    );

    // ── Results ───────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(50));
  } finally {
    service.onModuleDestroy();
    await closeFakeEngine();
    console.log('\nCleaned up: stopped polling, closed fake engine server');
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nTest script crashed:', err);
  process.exitCode = 1;
});
