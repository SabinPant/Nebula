/**
 * Admin Repository
 *
 * Database access layer for admin panel operations.
 * Contains Prisma queries ONLY — zero business logic, zero validation.
 *
 * All money values are in integer paise. Display conversion happens
 * at the service layer via currency utilities.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import {
  FlagStatus,
  OrderStatus,
  Prisma,
  TopUpStatus,
  UserType,
} from '@prisma/client';
import { getStartOfWeekNepal } from '../../shared/utils/date';

export interface UserListFilters {
  userType?: UserType;
  search?: string;
}

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  private buildUserWhere(filters: UserListFilters): Prisma.UserWhereInput {
    return {
      deletedAt: null,
      ...(filters.userType ? { userType: filters.userType } : {}),
      ...(filters.search
        ? {
            OR: [
              { email: { contains: filters.search, mode: 'insensitive' } },
              { displayName: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  /**
   * Returns page-based paginated users with wallet balances and order
   * count, filtered by userType and/or a case-insensitive search on
   * email/displayName.
   */
  async findUsers(skip: number, limit: number, filters: UserListFilters) {
    return this.prisma.user.findMany({
      where: this.buildUserWhere(filters),
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        email: true,
        displayName: true,
        userType: true,
        isSuspended: true,
        suspendedReason: true,
        createdAt: true,
        assignedBrokerId: true,
        assignedBroker: { select: { id: true, displayName: true } },
        wallet: {
          select: {
            availableBalance: true,
            totalDeposited: true,
          },
        },
        _count: {
          select: { orders: true },
        },
      },
    });
  }

  /**
   * Returns the total number of users matching the given filters.
   * Used for page-based pagination to calculate totalPages.
   */
  async countUsers(filters: UserListFilters): Promise<number> {
    return this.prisma.user.count({ where: this.buildUserWhere(filters) });
  }

  /**
   * Returns a single user by ID, including their wallet and (for
   * traders) their currently assigned broker. Excludes soft-deleted
   * users. Returns null if not found.
   */
  async findUserById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        wallet: true,
        assignedBroker: { select: { id: true, displayName: true } },
      },
    });
  }

  /**
   * Returns all PENDING/PARTIALLY_FILLED orders for a user, including
   * the stock relation (needed for the cancellation transaction
   * description — see order-cancellation.helper.ts).
   */
  async findPendingOrdersByUserId(userId: string) {
    return this.prisma.order.findMany({
      where: {
        userId,
        status: { in: [OrderStatus.PENDING, OrderStatus.PARTIALLY_FILLED] },
      },
      include: { stock: { select: { symbol: true } } },
    });
  }

  /**
   * Sets isSuspended = true and the suspension reason. Must run inside
   * the same transaction as the order cancellations it accompanies.
   */
  async suspendUser(
    userId: string,
    reason: string,
    tx: Prisma.TransactionClient,
  ) {
    return tx.user.update({
      where: { id: userId },
      data: { isSuspended: true, suspendedReason: reason },
    });
  }

  /**
   * Clears isSuspended and the suspension reason.
   */
  async unsuspendUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isSuspended: false, suspendedReason: null },
    });
  }

  /**
   * Creates an audit log entry. Accepts an optional transaction client
   * so suspension's audit entry commits atomically with the rest of
   * the suspension flow.
   */
  async createAuditLog(
    data: {
      userId: string;
      action: string;
      metadata?: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        metadata: data.metadata,
      },
    });
  }

  /**
   * Returns a single trader by ID, restricted to userType TRADER.
   * Used by the top-up override to verify the target before crediting.
   * Returns null if not found, soft-deleted, or not a trader.
   */
  async findTraderById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, userType: UserType.TRADER, deletedAt: null },
    });
  }

  /**
   * Returns a single active (non-suspended) broker by ID, restricted to
   * userType BROKER. Used by reassignBroker to verify the new broker
   * before assignment. Returns null if not found, soft-deleted, not a
   * broker, or suspended.
   */
  async findActiveBrokerById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, userType: UserType.BROKER, isSuspended: false, deletedAt: null },
    });
  }

  /**
   * Updates a trader's assignedBrokerId. Caller (AdminService) has
   * already verified the trader exists and is a TRADER, and that the
   * new broker exists, is a BROKER, and is not suspended.
   */
  async reassignBroker(traderId: string, brokerId: string) {
    return this.prisma.user.update({
      where: { id: traderId },
      data: { assignedBrokerId: brokerId },
    });
  }

  /**
   * Returns the sum of COMPLETED top-ups for a trader this week.
   * Week starts Monday 00:00 Asia/Kathmandu.
   *
   * A third copy of this query — BrokerRepository and WalletRepository
   * each already have their own (CLAUDE.md describes a shared
   * shared/utils/topup.ts that was never actually created; this follows
   * the pattern that already exists rather than a broader refactor out
   * of scope for top-up oversight). Used here only to RECORD
   * weeklyTotalBefore on an override row — the admin override never
   * enforces this total against the cap.
   */
  async getWeeklyTopUpTotal(traderId: string): Promise<number> {
    const weekStart = getStartOfWeekNepal();

    const result = await this.prisma.topUpRequest.aggregate({
      where: {
        traderId,
        status: TopUpStatus.COMPLETED,
        createdAt: { gte: weekStart },
      },
      _sum: { amountPaise: true },
    });

    return result._sum.amountPaise ?? 0;
  }

  /**
   * Creates a TopUpRequest row for an admin override. TopUpRequest.brokerId/
   * paymentMethod/transactionRef/receiptUrl/receiptPublicId are all
   * NOT NULL columns designed around the broker top-up flow — there is no
   * broker or receipt for an admin override, so brokerId is set to the
   * admin's own userId (satisfies the FK, keeps @@unique([transactionRef,
   * brokerId]) meaningful — the same admin can't reuse a reference twice),
   * paymentMethod is a fixed literal, transactionRef reuses the DTO's
   * mandatory `reference`, and the receipt fields are fixed sentinels
   * (never real Cloudinary URLs, since no file was ever uploaded).
   */
  async createOverrideTopUpRequest(
    data: {
      traderId: string;
      adminId: string;
      amountPaise: number;
      reference: string;
      weeklyTotalBefore: number;
    },
    tx: Prisma.TransactionClient,
  ) {
    return tx.topUpRequest.create({
      data: {
        traderId: data.traderId,
        brokerId: data.adminId,
        amountPaise: data.amountPaise,
        paymentMethod: 'Admin Override',
        transactionRef: data.reference,
        receiptUrl: 'admin-override',
        receiptPublicId: 'admin-override',
        status: TopUpStatus.COMPLETED,
        weeklyTotalBefore: data.weeklyTotalBefore,
      },
    });
  }

  /**
   * Returns page-based paginated top-ups across ALL traders/brokers
   * (including admin overrides, which store the admin's own id as
   * brokerId), joined with trader and broker names for display.
   */
  async findAllTopUps(skip: number, limit: number) {
    return this.prisma.topUpRequest.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        trader: { select: { id: true, displayName: true, email: true } },
        broker: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  /**
   * Returns the total number of top-up requests across all traders.
   * Used for page-based pagination to calculate totalPages.
   */
  async countAllTopUps(): Promise<number> {
    return this.prisma.topUpRequest.count();
  }

  /**
   * Returns page-based paginated audit log rows across the entire system,
   * optionally filtered by action, joined with the actor User for
   * name/email display.
   *
   * AuditLog.userId is nullable (system/cron events — nothing currently
   * creates one, but the schema allows it) and there is no deletedAt
   * filter on the join: a soft-deleted actor (CLAUDE.md — never hard
   * delete users) still has a real row in the User table, so their name
   * and email are still resolvable and still shown. Only a literal NULL
   * userId produces a null actor in the mapped response — see
   * admin.service.ts's getAuditLogs for where that mapping happens.
   */
  async findAuditLogs(skip: number, limit: number, action?: string) {
    return this.prisma.auditLog.findMany({
      where: action ? { action } : {},
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  /**
   * Returns the total number of audit log rows matching the given
   * action filter (or all rows if no filter). Used for page-based
   * pagination to calculate totalPages.
   */
  async countAuditLogs(action?: string): Promise<number> {
    return this.prisma.auditLog.count({ where: action ? { action } : {} });
  }

  /**
   * Returns page-based paginated flags across ALL brokers/traders,
   * optionally filtered by status, joined with trader and broker names
   * for display — same shape as findAllTopUps above.
   */
  async findFlags(skip: number, limit: number, status?: FlagStatus) {
    return this.prisma.suspiciousFlag.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        trader: { select: { id: true, displayName: true, email: true } },
        broker: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  /**
   * Returns the total number of flags matching the given status filter
   * (or all flags if no filter). Used for page-based pagination.
   */
  async countFlags(status?: FlagStatus): Promise<number> {
    return this.prisma.suspiciousFlag.count({ where: status ? { status } : {} });
  }

  /**
   * Returns a single flag by ID, including trader/broker names — used
   * by resolveFlag to validate the flag exists and is still OPEN before
   * transitioning it.
   */
  async findFlagById(id: string) {
    return this.prisma.suspiciousFlag.findUnique({
      where: { id },
      include: {
        trader: { select: { id: true, displayName: true, email: true } },
        broker: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  /**
   * Transitions a flag to RESOLVED or DISMISSED, recording who decided,
   * when, and why. Mirrors BrokerApplication.updateStatus's shape
   * (status + reviewer + timestamp + note) for the same kind of
   * one-time admin decision on a record another actor created.
   */
  async updateFlagStatus(
    id: string,
    data: {
      status: typeof FlagStatus.RESOLVED | typeof FlagStatus.DISMISSED;
      resolvedBy: string;
      resolvedAt: Date;
      resolution: string;
    },
  ) {
    return this.prisma.suspiciousFlag.update({ where: { id }, data });
  }
}
