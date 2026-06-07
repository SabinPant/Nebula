/**
 * Auth Repository
 *
 * Database access layer for authentication operations.
 * Contains Prisma queries ONLY — zero business logic, zero validation,
 * zero password hashing, zero token generation.
 *
 * Every method does exactly one database operation and returns plain data.
 * The service layer calls these methods and composes them into business flows.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { Prisma, UserType } from '@prisma/client';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds a user by email. Returns null if not found.
   * Used by login, registration duplicate check, forgot password.
   */
  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Finds a user by ID. Returns null if not found.
   * Used by JWT strategy to load user from token payload.
   */
  async findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Creates a new user with an atomic wallet and initial deposit transaction.
   * All three operations succeed or fail together — no partial state.
   *
   * @param data - User fields (email, password hash, displayName, userType)
   * @param walletData - Initial wallet state (availableBalance, totalDeposited)
   * @param transactionData - Initial transaction record (INITIAL_DEPOSIT)
   */
  async createUserWithWallet(
    data: Prisma.UserCreateInput,
    walletData: { availableBalance: number; totalDeposited: number },
    transactionData: { type: string; amount: number; description: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data });

      const wallet = await tx.wallet.create({
        data: {
          userId: user.id,
          availableBalance: walletData.availableBalance,
          totalDeposited: walletData.totalDeposited,
        },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: transactionData.type as any,
          amount: transactionData.amount,
          description: transactionData.description,
        },
      });

      return user;
    });
  }

  /**
   * Marks a user's email as verified.
   */
  async verifyUserEmail(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });
  }

  /**
   * Updates a user's password hash.
   */
  async updatePassword(userId: string, hashedPassword: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }

  /**
   * Assigns a broker to a trader and marks onboarding as complete.
   */
  async completeOnboarding(userId: string, brokerId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        assignedBrokerId: brokerId,
        isOnboardingComplete: true,
      },
    });
  }

  /**
   * Finds all active (non-suspended) broker users for the onboarding selection list.
   */
  async findActiveBrokers() {
    return this.prisma.user.findMany({
      where: {
        userType: UserType.BROKER,
        isSuspended: false,
        deletedAt: null,
      },
      select: {
        id: true,
        displayName: true,
        brokerNumber: true,
        email: true,
        _count: {
          select: { assignedTraders: true },
        },
      },
    });
  }
}