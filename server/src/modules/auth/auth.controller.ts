/**
 * Auth Controller
 *
 * HTTP route handlers for authentication.
 * Routes ONLY — no business logic, no database calls, no validation beyond DTOs.
 * Every method receives a validated DTO, calls the service, and returns the response.
 *
 * The login endpoint sets the refresh token as an HTTP-only cookie per the
 * security spec: httpOnly, secure in production, sameSite environment-aware
 * ('strict' in development, 'none' in production for cross-domain
 * Vercel <-> Render requests), scoped to auth routes. The refresh token is
 * never exposed in the response body.
 */

import {
  Controller,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RATE_LIMITS } from '../../core/config/rate-limit.config';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';

@Controller('auth')
export class AuthController {
  constructor(
  private readonly authService: AuthService,
  private readonly jwtService: JwtService,
) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: RATE_LIMITS.REGISTER.limit, ttl: RATE_LIMITS.REGISTER.ttl } })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: RATE_LIMITS.LOGIN.limit, ttl: RATE_LIMITS.LOGIN.ttl } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);

    res.cookie('refreshToken', result.refreshToken, this.getRefreshCookieOptions());

    // Return everything except the refresh token in the response body
    const { refreshToken: _, ...response } = result;
    return response;
  }

     /**
   * Rotates the refresh token — issues a new access token and refresh token
   * in exchange for a valid (non-revoked) refresh token from the HTTP-only cookie.
   *
   * The old access token from the Authorization header is optionally blacklisted
   * if its signature is valid. The refresh token is rotated: the old one is
   * invalidated in Redis, the new one is stored and set as a cookie.
   *
   * No JWT guard — the refresh cookie is the credential. Expired access tokens
   * (the primary reason clients call this endpoint) would be rejected by the guard.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: RATE_LIMITS.LOGIN.limit, ttl: RATE_LIMITS.LOGIN.ttl } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Read refresh token from HTTP-only cookie
    const oldRefreshToken = req.cookies?.refreshToken;

    if (!oldRefreshToken) {
      throw new UnauthorizedException({
        code: 'TOKEN_REVOKED',
        message: 'No refresh token provided',
      });
    }

    // Read old access token from Authorization header (optional — for jti blacklisting)
    const authHeader = req.headers.authorization;
    const oldAccessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

    const result = await this.authService.refreshToken(
      oldRefreshToken,
      oldAccessToken,
    );

    res.cookie('refreshToken', result.refreshToken, this.getRefreshCookieOptions());

    // Return only the access token — refresh token is in the cookie
    return { accessToken: result.accessToken };
  }

    /**
   * Logs out the current device.
   * Blacklists the access token's jti and removes the refresh token
   * from Redis so it can never be used again. Clears the refresh cookie.
   *
   * Protected by JwtAuthGuard — only authenticated users can log out.
   * The access token is decoded to extract the jti for blacklisting.
   * The refresh cookie is decoded (without verification) to extract the
   * deviceId for targeted session cleanup. If the cookie is missing or
   * malformed, only the access token is blacklisted — the refresh token
   * will expire naturally in at most 7 days.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: RATE_LIMITS.LOGIN.limit, ttl: RATE_LIMITS.LOGIN.ttl } })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Extract jti from the current access token (decode without verification —
    // the JwtAuthGuard already verified the signature)
    const authHeader = req.headers.authorization!;
    const accessToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    const decoded = this.jwtService.decode(accessToken) as { jti?: string } | null;
    const jti = decoded?.jti;

    // Extract deviceId from the refresh cookie (if present)
    let deviceId: string | undefined;
    const refreshCookie = req.cookies?.refreshToken;
    if (refreshCookie) {
      try {
        const refreshPayload = this.jwtService.decode(refreshCookie) as {
          deviceId?: string;
        } | null;
        deviceId = refreshPayload?.deviceId;
      } catch {
        // Cookie is malformed — ignore, we'll still blacklist the access token
      }
    }

    const user = req.user as { id: string; email: string; userType: string };
    await this.authService.logout(user.id, jti!, deviceId);

    // Clear the refresh cookie regardless — it's no longer valid
    res.clearCookie('refreshToken', { path: '/api/v1/auth' });

    return { message: 'Logged out successfully' };
  }

    /**
   * Changes the authenticated user's password.
   * Requires the current password for verification before applying the new one.
   */
  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: RATE_LIMITS.LOGIN.limit, ttl: RATE_LIMITS.LOGIN.ttl } })
  async changePassword(
    @Req() req: Request,
    @Body() dto: ChangePasswordDto,
  ) {
    const user = req.user as { id: string };
    return this.authService.changePassword(user.id, dto.oldPassword, dto.newPassword);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: RATE_LIMITS.FORGOT_PASSWORD.limit, ttl: RATE_LIMITS.FORGOT_PASSWORD.ttl } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

    /**
   * Resends the email verification link.
   * Public endpoint — user may not be verified yet.
   * Rate limited to 3 requests per hour per email address.
   * Enumeration-safe — always returns 200.
   */
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: RATE_LIMITS.FORGOT_PASSWORD.limit, ttl: RATE_LIMITS.FORGOT_PASSWORD.ttl } })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

    /**
   * Returns the standard HTTP-only cookie options for refresh tokens.
   * Single source of truth — login and refresh both use this so the
   * cookie configuration never drifts out of sync.
   */
  private getRefreshCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'strict') as 'none' | 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/v1/auth',
    };
  }

}