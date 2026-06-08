/**
 * Auth Service
 *
 * All authentication business logic lives here.
 * Composes AuthRepository (database), crypto utilities (password hashing),
 * token utilities (JWT generation), and EmailService (verification/reset emails).
 *
 * Controllers call these methods — they handle HTTP and nothing else.
 * This service throws typed HttpExceptions for every error case.
 * No try/catch — the global exception filter handles everything.
 */

import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthRepository } from './auth.repository';
import { EmailService } from '../../shared/services/email.service';
import { hashPassword, comparePassword } from '../../shared/utils/crypto';
import { generateAccessToken, generateRefreshToken } from '../../shared/utils/tokens';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserType } from '@prisma/client';
import { TokenStorage } from '../../shared/utils/token-storage';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenStorage: TokenStorage,

  ) {}

  /**
   * Registers a new trader.
   * Creates user + wallet + initial deposit transaction atomically.
   * Sends verification email.
   */
  async register(dto: RegisterDto) {
  const existing = await this.authRepository.findUserByEmail(dto.email);
  if (existing) {
    throw new ConflictException({
      code: 'EMAIL_ALREADY_EXISTS',
      message: 'An account with this email already exists',
    });
  }

  const hashed = await hashPassword(dto.password);

  const user = await this.authRepository.createUserWithWallet(
    {
      email: dto.email,
      password: hashed,
      displayName: dto.displayName,
      userType: UserType.TRADER,
    },
    {
      availableBalance: 5_000_000,
      totalDeposited: 5_000_000,
    },
    {
      type: 'INITIAL_DEPOSIT',
      amount: 5_000_000,
      description: 'Initial virtual deposit of Rs. 50,000',
    },
  );

  const token = await this.tokenStorage.createEmailVerificationToken(user.id);

  await this.emailService.sendMail(
    dto.email,
    'Verify your Nebula account',
    `<p>Welcome to Nebula!</p><p>Click the link below to verify your email:</p><p><a href="${this.configService.get<string>('FRONTEND_URL')}/verify-email?token=${token}">Verify Email</a></p>`,
  );

  return { id: user.id, email: user.email };
}

  /**
   * Authenticates a user and returns a token pair.
   * Each device gets its own refresh token.
   */
  async login(dto: LoginDto) {
    const user = await this.authRepository.findUserByEmail(dto.email);
    if (!user || !user.password) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const valid = await comparePassword(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    if (user.isSuspended) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Contact support.',
      });
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before logging in',
      });
    }

    const accessToken = generateAccessToken(this.jwtService, this.configService, {
      sub: user.id,
      email: user.email,
      userType: user.userType,
    });

    const refreshToken = generateRefreshToken(this.jwtService, this.configService, {
      sub: user.id,
      deviceId: dto.deviceId,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        userType: user.userType,
        isOnboardingComplete: user.isOnboardingComplete,
      },
    };
  }

  /**
   * Verifies a user's email via token.
   * Token validation and Redis lookup handled in controller.
   */
  async verifyEmail(token: string) {
  const userId = await this.tokenStorage.validateEmailVerificationToken(token);
  if (!userId) {
    throw new BadRequestException({
      code: 'INVALID_VERIFICATION_TOKEN',
      message: 'The verification link is invalid or has expired',
    });
  }

  await this.authRepository.verifyUserEmail(userId);
  return { message: 'Email verified successfully' };
}

  /**
   * Initiates password reset flow.
   * Always returns 200 even if email not found — prevents user enumeration.
   */
 async forgotPassword(email: string) {
  // Rate limit check: max 3 emails per hour per address
  const emailCount = await this.tokenStorage.incrementEmailRateLimit(email);
  if (emailCount > 3) {
    throw new BadRequestException({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please wait before trying again.',
    });
  }

  const user = await this.authRepository.findUserByEmail(email);
  if (user) {
    const token = await this.tokenStorage.createPasswordResetToken(user.id);
    await this.emailService.sendMail(
      email,
      'Reset your Nebula password',
      `<p>Click the link below to reset your password:</p><p><a href="${this.configService.get<string>('FRONTEND_URL')}/reset-password?token=${token}">Reset Password</a></p><p>This link expires in 1 hour.</p>`,
    );
  }

  // Always return the same response — prevents user enumeration
  return { message: 'If an account exists with this email, a reset link has been sent' };
}

  /**
   * Resets password using a single-use token.
   * Token validation handled in controller.
   */
  async resetPassword(token: string, newPassword: string) {
  const userId = await this.tokenStorage.validatePasswordResetToken(token);
  if (!userId) {
    throw new BadRequestException({
      code: 'INVALID_RESET_TOKEN',
      message: 'The reset link is invalid or has expired',
    });
 }

  const hashed = await hashPassword(newPassword);
  await this.authRepository.updatePassword(userId, hashed);
  return { message: 'Password reset successfully' };
  }
  /**
   * Selects a broker and completes trader onboarding.
   */
  async selectBroker(userId: string, brokerId: string) {
    const broker = await this.authRepository.findUserById(brokerId);
    if (!broker || broker.userType !== UserType.BROKER || broker.isSuspended) {
      throw new NotFoundException({
        code: 'BROKER_NOT_FOUND',
        message: 'The selected broker is not available',
      });
    }

    await this.authRepository.completeOnboarding(userId, brokerId);
    return { message: 'Broker selected successfully' };
  }

  /**
   * Returns list of active brokers for onboarding selection.
   */
  async getActiveBrokers() {
    return this.authRepository.findActiveBrokers();
  }
}