/**
 * Portfolio Service
 *
 * Business logic for portfolio — P&L calculations, holdings display.
 * All P&L is calculated from live stock.currentPrice on every request.
 * No caching, no pre-computation — always accurate to the latest tick.
 *
 * All money values are in integer paise. Display conversion via currency utilities.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PortfolioRepository } from './portfolio.repository';
import { formatCurrency } from '../../shared/utils/currency';

@Injectable()
export class PortfolioService {
  constructor(private readonly portfolioRepository: PortfolioRepository) {}

  /**
   * Returns the full portfolio with live P&L per holding and summary totals.
   */
  async getPortfolio(userId: string) {
    const portfolio = await this.portfolioRepository.findPortfolioWithHoldings(userId);

    if (!portfolio) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Portfolio not found. Start trading to create your portfolio.',
      });
    }
   
    const activeHoldings = portfolio.holdings.filter((h) => h.quantity > 0);
        const holdings = activeHoldings.map((h) => {
      const invested = h.quantity * h.averageBuyPrice;
      const currentValue = h.quantity * h.stock.currentPrice;
      const unrealizedPnl = currentValue - invested;
      const unrealizedPnlPercent =
        invested > 0 ? parseFloat(((unrealizedPnl / invested) * 100).toFixed(2)) : 0;
      const dayChange = h.quantity * (h.stock.currentPrice - h.stock.previousClose);
      const dayChangePercent =
        h.stock.previousClose > 0
          ? parseFloat(
              (((h.stock.currentPrice - h.stock.previousClose) / h.stock.previousClose) * 100).toFixed(2),
            )
          : 0;

      return {
        id: h.id,
        stockId: h.stock.id,
        symbol: h.stock.symbol,
        companyName: h.stock.companyName,
        sector: h.stock.sector,
        quantity: h.quantity,
        reservedQuantity: h.reservedQuantity,
        averageBuyPrice: h.averageBuyPrice,
        currentPrice: h.stock.currentPrice,
        previousClose: h.stock.previousClose,
        isHalted: h.stock.isHalted,
        invested,
        currentValue,
        unrealizedPnl,
        unrealizedPnlPercent,
        dayChange,
        dayChangePercent,
        displayInvested: formatCurrency(invested),
        displayCurrentValue: formatCurrency(currentValue),
        displayPnl: formatCurrency(unrealizedPnl),
        displayAverageBuyPrice: formatCurrency(h.averageBuyPrice),
        displayCurrentPrice: formatCurrency(h.stock.currentPrice),
      };
    });

    const totalInvested = holdings.reduce((sum, h) => sum + h.invested, 0);
    const totalCurrentValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
    const totalPnl = totalCurrentValue - totalInvested;
    const totalPnlPercent =
      totalInvested > 0 ? parseFloat(((totalPnl / totalInvested) * 100).toFixed(2)) : 0;
    const totalDayChange = holdings.reduce((sum, h) => sum + h.dayChange, 0);

    return {
      summary: {
        totalInvested,
        totalCurrentValue,
        totalPnl,
        totalPnlPercent,
        totalDayChange,
        holdingsCount: holdings.length,
        displayTotalInvested: formatCurrency(totalInvested),
        displayTotalValue: formatCurrency(totalCurrentValue),
        displayTotalPnl: formatCurrency(totalPnl),
        displayTotalDayChange: formatCurrency(totalDayChange),
      },
      holdings,
    };
  }

  /**
   * Returns just the holdings list with live P&L (no portfolio summary).
   */
  async getHoldings(userId: string) {
    const holdings = await this.portfolioRepository.findHoldingsByUserId(userId);

    return holdings.map((h) => {
      const invested = h.quantity * h.averageBuyPrice;
      const currentValue = h.quantity * h.stock.currentPrice;
      const unrealizedPnl = currentValue - invested;
      const unrealizedPnlPercent =
        invested > 0 ? parseFloat(((unrealizedPnl / invested) * 100).toFixed(2)) : 0;

      return {
        id: h.id,
        stockId: h.stock.id,
        symbol: h.stock.symbol,
        companyName: h.stock.companyName,
        sector: h.stock.sector,
        quantity: h.quantity,
        reservedQuantity: h.reservedQuantity,
        averageBuyPrice: h.averageBuyPrice,
        currentPrice: h.stock.currentPrice,
        isHalted: h.stock.isHalted,
        invested,
        currentValue,
        unrealizedPnl,
        unrealizedPnlPercent,
        displayInvested: formatCurrency(invested),
        displayCurrentValue: formatCurrency(currentValue),
        displayPnl: formatCurrency(unrealizedPnl),
        displayAverageBuyPrice: formatCurrency(h.averageBuyPrice),
        displayCurrentPrice: formatCurrency(h.stock.currentPrice),
      };
    });
  }
}