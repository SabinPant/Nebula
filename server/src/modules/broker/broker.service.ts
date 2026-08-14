/**
 * Broker Service
 *
 * All broker application and invitation business logic.
 * Composes BrokerRepository (database), CloudinaryService (file uploads),
 * and EmailService (notifications and setup links).
 *
 * Throws typed HttpExceptions — no try/catch except for the file upload
 * where multer/Cloudinary errors need mapping to domain errors.
 */

import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrokerRepository } from './broker.repository';
import { CloudinaryService } from '../../shared/services/cloudinary.service';
import { EmailService } from '../../shared/services/email.service';
import { CreateBrokerApplicationDto } from './dto/create-broker-application.dto';
import { randomUUID, createHash } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { AuthRepository } from '../auth/auth.repository';
import { generateAccessToken, generateRefreshToken } from '../../shared/utils/tokens';
import { TokenStorage } from '../../shared/utils/token-storage';
import { hashPassword } from '../../shared/utils/crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Request } from 'express';
import {
  BrokerApplicationStatus,
  NotificationType,
  Prisma,
  TopUpStatus,
  TransactionType,
  UserType,
} from '@prisma/client';
import { BrokerSetupDto } from './dto/broker-setup.dto';
import { CreateTopupDto } from './dto/create-topup.dto';
import { CreateFlagDto } from './dto/create-flag.dto';
import { RedisClient } from '../../core/database/redis.client';
import { withWalletLock } from '../../shared/utils/wallet-lock';
import { buildPageResponse } from '../../shared/utils/paginate';
import { MARKET_CONSTANTS } from '../../shared/constants/market.constants';
import { ErrorCodes } from '../../shared/constants/errors';
import { formatCurrency } from '../../shared/utils/currency';

@Injectable()
export class BrokerService {
 constructor(
  private readonly brokerRepository: BrokerRepository,
  private readonly cloudinaryService: CloudinaryService,
  private readonly emailService: EmailService,
  private readonly configService: ConfigService,
  private readonly prisma: PrismaService,
  private readonly authRepository: AuthRepository,
  private readonly jwtService: JwtService,
  private readonly tokenStorage: TokenStorage,
  private readonly eventEmitter: EventEmitter2,
  private readonly redisClient: RedisClient,
) {}

  private clampPage(page: number): number {
    return Math.max(page, 1);
  }

  private clampLimit(limit: number): number {
    return Math.min(Math.max(limit, 1), 50);
  }

