/**
 * Market Service
 *
 * Business logic for market data — stock listings, price history,
 * market status, and watchlist management.
 *
 * All prices are in integer paise. Display conversion via currency utilities.
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { MarketRepository } from './market.repository';
import { isMarketOpenNow } from '../../shared/utils/date';

@Injectable()
export class MarketService {
  constructor(private readonly marketRepository: MarketRepository) {}

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