/**
 * Market Service
 *
 * Business logic for market data — stock listings, price history,
 * market status, watchlist management, and order book depth.
 *
 * All prices are in integer paise. Display conversion via currency utilities.
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { MarketRepository } from './market.repository';
import { RedisClient } from '../../core/database/redis.client';
import { readOrderBook, type Order } from './order-book.reader';
import { isMarketOpenNow } from '../../shared/utils/date';

@Injectable()
export class MarketService {
  private readonly redis: Redis;

  constructor(
    private readonly marketRepository: MarketRepository,
    redisClient: RedisClient,
  ) {
    this.redis = redisClient.getClient();
  }

  /**
   * Returns all stocks with their current prices.
   */
  async getStocks() {
    return this.marketRepository.findAllStocks();
  }

  /**
   * Returns a single stock by symbol.
   */
  async getStock(symbol: string) {
    const stock = await this.marketRepository.findStockBySymbol(
      symbol.toUpperCase(),
    );

    if (!stock) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Stock with symbol "${symbol.toUpperCase()}" not found`,
      });
    }

    return stock;
  }

  /**
   * Returns historical OHLCV candles for a stock.
   */
async getStockHistory(
  symbol: string,
  interval: string = '1m',
  limit: number = 100,
) {
  const stock = await this.marketRepository.findStockBySymbol(
    symbol.toUpperCase(),
  );

  if (!stock) {
    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: `Stock with symbol "${symbol.toUpperCase()}" not found`,
    });
  }

  const validIntervals = ['1m', '5m', '1h', '1d'];
  if (!validIntervals.includes(interval)) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: `Invalid interval. Must be one of: ${validIntervals.join(', ')}`,
    });
  }

  const cappedLimit = Math.min(Math.max(limit, 1), 500);

  const candles = await this.marketRepository.findPriceHistory(
    stock.id,
    interval,
    cappedLimit,
  );

  // Convert BigInt volume to number for JSON serialization
  return candles.map((candle) => ({
    ...candle,
    volume: Number(candle.volume),
  }));
}

  /**
   * Returns the live order book depth for a stock, aggregated by price
   * level — e.g. "500 shares @ Rs. 485.00 across 3 orders" rather than 3
   * separate rows for each individual order. This is business logic (an
   * aggregation over raw engine data), not a database query, so it lives
   * here rather than in the repository — order-book.reader.ts only reads
   * the raw per-order records straight out of Redis.
   *
   * Buy side sorted by price descending (highest/best bid first).
   * Sell side sorted by price ascending (lowest/best ask first).
   * Quantity per level is each order's `quantity` field as-is — per the
   * engine's own convention (see engine/src/matching-engine.ts and
   * order-book.reader.ts), `quantity` on a resting order already IS the
   * remaining/unfilled amount, decremented in place on every partial
   * fill. `filledQuantity` is a separate cumulative-fill counter for
   * settlement history — it must NOT be subtracted again here, or a
   * partially filled order's depth contribution is double-counted down
   * (undercounting real book liquidity).
   */
  async getOrderBook(symbol: string) {
    const upperSymbol = symbol.toUpperCase();

    const stock = await this.marketRepository.findStockBySymbol(upperSymbol);
    if (!stock) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Stock with symbol "${upperSymbol}" not found`,
      });
    }

    const book = await readOrderBook(this.redis, upperSymbol);

    return {
      symbol: upperSymbol,
      buy: this.aggregateByPriceLevel(book.buy, 'desc'),
      sell: this.aggregateByPriceLevel(book.sell, 'asc'),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Groups orders by price, summing each level's outstanding quantity and
   * counting how many distinct orders make it up. The input orders are
   * already in price-time priority order (readOrderBook/readBuyOrders/
   * readSellOrders guarantee this), so grouping preserves that ordering
   * for free — no need to re-sort by price after grouping, only to decide
   * ascending vs. descending direction for the final array.
   *
   * order.quantity is summed directly — NOT quantity - filledQuantity.
   * See the getOrderBook docstring above for why: quantity already IS the
   * remaining amount under the engine's convention.
   */
  private aggregateByPriceLevel(
    orders: Order[],
    direction: 'asc' | 'desc',
  ): { price: number; quantity: number; orderCount: number }[] {
    const levels = new Map<number, { quantity: number; orderCount: number }>();

    for (const order of orders) {
      const existing = levels.get(order.price);
      if (existing) {
        existing.quantity += order.quantity;
        existing.orderCount += 1;
      } else {
        levels.set(order.price, { quantity: order.quantity, orderCount: 1 });
      }
    }

    const result = Array.from(levels.entries()).map(([price, { quantity, orderCount }]) => ({
      price,
      quantity,
      orderCount,
    }));

    result.sort((a, b) => (direction === 'desc' ? b.price - a.price : a.price - b.price));

    return result;
  }

  /**
   * Returns the current market status.
   */
    getMarketStatus() {
    const isOpen = isMarketOpenNow();

    return {
      isOpen,
      message: isOpen
        ? 'Market is open'
        : 'Market closed for daily settlement — resumes at 1:00 AM Nepal time',
      timestamp: new Date().toISOString(),
    };
  }

    /**
   * Returns the current Nebula Index (average of all stock prices).
   * All values in integer paise. Client only displays — zero computation.
   */
  async getIndex() {
    const stocks = await this.marketRepository.findAllStocks();

    if (!stocks.length) {
      return {
        value: 0,
        change: 0,
        changePercent: 0,
        isUp: false,
      };
    }

    const totalCurrent = stocks.reduce((sum, s) => sum + s.currentPrice, 0);
    const totalPrevious = stocks.reduce((sum, s) => sum + s.previousClose, 0);

    const value = Math.round(totalCurrent / stocks.length);
    const previousValue = Math.round(totalPrevious / stocks.length);
    const change = value - previousValue;
    const changePercent = previousValue > 0
      ? parseFloat(((change / previousValue) * 100).toFixed(2))
      : 0;

    return {
      value,
      change,
      changePercent,
      isUp: change >= 0,
    };
  }

  /**
   * Returns the user's watchlist with current stock prices.
   */
  async getWatchlist(userId: string) {
    return this.marketRepository.findWatchlist(userId);
  }

  /**
   * Adds a stock to the user's watchlist.
   */
  async addToWatchlist(userId: string, symbol: string) {
    const stock = await this.marketRepository.findStockBySymbol(
      symbol.toUpperCase(),
    );

    if (!stock) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Stock with symbol "${symbol.toUpperCase()}" not found`,
      });
    }

    // Check if already on watchlist
    const existing = await this.marketRepository.findWatchlistItem(
      userId,
      stock.id,
    );

    if (existing) {
      throw new ConflictException({
        code: 'ALREADY_ON_WATCHLIST',
        message: `${stock.symbol} is already on your watchlist`,
      });
    }

    await this.marketRepository.addToWatchlist(userId, stock.id);

    return { message: `${stock.symbol} added to watchlist` };
  }

  /**
   * Removes a stock from the user's watchlist.
   */
  async removeFromWatchlist(userId: string, symbol: string) {
    const stock = await this.marketRepository.findStockBySymbol(
      symbol.toUpperCase(),
    );

    if (!stock) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Stock with symbol "${symbol.toUpperCase()}" not found`,
      });
    }

    await this.marketRepository.removeFromWatchlist(userId, stock.id);

    return { message: `${stock.symbol} removed from watchlist` };
  }

    async getIndexHistory(interval: string = '1m', limit: number = 30) {
    const validIntervals = ['1m', '5m', '1h', '1d'];
    if (!validIntervals.includes(interval)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Invalid interval. Must be one of: ${validIntervals.join(', ')}`,
      });
    }

    const cappedLimit = Math.min(Math.max(limit, 1), 100);
    const candles = await this.marketRepository.findAllStocksHistory(interval, cappedLimit);

    // Group candles by timestamp and compute average close
    const grouped = new Map<number, { total: number; count: number }>();

    for (const candle of candles) {
      const time = candle.timestamp.getTime();
      const existing = grouped.get(time);
      if (existing) {
        existing.total += candle.close;
        existing.count += 1;
      } else {
        grouped.set(time, { total: candle.close, count: 1 });
      }
    }

    // Convert to sorted array with average
    const result = Array.from(grouped.entries())
      .map(([time, { total, count }]) => ({
        time: Math.floor(time / 1000),
        value: Math.round(total / count) / 100, // Average paise → rupees
      }))
      .sort((a, b) => a.time - b.time);

    return result;
  }
  
}