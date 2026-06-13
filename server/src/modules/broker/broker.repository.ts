/**
 * Broker Repository
 *
 * Database access layer for broker applications and invitations.
 * Contains Prisma queries ONLY — zero business logic, zero validation.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { BrokerApplicationStatus } from '@prisma/client';

@Injectable()
export class BrokerRepository {
  constructor(private readonly prisma: PrismaService) {}

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
  async upgradeToBroker(userId: string, brokerNumber: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        userType: 'BROKER',
        brokerNumber,
        isFirstLogin: false,
      },
    });
  }
}