/**
 * Market WebSocket Gateway
 *
 * Bridges the engine's Redis price ticks to Socket.IO clients.
 *
 * Architecture:
 *   Engine → Redis (market:prices) → Gateway → Socket.IO rooms (stock:{symbol})
 *
 * On each tick:
 *   1. Updates the stock's currentPrice and isHalted in PostgreSQL
 *   2. Aggregates the tick into a 1-minute OHLCV candle (in-memory)
 *   3. When a minute boundary is crossed, flushes the completed candle
 *      to PriceHistory and starts a new accumulator
 *   4. Broadcasts the tick to all clients in the stock:{symbol} room
 *
 * The gateway maintains a separate Redis subscriber connection because
 * ioredis enters subscriber mode on .subscribe() and cannot run regular
 * commands. The shared RedisClient is used for locks and cache, not pub/sub.
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { MarketRepository } from './market.repository';
import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';

interface PriceTick {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  isHalted: boolean;
  timestamp: string;
}

interface CandleAccumulator {
  stockId: string;
  symbol: string;
  interval: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: bigint;
  timestamp: Date;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class MarketGateway implements OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private redisSubscriber!: Redis;
  private candles = new Map<string, CandleAccumulator>();

  constructor(private readonly marketRepository: MarketRepository) {}

  async onModuleInit(): Promise<void> {
    const redisUrl =
      process.env.REDIS_URL || 'redis://localhost:6379';

    this.redisSubscriber = new Redis(redisUrl);

    await this.redisSubscriber.subscribe('market:prices');

  this.redisSubscriber.on('message', (channel: string, message: string) => {
  if (channel === 'market:prices') {
    this.handlePriceTick(message).catch((err) => {
      console.error('[MarketGateway] Error handling price tick:', err);
    });
  }
});

  }

  async onModuleDestroy(): Promise<void> {
    await this.redisSubscriber?.quit();
  }

  /**
   * Client requests to follow a stock's live price updates.
   * Joins the socket to the room stock:{symbol}.
   */
  @SubscribeMessage('subscribe:stock')
  handleSubscribeStock(client: Socket, { symbol }: { symbol: string }): void {
    const room = `stock:${symbol.toUpperCase()}`;
    client.join(room);
  }

  /**
   * Client requests to stop following a stock's price updates.
   * Leaves the room stock:{symbol}.
   */
  @SubscribeMessage('unsubscribe:stock')
  handleUnsubscribeStock(
    client: Socket,
    { symbol }: { symbol: string },
  ): void {
    const room = `stock:${symbol.toUpperCase()}`;
    client.leave(room);
  }

  /**
   * Processes a raw price tick from the engine.
   * Updates the database, aggregates candles, and broadcasts to clients.
   */
  private async handlePriceTick(rawMessage: string): Promise<void> {
    let tick: PriceTick;
    try {
      tick = JSON.parse(rawMessage);
    } catch {
      return;
    }

    const symbol = tick.symbol.toUpperCase();

    // Find the stock in the database
    const stock = await this.marketRepository.findStockBySymbol(symbol);
    if (!stock) return;

    // Update stock price and halt status
    await this.marketRepository.updateStockPrice(
      stock.id,
      tick.price,
      tick.isHalted,
      tick.isHalted
        ? `Circuit breaker: ${tick.changePercent >= 0 ? '+' : ''}${tick.changePercent}%`
        : undefined,
    );

    // Aggregate into 1-minute candle
    const tickDate = new Date(tick.timestamp);
    const minuteKey = `${symbol}:${this.getMinuteKey(tickDate)}`;
    const existing = this.candles.get(minuteKey);

    if (existing) {
      // Update existing accumulator
      if (tick.price > existing.high) existing.high = tick.price;
      if (tick.price < existing.low) existing.low = tick.price;
      existing.close = tick.price;
      existing.volume = existing.volume + BigInt(1);
    } else {
      // Flush any previous candles that are now in the past
      await this.flushStaleCandles(symbol, minuteKey);

      // Start new accumulator
      this.candles.set(minuteKey, {
        stockId: stock.id,
        symbol,
        interval: '1m',
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: BigInt(1),
        timestamp: new Date(Date.UTC(
  tickDate.getUTCFullYear(),
  tickDate.getUTCMonth(),
  tickDate.getUTCDate(),
  tickDate.getUTCHours(),
  tickDate.getUTCMinutes(),
  0, 0,
)),
      });
    }

    // Broadcast to stock room
    const payload = {
      symbol: tick.symbol,
      price: tick.price,
      change: tick.change,
      changePercent: tick.changePercent,
      isHalted: tick.isHalted,
      timestamp: tick.timestamp,
    };

    this.server.to(`stock:${symbol}`).emit('price:update', payload);
  }

  /**
   * Returns the minute key for a date, e.g. "2026-06-15T11:03".
   */
  private getMinuteKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}
  /**
   * Flushes candles that belong to an older minute key than the current one.
   * This prevents candles from being left in memory if no tick arrives for a
   * minute boundary (e.g., stock halted, engine pause).
   */
  private async flushStaleCandles(
    symbol: string,
    currentMinuteKey: string,
  ): Promise<void> {
    const keysToDelete: string[] = [];

    for (const [key, candle] of this.candles) {
      if (key.startsWith(symbol) && key < currentMinuteKey) {
        await this.marketRepository.createPriceCandle({
          stockId: candle.stockId,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          interval: candle.interval,
          timestamp: candle.timestamp,
        });
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.candles.delete(key);
    }
  }
}