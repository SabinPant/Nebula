/**
 * Broker Repository
 *
 * Database access layer for broker applications, invitations, and broker
 * dashboard queries.
 * Contains Prisma queries ONLY — zero business logic, zero validation.
 */

import { Injectable } from '@nestjs/common';
import {
  BrokerApplicationStatus,
  FlagStatus,
  Prisma,
  TopUpStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { getStartOfWeekNepal } from '../../shared/utils/date';

@Injectable()
export class BrokerRepository {
  constructor(private readonly prisma: PrismaService) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  /**
   * Creates a new broker application.
   */
  async createApplication(data: {
    fullName: string;
    email: string;
    phone: string;
    dateOfBirth: Date;
    documentIdNumber: string;
    documentUrl: string;
    documentPublicId: string;
    reason: string;
    existingUserId?: string;
  }) {
    return this.prisma.brokerApplication.create({ data });
  }

  /**
   * Finds a broker application by email.
   */
  async findByEmail(email: string) {
    return this.prisma.brokerApplication.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Finds a broker application by ID.
   */
  async findById(id: string) {
    return this.prisma.brokerApplication.findUnique({ where: { id } });
  }

  /**
   * Finds all broker applications with optional status filter.
   */
  async findAll(status?: BrokerApplicationStatus) {
    return this.prisma.brokerApplication.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Updates a broker application's status and review details.
   */
  async updateStatus(
    id: string,
    data: {
      status: 'APPROVED' | 'REJECTED';
      adminNote: string;
      reviewedBy: string;
      reviewedAt: Date;
    },
  ) {
    return this.prisma.brokerApplication.update({ where: { id }, data });
  }

  /**
   * Links a broker application to a user account after approval.
   */
  async linkUser(id: string, userId: string) {
    return this.prisma.brokerApplication.update({
      where: { id },
      data: { userId },
    });
  }

  /**
   * Creates a broker invitation with hashed token.
   */
  async createInvitation(data: {
    userId: string;
    email: string;
    brokerNumber: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.brokerInvitation.create({ data });
  }

  /**
   * Finds an invitation by token hash.
   */
  async findInvitationByHash(tokenHash: string) {
    return this.prisma.brokerInvitation.findUnique({
      where: { tokenHash },
    });
  }

  /**
   * Marks an invitation as used.
   */
  async markInvitationUsed(id: string) {
    return this.prisma.brokerInvitation.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  /**
   * Upgrades an existing user to BROKER type.
   */
  async upgradeToBroker(
    userId: string,
    brokerNumber: string,
    password: string,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        userType: UserType.BROKER,
        brokerNumber,
        password,
        isFirstLogin: false,
      },
    });
  }

  // ─── Broker Dashboard Reads ──────────────────────────────────────────────

  async findAssignedTraders(brokerId: string) {
    return this.prisma.user.findMany({
      where: {
        assignedBrokerId: brokerId,
        userType: UserType.TRADER,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        displayName: true,
        email: true,
        createdAt: true,
        wallet: {
          select: {
            availableBalance: true,
            totalDeposited: true,
          },
        },
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });
  }

  async findAssignedTraderDetail(brokerId: string, traderId: string) {
    return this.prisma.user.findFirst({
      where: {
        id: traderId,
        assignedBrokerId: brokerId,
        userType: UserType.TRADER,
        deletedAt: null,
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        createdAt: true,
        wallet: true,
        portfolio: {
          select: {
            id: true,
            totalValue: true,
            totalInvested: true,
            totalProfitLoss: true,
            holdings: {
              select: {
                id: true,
                quantity: true,
                reservedQuantity: true,
                averageBuyPrice: true,
                stock: {
                  select: {
                    symbol: true,
                    companyName: true,
                    currentPrice: true,
                  },
                },
              },
            },
          },
        },
        orders: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            type: true,
            orderStyle: true,
            status: true,
            quantity: true,
            filledQuantity: true,
            price: true,
            createdAt: true,
            stock: {
              select: {
                symbol: true,
                companyName: true,
              },
            },
          },
        },
      },
    });
  }

  async getWeeklyTopUpTotal(traderId: string): Promise<number> {
    const weekStart = getStartOfWeekNepal();

    const result = await this.prisma.topUpRequest.aggregate({
      where: {
        traderId,
        status: TopUpStatus.COMPLETED,
        createdAt: {
          gte: weekStart,
        },
      },
      _sum: {
        amountPaise: true,
      },
    });

    return result._sum.amountPaise ?? 0;
  }

  async createTopUpRequest(
    data: {
      traderId: string;
      brokerId: string;
      amountPaise: number;
      paymentMethod: string;
      transactionRef: string;
      receiptUrl: string;
      receiptPublicId: string;
      note?: string | null;
      status: TopUpStatus;
      weeklyTotalBefore: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = this.getClient(tx);
    return client.topUpRequest.create({ data });
  }

  async findTopUpsByBrokerId(brokerId: string, page: number, limit: number) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (safePage - 1) * safeLimit;

    const [data, totalCount] = await Promise.all([
      this.prisma.topUpRequest.findMany({
        where: { brokerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        include: {
          trader: {
            select: {
              displayName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.topUpRequest.count({ where: { brokerId } }),
    ]);

    return { data, totalCount };
  }

  async createFlag(
    data: {
      traderId: string;
      brokerId: string;
      reason: string;
      note?: string | null;
      status?: FlagStatus;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = this.getClient(tx);
    return client.suspiciousFlag.create({
      data: {
        ...data,
        status: data.status ?? FlagStatus.OPEN,
      },
    });
  }

  async findFlagsByBrokerId(brokerId: string, page: number, limit: number) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (safePage - 1) * safeLimit;

    const [data, totalCount] = await Promise.all([
      this.prisma.suspiciousFlag.findMany({
        where: { brokerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        include: {
          trader: {
            select: {
              displayName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.suspiciousFlag.count({ where: { brokerId } }),
    ]);

    return { data, totalCount };
  }

  async createAuditLog(
    data: {
      userId: string;
      action: string;
      ipAddress?: string | null;
      userAgent?: string | null;
      metadata?: Prisma.InputJsonValue | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = this.getClient(tx);
    return client.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        ipAddress: data.ipAddress ?? undefined,
        userAgent: data.userAgent ?? undefined,
        metadata: data.metadata ?? Prisma.JsonNull,
      },
    });
  }

  async findAuditLogsByBrokerId(brokerId: string, page: number, limit: number) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (safePage - 1) * safeLimit;

    const [data, totalCount] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { userId: brokerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.auditLog.count({ where: { userId: brokerId } }),
    ]);

    return { data, totalCount };
  }
}