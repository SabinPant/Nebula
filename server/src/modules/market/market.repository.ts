/**
 * Market Repository
 *
 * Database access layer for market data operations.
 * Contains Prisma queries ONLY — zero business logic, zero validation.
 *
 * All prices are in integer paise. Display conversion happens at the service layer.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class MarketRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns all stocks with their current prices, sorted by symbol.
   */
  async findAllStocks() {
    return this.prisma.stock.findMany({
      orderBy: { symbol: 'asc' },
      select: {
        id: true,
        symbol: true,
        companyName: true,
        sector: true,
        currentPrice: true,
        previousClose: true,
        isHalted: true,
        haltReason: true,
      },
    });
  }

  /**
   * Finds a single stock by its symbol.
   * Returns null if not found.
   */
  async findStockBySymbol(symbol: string) {
    return this.prisma.stock.findUnique({
      where: { symbol },
      select: {
        id: true,
        symbol: true,
        companyName: true,
        sector: true,
        currentPrice: true,
        previousClose: true,
        volatility: true,
        drift: true,
        isHalted: true,
        haltReason: true,
      },
    });
  }

  /**
   * Updates a stock's current price and halt status.
   * Called by the gateway after each price tick from the engine.
   */
  async updateStockPrice(
    stockId: string,
    currentPrice: number,
    isHalted: boolean,
    haltReason?: string,
  ) {
    return this.prisma.stock.update({
      where: { id: stockId },
      data: {
        currentPrice,
        isHalted,
        ...(haltReason ? { haltReason } : {}),
      },
    });
  }

  /**
   * Returns historical OHLCV candles for a stock.
   *
   * @param stockId - The stock's ID
   * @param interval - Candle interval: '1m', '5m', '1h', or '1d'
   * @param limit - Maximum number of candles to return (default 100)
   */
  async findPriceHistory(
    stockId: string,
    interval: string = '1m',
    limit: number = 100,
  ) {
    return this.prisma.priceHistory.findMany({
      where: {
        stockId,
        interval,
      },
      orderBy: { timestamp: 'asc' },
      take: limit,
      select: {
        open: true,
        high: true,
        low: true,
        close: true,
        volume: true,
        timestamp: true,
      },
    });
  }

  /**
   * Creates a new price history candle.
   * Called by the gateway when a minute boundary is crossed.
   */
  async createPriceCandle(data: {
    stockId: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: bigint;
    interval: string;
    timestamp: Date;
  }) {
    return this.prisma.priceHistory.create({ data });
  }

  /**
   * Returns the user's watchlist with current stock prices.
   */
  async findWatchlist(userId: string) {
    return this.prisma.watchlistItem.findMany({
      where: { userId },
      include: {
        stock: {
          select: {
            id: true,
            symbol: true,
            companyName: true,
            currentPrice: true,
            previousClose: true,
            isHalted: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Adds a stock to a user's watchlist.
   */
  async addToWatchlist(userId: string, stockId: string) {
    return this.prisma.watchlistItem.create({
      data: { userId, stockId },
    });
  }

  /**
   * Removes a stock from a user's watchlist.
   */
  async removeFromWatchlist(userId: string, stockId: string) {
    return this.prisma.watchlistItem.deleteMany({
      where: { userId, stockId },
    });
  }

  /**
   * Finds a watchlist item by user and stock ID.
   * Returns null if not on watchlist.
   */
  async findWatchlistItem(userId: string, stockId: string) {
    return this.prisma.watchlistItem.findFirst({
      where: { userId, stockId },
    });
  }
}