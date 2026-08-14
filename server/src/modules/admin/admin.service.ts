/**
 * Admin Service
 *
 * Business logic for the admin panel: paginated user listing, suspension
 * (with order cancellation) and unsuspension, top-up oversight and override,
 * system-wide audit log, suspicious-flag review (resolve/dismiss), and a
 * read-only system status snapshot.
 *
 * No try/catch except getEngineStatus's DB/Redis pings (see its own
 * docstring) — every other method throws typed HttpExceptions, caught by
 * the global filter.
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type Redis from 'ioredis';
import { AdminRepository, type UserListFilters } from './admin.repository';
import { TradingRepository } from '../trading/trading.repository';
import { EngineHealthService } from '../trading/engine-health.service';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisClient } from '../../core/database/redis.client';
import { TokenStorage } from '../../shared/utils/token-storage';
import { withWalletLock } from '../../shared/utils/wallet-lock';
import { releaseAndCancelOrder } from '../trading/order-cancellation.helper';
import { buildPageResponse } from '../../shared/utils/paginate';
import { formatCurrency } from '../../shared/utils/currency';
import { ErrorCodes } from '../../shared/constants/errors';
import { FlagStatus, OrderStyle, TransactionType, UserType } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AdminTopupDto } from './dto/admin-topup.dto';
import type { ResolveFlagDto } from './dto/resolve-flag.dto';
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
    private readonly engineHealthService: EngineHealthService,
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
   * Returns page-based paginated flags across ALL brokers/traders,
   * optionally filtered by status.
   */
  async getFlags(page: number = 1, limit: number = 20, status?: FlagStatus) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (safePage - 1) * safeLimit;

    const [flags, totalCount] = await Promise.all([
      this.adminRepository.findFlags(skip, safeLimit, status),
      this.adminRepository.countFlags(status),
    ]);

    const data = flags.map((flag) => ({
      flagId: flag.id,
      traderId: flag.trader.id,
      traderName: flag.trader.displayName,
      traderEmail: flag.trader.email,
      brokerId: flag.broker.id,
      brokerName: flag.broker.displayName,
      brokerEmail: flag.broker.email,
      reason: flag.reason,
      note: flag.note,
      status: flag.status,
      resolvedBy: flag.resolvedBy,
      resolvedAt: flag.resolvedAt,
      resolution: flag.resolution,
      createdAt: flag.createdAt,
    }));

    return buildPageResponse(data, totalCount, safePage, safeLimit);
  }

  /**
   * Resolves or dismisses an OPEN flag: records the admin's decision
   * (status, resolution note, who, when) and writes an audit log entry.
   * Only OPEN flags can be transitioned — a flag already RESOLVED or
   * DISMISSED cannot be re-decided, matching the same one-time-review
   * shape as BrokerService.approveApplication/rejectApplication's
   * APPLICATION_ALREADY_REVIEWED guard on BrokerApplication.status.
   *
   * Action name is derived from the target status (FLAG_RESOLVED or
   * FLAG_DISMISSED) rather than a single generic FLAG_REVIEWED, so the
   * audit log and its action filter dropdown can distinguish the two
   * outcomes at a glance — consistent with USER_SUSPENDED/USER_UNSUSPENDED
   * being separate actions rather than one USER_STATUS_CHANGED.
   */
  async resolveFlag(flagId: string, adminId: string, dto: ResolveFlagDto) {
    const flag = await this.adminRepository.findFlagById(flagId);
    if (!flag) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Flag not found',
      });
    }

    if (flag.status !== FlagStatus.OPEN) {
      throw new BadRequestException({
        code: 'FLAG_ALREADY_RESOLVED',
        message: 'This flag has already been reviewed',
      });
    }

    const resolvedAt = new Date();

    await this.adminRepository.updateFlagStatus(flagId, {
      status: dto.status,
      resolvedBy: adminId,
      resolvedAt,
      resolution: dto.resolution,
    });

    await this.adminRepository.createAuditLog({
      userId: adminId,
      action: dto.status === FlagStatus.RESOLVED ? 'FLAG_RESOLVED' : 'FLAG_DISMISSED',
      metadata: {
        flagId,
        traderId: flag.traderId,
        brokerId: flag.brokerId,
        resolution: dto.resolution,
      },
    });

    return { message: `Flag ${dto.status.toLowerCase()} successfully` };
  }

  /**
   * Returns a read-only system status snapshot for the Admin dashboard:
   * engine health (from the same cached EngineHealthService the order-
   * placement gate reads — never a second live poll of the engine),
   * plus a quick direct DB/Redis ping. Mirrors HealthController's own
   * ping pattern (`SELECT 1` / `.ping()`, each wrapped so a failure
   * degrades to false rather than throwing) — this is deliberately the
   * one place in AdminService with try/catch, for the same reason
   * HealthController has it: an infra reachability check, not domain
   * business logic, so a failed ping is data to report, not an error to
   * propagate as a 500.
   *
   * tradingHalted is always false for now — there is no admin engine
   * start/stop control yet (CLAUDE.md's Sprint 13 admin engine controls
   * are POST /admin/engine/start|stop, explicitly out of scope here).
   * The field stays in the response shape so the frontend and any
   * future start/stop feature don't need a breaking response change.
   */
  async getEngineStatus() {
    let dbConnected = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    let redisConnected = false;
    try {
      await this.redis.ping();
      redisConnected = true;
    } catch {
      redisConnected = false;
    }

    const lastChecked = this.engineHealthService.getLastCheckedAt();

    return {
      engineUp: this.engineHealthService.isEngineUp(),
      dbConnected,
      redisConnected,
      lastChecked: lastChecked ? lastChecked.toISOString() : null,
      tradingHalted: false,
    };
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
