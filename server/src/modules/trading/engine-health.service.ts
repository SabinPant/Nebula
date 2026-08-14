/**
 * Engine Health Service
 *
 * Polls the engine's health endpoint (ENGINE_HTTP_URL/health) on a fixed
 * interval and caches the result. Nothing on the order-placement hot path
 * should ever fetch the engine live — a slow or hanging engine would then
 * add its own latency (or worse, a hung connection) directly to every
 * POST /orders request. Callers just read the cached boolean.
 *
 * Same separate-connection-style reasoning as MarketGateway/EngineService's
 * dedicated Redis connections: isolate the thing that can be slow/flaky
 * (a network call to another process) from the thing that must stay fast
 * (answering "is the engine up?").
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const HEALTH_FETCH_TIMEOUT_MS = 3000;

@Injectable()
export class EngineHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EngineHealthService.name);

  private readonly engineHttpUrl: string;
  private readonly pollIntervalMs: number;

  // Optimistic initial state — the server must not refuse orders for the
  // first poll cycle just because it hasn't checked yet. The first poll
  // (fired immediately in onModuleInit, not just on the interval) corrects
  // this within milliseconds of startup, and a genuinely down engine
  // corrects it within HEALTH_FETCH_TIMEOUT_MS either way.
  private engineUp = true;

  // Null until the first poll completes — distinguishes "never checked
  // yet" from "checked a while ago" for callers like Admin's system
  // status panel (getEngineStatus's lastChecked field).
  private lastCheckedAt: Date | null = null;

  private pollTimer: NodeJS.Timeout | undefined;

  // Guards against overlapping polls. If a health check takes longer than
  // the poll interval (e.g. the engine is hanging right up to the 3s
  // timeout, while polling every 300ms-5s), setInterval would otherwise
  // fire another poll() before the first one's fetch has even settled —
  // several in-flight requests pile up, each later resolving independently
  // and each re-evaluating the up/down transition against a stale `wasUp`
  // snapshot. That produces duplicate transition logs and wastes sockets
  // against a server that's already not responding. A stopped timer
  // (onModuleDestroy) also does not cancel an in-flight poll — this flag
  // is what actually prevents a new one from starting after shutdown.
  private polling = false;

  // Set once onModuleDestroy runs. A timer callback already dispatched to
  // the event loop at the moment clearInterval() fires will still execute
  // — this flag is the actual "don't start new work" switch poll() checks.
  private stopped = false;

  constructor(private readonly configService: ConfigService) {
    this.engineHttpUrl =
      this.configService.get<string>('ENGINE_HTTP_URL') || 'http://localhost:3003';
    this.pollIntervalMs = parseInt(
      this.configService.get<string>('ENGINE_HEALTH_CHECK_INTERVAL_MS') || '5000',
      10,
    );
  }

  async onModuleInit(): Promise<void> {
    // Poll once immediately so the cache reflects reality as soon as
    // possible after boot, rather than waiting a full interval.
    await this.poll();

    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => {
        // poll() already catches its own fetch errors and resolves to a
        // down state — this catch only guards against a truly unexpected
        // bug in poll() itself, so a single bad cycle can't kill the timer.
        this.logger.error(`Unexpected error during engine health poll: ${err.message}`, err.stack);
      });
    }, this.pollIntervalMs);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }

  /**
   * Returns the cached engine status. This is the only method other
   * services should call — it never performs I/O.
   */
  isEngineUp(): boolean {
    return this.engineUp;
  }

  /**
   * Returns when the engine's health was last actually polled — null
   * only before the very first poll has resolved (a brief window right
   * at server startup). Read-only cache access, same as isEngineUp().
   */
  getLastCheckedAt(): Date | null {
    return this.lastCheckedAt;
  }

  /**
   * Fetches the engine's health endpoint with a hard timeout and updates
   * the cached status. Logs only on a state transition (up→down or
   * down→up), never on every poll — at a 5s interval that would otherwise
   * be 17,000+ log lines a day saying nothing changed.
   *
   * Skips entirely if a previous poll is still in flight (see `polling`)
   * or the service has been torn down (see `stopped`) — without this, a
   * health check slower than the poll interval lets multiple overlapping
   * fetches queue up, each later resolving independently and logging its
   * own (stale) transition.
   */
  private async poll(): Promise<void> {
    if (this.polling || this.stopped) {
      return;
    }
    this.polling = true;

    try {
      const wasUp = this.engineUp;
      const isUp = await this.checkEngineOnce();

      if (this.stopped) {
        return; // torn down while the fetch was in flight — don't log or update
      }

      this.engineUp = isUp;
      this.lastCheckedAt = new Date();

      if (isUp !== wasUp) {
        if (isUp) {
          this.logger.log(`Engine is back UP (${this.engineHttpUrl})`);
        } else {
          this.logger.warn(`Engine is DOWN (${this.engineHttpUrl}) — orders will be rejected`);
        }
      }
    } finally {
      this.polling = false;
    }
  }

  /**
   * Performs one health check attempt. Returns true only if the engine
   * responds within the timeout with HTTP 200 and { status: "ok" }.
   * Any failure — timeout, connection refused, non-200, bad JSON, wrong
   * status value — is treated as "down". Never throws.
   */
  private async checkEngineOnce(): Promise<boolean> {
    try {
      const res = await fetch(`${this.engineHttpUrl}/health`, {
        signal: AbortSignal.timeout(HEALTH_FETCH_TIMEOUT_MS),
      });

      if (!res.ok) {
        return false;
      }

      const body = await res.json();
      return body?.status === 'ok';
    } catch {
      // Covers: connection refused (engine process down), DNS failure,
      // AbortSignal.timeout firing (engine hung/unreachable), and
      // malformed JSON from res.json(). All of these mean "down" here.
      return false;
    }
  }
}
