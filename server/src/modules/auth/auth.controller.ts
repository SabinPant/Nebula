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
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UnauthorizedException,
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


@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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