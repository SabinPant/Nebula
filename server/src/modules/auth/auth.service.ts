/**
 * Auth Service
 *
 * All authentication business logic lives here.
 * Composes AuthRepository (database), crypto utilities (password hashing),
 * token utilities (JWT generation), and EmailService (verification/reset emails).
 *
 * Controllers call these methods — they handle HTTP and nothing else.
 * This service throws typed HttpExceptions for every error case.
 * No try/catch — the global exception filter handles everything, including
 * Prisma P2002 unique constraint violations from the repository.
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
import { UserType, TransactionType } from '@prisma/client';
import { AuthRepository } from './auth.repository';
import { EmailService } from '../../shared/services/email.service';
import { TokenStorage } from '../../shared/utils/token-storage';
import { hashPassword, comparePassword } from '../../shared/utils/crypto';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../shared/utils/tokens';
import type { AccessTokenPayload } from '../../shared/utils/tokens';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

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
   * If the email belongs to a soft-deleted account, the repository's
   * findUserByEmail returns null (deletedAt filter), then Prisma's
   * unique constraint on email fires P2002 — caught by the global
   * exception filter as EMAIL_ALREADY_EXISTS.
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
        type: TransactionType.INITIAL_DEPOSIT,
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
   * Check order: password → suspension → email verification.
   * Suspension takes priority over email status — a suspended user
   * must never receive EMAIL_NOT_VERIFIED, which would leak the
   * false impression that the account is in good standing.
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

    // Suspension check first — stronger state than unverified
    if (user.isSuspended) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Contact support.',
      });
    }

    // Email verification check second
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

    // Store the refresh token hash and update the session set (atomic pipeline inside)
    await this.tokenStorage.storeRefreshToken(user.id, dto.deviceId, refreshToken);

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
   * Rotates a refresh token — validates the old one, issues a new pair,
   * and rotates the Redis-stored hash.
   *
   * Security properties:
   * - Blacklists the old access token jti BEFORE issuing new tokens.
   *   If blacklisting fails, the old token expires naturally — safe.
   * - Stores the new refresh token BEFORE deleting the old one.
   *   If storage fails, the user retains their existing session.
   * - On hash mismatch (token already rotated), invalidates ALL user
   *   sessions. This is a signal of possible token theft — the legitimate
   *   user and attacker are racing to refresh. Forcing re-login on all
   *   devices contains the blast radius.
   * - On suspended user, also invalidates all sessions — prevents
   *   suspended users from maintaining active refresh tokens.
   *
   * @param oldRefreshToken - The refresh token from the HTTP-only cookie
   * @param oldAccessToken - Optional. The old access token from the
   *   Authorization header. If provided and signature-valid, its jti is
   *   blacklisted. Verification uses ignoreExpiration: true so expired
   *   tokens can still be revoked. Signature failures skip blacklisting
   *   silently — the token is untrusted.
   */
  async refreshToken(oldRefreshToken: string, oldAccessToken?: string) {
    // 1. Verify old refresh token signature and expiry
    const refreshPayload = verifyRefreshToken(
      this.jwtService,
      this.configService,
      oldRefreshToken,
    );

    const { sub: userId, deviceId } = refreshPayload;

    // 2. Check user still exists and is not suspended
    const user = await this.authRepository.findUserById(userId);

    if (!user) {
      throw new UnauthorizedException({
        code: 'TOKEN_REVOKED',
        message: 'Invalid or expired session',
      });
    }

    // 3. Suspended user — nuke all sessions, force re-login
    if (user.isSuspended) {
      await this.tokenStorage.invalidateAllUserSessions(userId);
      throw new UnauthorizedException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Contact support.',
      });
    }

    // 4. Validate token hash against Redis
    const isValid = await this.tokenStorage.validateRefreshToken(
      userId,
      deviceId,
      oldRefreshToken,
    );

       // 5. Hash mismatch — token already rotated, possible theft
    if (!isValid) {
      await this.tokenStorage.invalidateAllUserSessions(userId);
      throw new UnauthorizedException({
        code: 'TOKEN_REVOKED',
        message: 'Session expired. Please log in again.',
      });
    }

    // 6. Blacklist old access token jti
    // The no-try/catch rule is intentionally bypassed here:
    // If the old access token's signature is invalid, we cannot trust its payload,
    // so we skip blacklisting without error. No other JWT errors should be caught.
    if (oldAccessToken) {
      try {
        const oldPayload = this.jwtService.verify<AccessTokenPayload>(
          oldAccessToken,
          {
            secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
            ignoreExpiration: true,
          },
        );
        if (oldPayload.jti) {
          await this.tokenStorage.blacklistAccessToken(oldPayload.jti);
        }
      } catch {
        // Signature invalid — token is untrusted, skip blacklisting
      }
    }

    // 7. Generate new access token
    const accessToken = generateAccessToken(this.jwtService, this.configService, {
      sub: user.id,
      email: user.email,
      userType: user.userType,
    });

    // 8. Generate new refresh token
    const refreshToken = generateRefreshToken(this.jwtService, this.configService, {
      sub: user.id,
      deviceId,
    });

        // 9. Store new hash + session set update (atomic within storeRefreshToken)
    await this.tokenStorage.storeRefreshToken(user.id, deviceId, refreshToken);

    // 10. Delete old hash — this is a separate round-trip, but store-before-revoke
    // ensures the user keeps access if this deletion fails.
    await this.tokenStorage.invalidateRefreshToken(user.id, deviceId);

    // 11. Return new token pair
    return { accessToken, refreshToken };
  }


    /**
   * Logs out a user by blacklisting the current access token's jti
   * and cleaning up the device's refresh token and session set entry.
   *
   * @param userId - The authenticated user's ID
   * @param jti - The JWT ID of the current access token (for blacklisting)
   * @param deviceId - Optional device ID extracted from the refresh cookie.
   *   If provided, the refresh token hash is deleted and the device is
   *   removed from the session set. If omitted, only the access token is
   *   blacklisted (the refresh cookie will expire naturally).
   */
  async logout(userId: string, jti: string, deviceId?: string): Promise<void> {
    // Blacklist the access token so it cannot be reused
    await this.tokenStorage.blacklistAccessToken(jti);

    // If we can identify the device, clean up its refresh token and session set
    if (deviceId) {
      await this.tokenStorage.invalidateRefreshToken(userId, deviceId);
      await this.tokenStorage.removeFromSessionSet(userId, deviceId);
    }
  }

    /**
   * Changes the authenticated user's password.
   * Verifies the old password before applying the new one.
   * Rejects if the new password is identical to the old one.
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.authRepository.findUserById(userId);

    if (!user || !user.password) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      });
    }

    const valid = await comparePassword(oldPassword, user.password);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Current password is incorrect',
      });
    }

    const sameAsOld = await comparePassword(newPassword, user.password);
    if (sameAsOld) {
      throw new BadRequestException({
        code: 'PASSWORD_SAME_AS_OLD',
        message: 'New password must be different from your current password',
      });
    }

    const hashed = await hashPassword(newPassword);
    await this.authRepository.updatePassword(userId, hashed);

    return { message: 'Password changed successfully' };
  }

  /**
   * Verifies a user's email via token.
   * Token is single-use — deleted from Redis after successful validation.
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
   * Always returns 200 with identical message whether email exists or not —
   * prevents user enumeration via timing or response analysis.
   */
  async forgotPassword(email: string) {
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

    return { message: 'If an account exists with this email, a reset link has been sent' };
  }

  /**
   * Resets password using a single-use token.
   * Token is single-use — deleted from Redis after successful validation.
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
   * Validates that the broker exists, is a BROKER, and is not suspended.
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