  private async assertActiveBroker(brokerId: string) {
    const broker = await this.prisma.user.findFirst({
      where: {
        id: brokerId,
        userType: UserType.BROKER,
        deletedAt: null,
      },
      select: {
        id: true,
        isSuspended: true,
      },
    });

    if (!broker) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Broker not found',
      });
    }

    if (broker.isSuspended) {
      throw new ForbiddenException({
        code: ErrorCodes.BROKER_SUSPENDED,
        message: 'This broker account is suspended',
      });
    }

    return broker;
  }

  /**
   * Submits a new broker application with document upload.
   *
   * If the email already belongs to a user account, the application is still
   * created but flagged with existingUserId — Admin sees a warning badge.
   * The applicant always receives a 200 response, never a rejection.
   */
  async submitApplication(
    dto: CreateBrokerApplicationDto,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    // Check for duplicate application by phone
    const existingApp = await this.brokerRepository.findByEmail(dto.email);
    if (existingApp) {
      throw new ConflictException({
        code: 'DUPLICATE_APPLICATION',
        message:
          'You have already submitted an application. Please wait for review.',
      });
    }

    // Check for duplicate application by phone
const existingByPhone = await this.prisma.brokerApplication.findFirst({
  where: { phone: dto.phone },
});

if (existingByPhone) {
  throw new ConflictException({
    code: 'DUPLICATE_PHONE',
    message: 'This phone number has already been used for an application.',
  });
}

    // Upload document to Cloudinary
    const uploadResult = await this.cloudinaryService.uploadFile(
      file,
      'broker-documents',
    );

    // Check if email matches an existing user account — flag for admin review
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      select: { id: true },
    });

    const application = await this.brokerRepository.createApplication({
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      dateOfBirth: dto.dateOfBirth,
      documentIdNumber: dto.documentIdNumber,
      documentUrl: uploadResult.secure_url,
      documentPublicId: uploadResult.public_id,
      reason: dto.reason,
      existingUserId: existingUser?.id,
    });


        // Send confirmation email to applicant
    await this.emailService.sendMail(
      dto.email,
      'Your Nebula Broker Application Has Been Received',
      `<p>Dear ${dto.fullName},</p>
       <p>Thank you for applying to become a broker on Nebula.</p>
       <p>Your application (Ref: ${application.id}) has been received and is currently under review. Our team will evaluate your submission and you will receive an email with the next steps within 3-5 business days.</p>
       <p>If you have any questions, please contact us at admin@nebula.com.</p>
       <p>— The Nebula Team</p>`,
    );

    // TODO: Notify admin about new application (Notification module in Sprint 13)

    return {
      statusCode: 200,
      message:
        'Application submitted successfully. You will receive an email when it has been reviewed.',
    };
  }

  async getAssignedTraders(brokerId: string) {
    const traders = await this.brokerRepository.findAssignedTraders(brokerId);

    return traders.map((trader) => ({
      traderId: trader.id,
      displayName: trader.displayName,
      email: trader.email,
      createdAt: trader.createdAt,
      orderCount: trader._count.orders,
      wallet: {
        availableBalancePaise: trader.wallet?.availableBalance ?? 0,
        availableBalanceFormatted: formatCurrency(
          trader.wallet?.availableBalance ?? 0,
        ),
        totalDepositedPaise: trader.wallet?.totalDeposited ?? 0,
        totalDepositedFormatted: formatCurrency(trader.wallet?.totalDeposited ?? 0),
      },
    }));
  }

  async getAssignedTraderDetail(brokerId: string, traderId: string) {
    const trader = await this.brokerRepository.findAssignedTraderDetail(
      brokerId,
      traderId,
    );

    if (!trader) {
      throw new ForbiddenException({
        code: ErrorCodes.BROKER_NOT_ASSIGNED,
        message: 'This trader is not assigned to your broker account',
      });
    }

    return {
      trader: {
        id: trader.id,
        displayName: trader.displayName,
        email: trader.email,
        createdAt: trader.createdAt,
      },
      wallet: trader.wallet
        ? {
            id: trader.wallet.id,
            availableBalancePaise: trader.wallet.availableBalance,
            availableBalanceFormatted: formatCurrency(
              trader.wallet.availableBalance,
            ),
            reservedBalancePaise: trader.wallet.reservedBalance,
            reservedBalanceFormatted: formatCurrency(trader.wallet.reservedBalance),
            totalDepositedPaise: trader.wallet.totalDeposited,
            totalDepositedFormatted: formatCurrency(trader.wallet.totalDeposited),
          }
        : null,
      portfolio: trader.portfolio
        ? {
            id: trader.portfolio.id,
            totalValuePaise: trader.portfolio.totalValue,
            totalValueFormatted: formatCurrency(trader.portfolio.totalValue),
            totalInvestedPaise: trader.portfolio.totalInvested,
            totalInvestedFormatted: formatCurrency(trader.portfolio.totalInvested),
            totalProfitLossPaise: trader.portfolio.totalProfitLoss,
            totalProfitLossFormatted: formatCurrency(
              trader.portfolio.totalProfitLoss,
            ),
            holdings: trader.portfolio.holdings.map((holding) => ({
              holdingId: holding.id,
              stockSymbol: holding.stock.symbol,
              companyName: holding.stock.companyName,
              quantity: holding.quantity,
              reservedQuantity: holding.reservedQuantity,
              averageBuyPricePaise: holding.averageBuyPrice,
              averageBuyPriceFormatted: formatCurrency(holding.averageBuyPrice),
              currentPricePaise: holding.stock.currentPrice,
              currentPriceFormatted: formatCurrency(holding.stock.currentPrice),
            })),
          }
        : null,
      recentOrders: trader.orders.map((order) => ({
        orderId: order.id,
        stockSymbol: order.stock.symbol,
        companyName: order.stock.companyName,
        type: order.type,
        orderStyle: order.orderStyle,
        status: order.status,
        quantity: order.quantity,
        filledQuantity: order.filledQuantity,
        pricePaise: order.price,
        priceFormatted: order.price !== null ? formatCurrency(order.price) : null,
        createdAt: order.createdAt,
      })),
    };
  }

  async processTopup(
    brokerId: string,
    dto: CreateTopupDto,
    receiptFile: { buffer: Buffer; mimetype: string; originalname: string },
    req: Request,
  ) {
    await this.assertActiveBroker(brokerId);

    const trader = await this.brokerRepository.findAssignedTraderDetail(
      brokerId,
      dto.traderId,
    );

    if (!trader) {
      throw new ForbiddenException({
        code: ErrorCodes.BROKER_NOT_ASSIGNED,
        message: 'This trader is not assigned to your broker account',
      });
    }

    if (!receiptFile) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Receipt image is required',
      });
    }

    const uploadResult = await this.cloudinaryService.uploadFile(
      receiptFile,
      'broker-receipts',
    );

    const weeklyTotalBefore = await this.brokerRepository.getWeeklyTopUpTotal(
      dto.traderId,
    );
    const weeklyTotalAfter = weeklyTotalBefore + dto.amountPaise;

    if (weeklyTotalAfter > MARKET_CONSTANTS.WEEKLY_TOPUP_CAP_PAISE) {
      throw new BadRequestException({
        code: ErrorCodes.WEEKLY_CAP_EXCEEDED,
        message: 'Weekly top-up cap exceeded for this trader',
      });
    }

    const result = await withWalletLock(
      this.redisClient.getClient(),
      dto.traderId,
      async () => {
        return this.prisma.$transaction(async (tx) => {
          const topUpRequest = await this.brokerRepository.createTopUpRequest(
            {
              traderId: dto.traderId,
              brokerId,
              amountPaise: dto.amountPaise,
              paymentMethod: dto.paymentMethod,
              transactionRef: dto.transactionRef,
              receiptUrl: uploadResult.secure_url,
              receiptPublicId: uploadResult.public_id,
              note: dto.note,
              status: TopUpStatus.COMPLETED,
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
              type: TransactionType.COLLATERAL_TOP_UP,
              amount: dto.amountPaise,
              description: `Collateral top-up via ${dto.paymentMethod}`,
              referenceId: topUpRequest.id,
            },
          });

          await this.brokerRepository.createAuditLog(
            {
              userId: brokerId,
              action: 'TOP_UP_CREDITED',
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
              metadata: {
                amountPaise: dto.amountPaise,
                traderId: dto.traderId,
                transactionRef: dto.transactionRef,
                topUpRequestId: topUpRequest.id,
              },
            },
            tx,
          );

          await tx.notification.create({
            data: {
              userId: dto.traderId,
              type: NotificationType.TOP_UP_CREDITED,
              title: 'Collateral top-up credited',
              message: `Rs. ${(dto.amountPaise / 100).toFixed(2)} has been added to your wallet.`,
              data: {
                topUpRequestId: topUpRequest.id,
                brokerId,
                amountPaise: dto.amountPaise,
                newBalancePaise: wallet.availableBalance,
              } as Prisma.InputJsonValue,
            },
          });

          const adminUsers = await tx.user.findMany({
            where: {
              userType: UserType.ADMIN,
              deletedAt: null,
            },
            select: { id: true },
          });

          await Promise.all(
            adminUsers.map((admin) =>
              tx.notification.create({
                data: {
                  userId: admin.id,
                  type: NotificationType.SYSTEM,
                  title: 'Broker top-up processed',
                  message: `Broker ${brokerId} credited trader ${dto.traderId} with Rs. ${(dto.amountPaise / 100).toFixed(2)}.`,
                  data: {
                    topUpRequestId: topUpRequest.id,
                    brokerId,
                    traderId: dto.traderId,
                    amountPaise: dto.amountPaise,
                  } as Prisma.InputJsonValue,
                },
              }),
            ),
          );

          return {
            topUpRequest,
            wallet,
          };
        });
      },
    );

    this.eventEmitter.emit('topup:credited', {
      userId: dto.traderId,
      brokerId,
      topUpRequestId: result.topUpRequest.id,
      amountPaise: dto.amountPaise,
      newBalancePaise: result.wallet.availableBalance,
    });

    return {
      message: 'Top-up credited successfully',
      topUpRequest: {
        id: result.topUpRequest.id,
        traderId: result.topUpRequest.traderId,
        brokerId: result.topUpRequest.brokerId,
        amountPaise: result.topUpRequest.amountPaise,
        weeklyTotalBefore: result.topUpRequest.weeklyTotalBefore,
        weeklyTotalAfter,
        transactionRef: result.topUpRequest.transactionRef,
        paymentMethod: result.topUpRequest.paymentMethod,
        receiptUrl: result.topUpRequest.receiptUrl,
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

  async getTopupHistory(brokerId: string, page: number, limit: number) {
    const safePage = this.clampPage(page);
    const safeLimit = this.clampLimit(limit);
    const { data, totalCount } = await this.brokerRepository.findTopUpsByBrokerId(
      brokerId,
      safePage,
      safeLimit,
    );

    const mapped = data.map((topUp) => ({
      topUpRequestId: topUp.id,
      traderName: topUp.trader.displayName,
      traderEmail: topUp.trader.email,
      amountPaise: topUp.amountPaise,
      amountFormatted: formatCurrency(topUp.amountPaise),
      paymentMethod: topUp.paymentMethod,
      transactionRef: topUp.transactionRef,
      status: topUp.status,
      weeklyTotalBefore: topUp.weeklyTotalBefore,
      createdAt: topUp.createdAt,
    }));

    return buildPageResponse(mapped, totalCount, safePage, safeLimit);
  }

  async createFlag(brokerId: string, dto: CreateFlagDto) {
    const trader = await this.brokerRepository.findAssignedTraderDetail(
      brokerId,
      dto.traderId,
    );

    if (!trader) {
      throw new ForbiddenException({
        code: ErrorCodes.BROKER_NOT_ASSIGNED,
        message: 'This trader is not assigned to your broker account',
      });
    }

    const flag = await this.prisma.$transaction(async (tx) => {
      const createdFlag = await this.brokerRepository.createFlag(
        {
          traderId: dto.traderId,
          brokerId,
          reason: dto.reason,
          note: dto.note,
          status: 'OPEN',
        },
        tx,
      );

      await this.brokerRepository.createAuditLog(
        {
          userId: brokerId,
          action: 'ACCOUNT_FLAGGED',
          metadata: {
            traderId: dto.traderId,
            flagId: createdFlag.id,
            reason: dto.reason,
          },
        },
        tx,
      );

      return createdFlag;
    });

    return flag;
  }

  async getFlagHistory(brokerId: string, page: number, limit: number) {
    const safePage = this.clampPage(page);
    const safeLimit = this.clampLimit(limit);
    const { data, totalCount } = await this.brokerRepository.findFlagsByBrokerId(
      brokerId,
      safePage,
      safeLimit,
    );

    const mapped = data.map((flag) => ({
      flagId: flag.id,
      traderName: flag.trader.displayName,
      traderEmail: flag.trader.email,
      reason: flag.reason,
      note: flag.note,
      status: flag.status,
      createdAt: flag.createdAt,
      resolvedAt: flag.resolvedAt,
      resolution: flag.resolution,
    }));

    return buildPageResponse(mapped, totalCount, safePage, safeLimit);
  }

  async getActivityHistory(brokerId: string, page: number, limit: number) {
    const safePage = this.clampPage(page);
    const safeLimit = this.clampLimit(limit);
    const { data, totalCount } = await this.brokerRepository.findAuditLogsByBrokerId(
      brokerId,
      safePage,
      safeLimit,
    );

    const mapped = data.map((entry) => ({
      auditLogId: entry.id,
      action: entry.action,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      metadata: entry.metadata,
      createdAt: entry.createdAt,
    }));

    return buildPageResponse(mapped, totalCount, safePage, safeLimit);
  }

  /**
   * Returns all broker applications, optionally filtered by status.
   * Admin-only — used by the Admin panel's application review queue.
   * Not paginated: application volume is low enough (manual review,
   * one at a time) that a flat list matches every other Admin table
   * in this codebase that doesn't yet need page-based pagination.
   */
  async getAllApplications(status?: BrokerApplicationStatus) {
    const applications = await this.brokerRepository.findAll(status);

    return applications.map((application) => ({
      applicationId: application.id,
      fullName: application.fullName,
      email: application.email,
      phone: application.phone,
      status: application.status,
      existingUserId: application.existingUserId,
      adminNote: application.adminNote,
      createdAt: application.createdAt,
      reviewedAt: application.reviewedAt,
    }));
  }

  /**
   * Checks the status of a broker application by email.
   */
  async checkStatus(email: string) {
    const application = await this.brokerRepository.findByEmail(email);

    if (!application) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'No application found for this email',
      });
    }

    return {
      status: application.status,
      submittedAt: application.createdAt,
      reviewedAt: application.reviewedAt,
      adminNote: application.adminNote,
    };
  }

  /**
   * Approves a broker application and sends a setup invitation.
   */
  async approveApplication(
    applicationId: string,
    adminId: string,
    brokerNumber: string,
    adminNote?: string,
  ) {
    const application = await this.brokerRepository.findById(applicationId);

    if (!application) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Application not found',
      });
    }

    if (application.status !== 'PENDING') {
      throw new BadRequestException({
        code: 'APPLICATION_ALREADY_REVIEWED',
        message: 'This application has already been reviewed',
      });
    }

    // Generate invitation token
    const token = randomUUID();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    // Create invitation
    await this.brokerRepository.createInvitation({
      userId: adminId,
      email: application.email,
      brokerNumber,
      tokenHash,
      expiresAt,
    });

    // Update application status
    await this.brokerRepository.updateStatus(applicationId, {
      status: 'APPROVED',
      adminNote: adminNote || 'Approved',
      reviewedBy: adminId,
      reviewedAt: new Date(),
    });

    // Send setup email
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    await this.emailService.sendMail(
      application.email,
      'Your Nebula Broker Application Has Been Approved',
      `<p>Congratulations! Your application to become a broker has been approved.</p>
       <p><a href="${frontendUrl}/broker-setup?token=${token}">Set up your broker account</a></p>
       <p>This link expires in 48 hours.</p>`,
    );

    return { message: 'Application approved. Setup link sent.' };
  }

  /**
   * Rejects a broker application.
   */
  async rejectApplication(
    applicationId: string,
    adminId: string,
    adminNote: string,
  ) {
    const application = await this.brokerRepository.findById(applicationId);

    if (!application) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Application not found',
      });
    }

    if (application.status !== 'PENDING') {
      throw new BadRequestException({
        code: 'APPLICATION_ALREADY_REVIEWED',
        message: 'This application has already been reviewed',
      });
    }

    await this.brokerRepository.updateStatus(applicationId, {
      status: 'REJECTED',
      adminNote,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    });

    await this.emailService.sendMail(
      application.email,
      'Your Nebula Broker Application Status',
      `<p>Thank you for your interest in becoming a broker on Nebula.</p>
       <p>After careful review, we are unable to approve your application at this time.</p>
       <p>Reason: ${adminNote}</p>`,
    );

    return { message: 'Application rejected.' };
  }

    /**
   * Completes broker account setup via invitation token.
   *
   * Two paths:
   * 1. New broker — creates user with BROKER type, wallet, and atomic deposit
   * 2. Existing trader upgrade — upgrades userType to BROKER, sets brokerNumber
   *
   * Both paths set the password and return JWT tokens so the broker is
   * immediately logged in.
   */
  async setupBroker(dto: BrokerSetupDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const invitation = await this.brokerRepository.findInvitationByHash(tokenHash);

    if (!invitation) {
      throw new BadRequestException({
        code: 'INVALID_INVITATION_TOKEN',
        message: 'This setup link is invalid',
      });
    }

    if (invitation.usedAt) {
      throw new BadRequestException({
        code: 'INVITATION_ALREADY_USED',
        message: 'This setup link has already been used',
      });
    }

    if (new Date() > invitation.expiresAt) {
      throw new BadRequestException({
        code: 'INVALID_INVITATION_TOKEN',
        message: 'This setup link has expired',
      });
    }

    // Find the approved application for this email
    const application = await this.brokerRepository.findByEmail(invitation.email);

    if (!application || application.status !== 'APPROVED') {
      throw new BadRequestException({
        code: 'INVALID_INVITATION_TOKEN',
        message: 'No approved application found for this invitation',
      });
    }

    const hashedPassword = await hashPassword(dto.password);
    let user: { id: string; email: string; displayName: string | null; userType: string; isOnboardingComplete: boolean };

    if (application.existingUserId) {
      // Path 1: Upgrade existing trader to BROKER (atomic)
      await this.brokerRepository.upgradeToBroker(
        application.existingUserId,
        invitation.brokerNumber,
        hashedPassword,
      );

      const updatedUser = await this.prisma.user.findUnique({
        where: { id: application.existingUserId },
      });

      user = {
        id: updatedUser!.id,
        email: updatedUser!.email,
        displayName: updatedUser!.displayName,
        userType: updatedUser!.userType,
        isOnboardingComplete: true,
      };
    } else {
      // Path 2: Create new BROKER user with wallet
      const newUser = await this.authRepository.createUserWithWallet(
        {
          email: application.email,
          password: hashedPassword,
          displayName: application.fullName,
          userType: UserType.BROKER,
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
          isOnboardingComplete: true,
          brokerNumber: invitation.brokerNumber,
          phone: application.phone,
        },
        {
          availableBalance: 0,
          totalDeposited: 0,
        },
        {
          type: TransactionType.INITIAL_DEPOSIT,
          amount: 0,
          description: 'Broker account — no virtual balance',
        },
      );

      user = {
        id: newUser.id,
        email: newUser.email,
        displayName: newUser.displayName,
        userType: newUser.userType,
        isOnboardingComplete: true,
      };
    }

    // Mark invitation as used
    await this.brokerRepository.markInvitationUsed(invitation.id);

    // Link application to user
    await this.brokerRepository.linkUser(application.id, user.id);

    // Generate JWT tokens
    const accessToken = generateAccessToken(this.jwtService, this.configService, {
      sub: user.id,
      email: user.email,
      userType: user.userType,
    });

    const refreshToken = generateRefreshToken(this.jwtService, this.configService, {
      sub: user.id,
      deviceId: dto.deviceId,
    });

    await this.tokenStorage.storeRefreshToken(user.id, dto.deviceId, refreshToken);

    return {
      accessToken,
      refreshToken,
      user,
    };
  }

}