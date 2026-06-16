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
import { isMarketOpenNow, formatNepalTime } from '../../shared/utils/date';
import { MARKET_CONSTANTS } from '../../shared/constants/market.constants';

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

    return this.marketRepository.findPriceHistory(
      stock.id,
      interval,
      cappedLimit,
    );
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
        : 'Market is closed',
      timestamp: new Date().toISOString(),
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
}