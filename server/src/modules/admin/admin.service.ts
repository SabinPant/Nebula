/**
 * Admin Service
 *
 * Business logic for the admin panel's user management: paginated user
 * listing, suspension (with order cancellation), and unsuspension.
 *
 * No try/catch — throws typed HttpExceptions, caught by the global filter.
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type Redis from 'ioredis';
import { AdminRepository, type UserListFilters } from './admin.repository';
import { TradingRepository } from '../trading/trading.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisClient } from '../../core/database/redis.client';
import { TokenStorage } from '../../shared/utils/token-storage';
import { withWalletLock } from '../../shared/utils/wallet-lock';
import { releaseAndCancelOrder } from '../trading/order-cancellation.helper';
import { buildPageResponse } from '../../shared/utils/paginate';
import { formatCurrency } from '../../shared/utils/currency';
import { ErrorCodes } from '../../shared/constants/errors';
import { OrderStyle, TransactionType, UserType } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AdminTopupDto } from './dto/admin-topup.dto';
import { z } from 'zod';

// Mirrors TradingService's CancelOrderMessageSchema exactly — same
// duplicated-by-design contract with the engine (see trading.service.ts's
// own comment on why this isn't imported instead).
const CancelOrderMessageSchema = z.object({
  orderId: z.string().min(1),
});

@Injectable()
export class AdminService {
  private readonly redis: Redis;

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly tradingRepo: TradingRepository,
    private readonly prisma: PrismaService,
    redisClient: RedisClient,
    private readonly tokenStorage: TokenStorage,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.redis = redisClient.getClient();
  }

  /**
   * Returns page-based paginated users, optionally filtered by userType
   * and/or a search term matched against email/displayName.
   */
  async getUsers(
    page: number = 1,
    limit: number = 20,
    filters: UserListFilters = {},
  ) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (safePage - 1) * safeLimit;

    const [users, totalCount] = await Promise.all([
      this.adminRepository.findUsers(skip, safeLimit, filters),
      this.adminRepository.countUsers(filters),
    ]);

    const data = users.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      userType: user.userType,
      isSuspended: user.isSuspended,
      suspendedReason: user.suspendedReason,
      createdAt: user.createdAt,
      wallet: user.wallet
        ? {
            availableBalancePaise: user.wallet.availableBalance,
            totalDepositedPaise: user.wallet.totalDeposited,
          }
        : null,
      orderCount: user._count.orders,
    }));

    return buildPageResponse(data, totalCount, safePage, safeLimit);
  }

  /**
   * Suspends a user: cancels every PENDING/PARTIALLY_FILLED order
   * (releasing reserved balance/shares for each via the same
   * release-amount logic TradingService.cancelOrder() uses — see
   * order-cancellation.helper.ts), invalidates all sessions, and writes
   * an audit log entry. All DB writes happen in one Prisma transaction
   * under one wallet lock, since every order being cancelled here
   * belongs to the same user's wallet.
   *
   * Admin (ADMIN userType) users cannot be suspended — there is no
   * suspend/unsuspend UI for the singular admin account, and CLAUDE.md's
   * admin capabilities never describe suspending admin itself.
   */
  async suspendUser(userId: string, reason: string, adminId: string) {
    const user = await this.adminRepository.findUserById(userId);
    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'User not found',
      });
    }

    if (user.userType === UserType.ADMIN) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'The admin account cannot be suspended',
      });
    }

    if (user.isSuspended) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'User is already suspended',
      });
    }

    const pendingOrders = await this.adminRepository.findPendingOrdersByUserId(userId);

    await withWalletLock(this.redis, userId, async () => {
      return this.prisma.$transaction(async (tx) => {
        // Wallet is guaranteed to exist for TRADER/BROKER users — created
        // atomically at registration (see CLAUDE.md's wallet creation rule).
        // Read inside the transaction so every release below sees a
        // consistent snapshot of the same wallet row.
        const wallet = await this.tradingRepo.findWalletByUserId(userId);

        for (const order of pendingOrders) {
          await releaseAndCancelOrder(this.tradingRepo, tx, order, wallet!.id);
        }

        await this.adminRepository.suspendUser(userId, reason, tx);

        await this.adminRepository.createAuditLog(
          {
            userId: adminId,
            action: 'USER_SUSPENDED',
            metadata: {
              targetUserId: userId,
              reason,
              cancelledOrderCount: pendingOrders.length,
            },
          },
          tx,
        );
      });
    });

    // Publish orders:cancel for each cancelled LIMIT order AFTER the
    // transaction commits — same reasoning as TradingService.cancelOrder():
    // the orders are already CANCELLED in Postgres even if a publish is
    // dropped or delayed, so there's no correctness dependency on ordering.
    // MARKET orders never enter the engine's book, so only LIMIT orders
    // among pendingOrders need forwarding.
    for (const order of pendingOrders) {
      if (order.orderStyle === OrderStyle.LIMIT) {
        await this.publishCancelToEngine(order.id);
      }
    }

    // Force re-login everywhere — a suspended user must not keep trading
    // for up to 15 more minutes on an already-issued access token. Mirrors
    // exactly what AuthService.refreshToken() already does when it
    // discovers isSuspended mid-rotation.
    await this.tokenStorage.invalidateAllUserSessions(userId);

    return {
      message: 'User suspended successfully',
      cancelledOrderCount: pendingOrders.length,
    };
  }

  /**
   * Unsuspends a user. Does not resurrect cancelled orders — CLAUDE.md is
   * explicit that cancelled orders never come back; the user simply
   * resumes trading normally from whatever wallet state they're left in.
   */
  async unsuspendUser(userId: string, adminId: string) {
    const user = await this.adminRepository.findUserById(userId);
    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'User not found',
      });
    }

    if (!user.isSuspended) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'User is not suspended',
      });
    }

    await this.adminRepository.unsuspendUser(userId);

    await this.adminRepository.createAuditLog({
      userId: adminId,
      action: 'USER_UNSUSPENDED',
      metadata: { targetUserId: userId },
    });

    return { message: 'User unsuspended successfully' };
  }

  /**
   * Returns page-based paginated top-ups across ALL traders/brokers,
   * including admin overrides (which store the admin's own id as the
   * TopUpRequest's brokerId — see admin.repository.ts's
   * createOverrideTopUpRequest for why).
   */
  async getTopUps(page: number = 1, limit: number = 20) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (safePage - 1) * safeLimit;

    const [topUps, totalCount] = await Promise.all([
      this.adminRepository.findAllTopUps(skip, safeLimit),
      this.adminRepository.countAllTopUps(),
    ]);

    const data = topUps.map((topUp) => ({
      topUpRequestId: topUp.id,
      traderId: topUp.trader.id,
      traderName: topUp.trader.displayName,
      traderEmail: topUp.trader.email,
      brokerId: topUp.broker.id,
      brokerName: topUp.broker.displayName,
      amountPaise: topUp.amountPaise,
      amountFormatted: formatCurrency(topUp.amountPaise),
      paymentMethod: topUp.paymentMethod,
      transactionRef: topUp.transactionRef,
      status: topUp.status,
      weeklyTotalBefore: topUp.weeklyTotalBefore,
      createdAt: topUp.createdAt,
    }));

    return buildPageResponse(data, totalCount, safePage, safeLimit);
  }

  /**
   * Admin override top-up: credits any amount to any trader's wallet,
   * bypassing the weekly cap entirely. A DISTINCT code path from
   * BrokerService.processTopup() — not a parameterized version of it —
   * per CLAUDE.md's admin top-up override rule: "Admin credits any
   * amount to any trader wallet. Required fields: amount + reason
   * (mandatory text) + payment reference. Entire operation logged to
   * AuditLog with adminId — no silent credits ever."
   *
   * weeklyTotalBefore is still recorded (even though the cap is never
   * checked against it) so the top-up history stays informative — an
   * admin reviewing this trader's history later can see what their
   * weekly total was at the moment of the override.
   *
   * TransactionType.MANUAL_ADJUST (not COLLATERAL_TOP_UP) marks this as
   * an admin-originated credit, distinct from a broker-processed one.
   */
  async overrideTopUp(dto: AdminTopupDto, adminId: string) {
    const trader = await this.adminRepository.findTraderById(dto.traderId);
    if (!trader) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Trader not found',
      });
    }

    const weeklyTotalBefore = await this.adminRepository.getWeeklyTopUpTotal(dto.traderId);

    const result = await withWalletLock(this.redis, dto.traderId, async () => {
      return this.prisma.$transaction(async (tx) => {
        const topUpRequest = await this.adminRepository.createOverrideTopUpRequest(
          {
            traderId: dto.traderId,
            adminId,
            amountPaise: dto.amountPaise,
            reference: dto.reference,
            weeklyTotalBefore,
          },
          tx,
        );

        const wallet = await tx.wallet.update({
          where: { userId: dto.traderId },
          data: {
            availableBalance: { increment: dto.amountPaise },
            totalDeposited: { increment: dto.amountPaise },
          },
        });

        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            type: TransactionType.MANUAL_ADJUST,
            amount: dto.amountPaise,
            description: `Admin override top-up — ${dto.reason}`,
            referenceId: topUpRequest.id,
          },
        });

        await this.adminRepository.createAuditLog(
          {
            userId: adminId,
            action: 'MANUAL_ADJUST',
            metadata: {
              targetUserId: dto.traderId,
              amountPaise: dto.amountPaise,
              reason: dto.reason,
              reference: dto.reference,
              topUpRequestId: topUpRequest.id,
            },
          },
          tx,
        );

        return { topUpRequest, wallet };
      });
    });

    // Emitted after the transaction commits, matching BrokerService's own
    // topup:credited emission (same event name, same payload shape). No
    // WebSocket gateway currently subscribes to this event for either the
    // broker or admin path — emitting here keeps both paths consistent so
    // whenever a listener is added, both start delivering automatically.
    this.eventEmitter.emit('topup:credited', {
      userId: dto.traderId,
      topUpRequestId: result.topUpRequest.id,
      amountPaise: dto.amountPaise,
      newBalancePaise: result.wallet.availableBalance,
    });

    return {
      message: 'Top-up credited successfully',
      topUpRequest: {
        id: result.topUpRequest.id,
        traderId: result.topUpRequest.traderId,
        amountPaise: result.topUpRequest.amountPaise,
        weeklyTotalBefore: result.topUpRequest.weeklyTotalBefore,
        transactionRef: result.topUpRequest.transactionRef,
        createdAt: result.topUpRequest.createdAt,
      },
      wallet: {
        availableBalancePaise: result.wallet.availableBalance,
        availableBalanceFormatted: formatCurrency(result.wallet.availableBalance),
        totalDepositedPaise: result.wallet.totalDeposited,
        totalDepositedFormatted: formatCurrency(result.wallet.totalDeposited),
      },
    };
  }

  /**
   * Returns page-based paginated audit log rows across the entire
   * system, optionally filtered by action. actorName/actorEmail are
   * null only when AuditLog.userId is literally null (a system/cron
   * event) — a soft-deleted actor's row still exists (CLAUDE.md — never
   * hard delete users) and still shows their real name/email, since
   * "who did this" should remain answerable even after the actor's
   * account is later removed.
   */
  async getAuditLogs(page: number = 1, limit: number = 20, action?: string) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (safePage - 1) * safeLimit;

    const [logs, totalCount] = await Promise.all([
      this.adminRepository.findAuditLogs(skip, safeLimit, action),
      this.adminRepository.countAuditLogs(action),
    ]);

    const data = logs.map((log) => ({
      auditLogId: log.id,
      action: log.action,
      actorUserId: log.userId,
      actorName: log.user?.displayName ?? null,
      actorEmail: log.user?.email ?? null,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      metadata: log.metadata,
      createdAt: log.createdAt,
    }));

    return buildPageResponse(data, totalCount, safePage, safeLimit);
  }

  /**
   * Publishes a cancellation request to the engine's orders:cancel
   * channel — identical message shape to TradingService's own
   * publishCancelToEngine, duplicated here for the same reason the
   * engine/server contract is duplicated everywhere else in this
   * codebase (see trading.service.ts's module docstring).
   */
  private async publishCancelToEngine(orderId: string): Promise<void> {
    const message = CancelOrderMessageSchema.parse({ orderId });
    await this.redis.publish('orders:cancel', JSON.stringify(message));
  }
}
