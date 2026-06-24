/**
 * Wallet Service
 *
 * All wallet business logic — balance display, transaction history,
 * and top-up info with broker contact details.
 *
 * Read operations (balance, transactions) don't use the lock.
 * Write operations (Sprint 5) must use withWalletLock().
 *
 * All money values in integer paise. Display conversion via currency utilities.
 */

import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WalletRepository } from './wallet.repository';
import { formatCurrency } from '../../shared/utils/currency';
import { buildPageResponse  } from '../../shared/utils/paginate';
import { MARKET_CONSTANTS } from '../../shared/constants/market.constants';

@Injectable()
export class WalletService {
  constructor(private readonly walletRepository: WalletRepository) {}

  /**
   * Returns the wallet balance and summary for the authenticated user.
   */
  async getWallet(userId: string) {
    const wallet = await this.walletRepository.findWalletByUserId(userId);

    if (!wallet) {
      throw new NotFoundException({
        code: 'WALLET_NOT_FOUND',
        message: 'Wallet not found',
      });
    }

    return {
      availableBalance: wallet.availableBalance,
      reservedBalance: wallet.reservedBalance,
      totalDeposited: wallet.totalDeposited,
      displayBalance: formatCurrency(wallet.availableBalance),
    };
  }

    /**
   * Returns page-based paginated transaction history.
   *
   * @param userId - The authenticated user's ID
   * @param page - Page number (1-indexed, default 1)
   * @param limit - Items per page (default 10, max 50)
   */
  async getTransactions(userId: string, page: number = 1, limit: number = 10) {
    const wallet = await this.walletRepository.findWalletByUserId(userId);

    if (!wallet) {
      throw new NotFoundException({
        code: 'WALLET_NOT_FOUND',
        message: 'Wallet not found',
      });
    }

    const cappedLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (page - 1) * cappedLimit;

    const [transactions, totalCount] = await Promise.all([
      this.walletRepository.findTransactions(wallet.id, skip, cappedLimit),
      this.walletRepository.countTransactions(wallet.id),
    ]);

    return buildPageResponse(transactions, totalCount, page, cappedLimit);
  }

  /**
   * Returns the assigned broker's contact info and weekly top-up status.
   * If no broker is assigned or the broker is suspended, returns appropriate messaging.
   */
  async getTopupInfo(userId: string) {
    const wallet = await this.walletRepository.findWalletByUserId(userId);

    if (!wallet) {
      throw new NotFoundException({
        code: 'WALLET_NOT_FOUND',
        message: 'Wallet not found',
      });
    }

    const broker = wallet.user?.assignedBroker;

    if (!broker) {
      return {
        broker: null,
        message: 'No broker assigned. Please complete onboarding to select a broker.',
        weeklyCapPaise: MARKET_CONSTANTS.WEEKLY_TOPUP_CAP_PAISE,
        weeklyUsedPaise: 0,
        weeklyRemainingPaise: MARKET_CONSTANTS.WEEKLY_TOPUP_CAP_PAISE,
      };
    }

    if (broker.isSuspended) {
      return {
        broker: {
          displayName: broker.displayName,
          brokerNumber: broker.brokerNumber,
          email: broker.email,
          phone: broker.phone,
        },
        message:
          'Your broker is currently suspended. Contact admin@nebula.com for assistance.',
        weeklyCapPaise: MARKET_CONSTANTS.WEEKLY_TOPUP_CAP_PAISE,
        weeklyUsedPaise: 0,
        weeklyRemainingPaise: MARKET_CONSTANTS.WEEKLY_TOPUP_CAP_PAISE,
      };
    }

    const weeklyUsed = await this.walletRepository.getWeeklyTopUpTotal(userId);
    const weeklyCap = MARKET_CONSTANTS.WEEKLY_TOPUP_CAP_PAISE;
    const weeklyRemaining = Math.max(0, weeklyCap - weeklyUsed);

    return {
      broker: {
        displayName: broker.displayName,
        brokerNumber: broker.brokerNumber,
        email: broker.email,
        phone: broker.phone,
      },
      weeklyCapPaise: weeklyCap,
      weeklyUsedPaise: weeklyUsed,
      weeklyRemainingPaise: weeklyRemaining,
    };
  }
}