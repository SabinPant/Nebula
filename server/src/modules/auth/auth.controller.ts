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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
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

    // Set refresh token as HTTP-only cookie — never exposed to JavaScript.
    // sameSite must be 'none' in production: client (Vercel) and server (Render)
    // are on different domains, and 'strict'/'lax' would silently drop the
    // cookie on cross-domain requests. 'none' requires secure: true, which is
    // already enforced below for production.
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/v1/auth',
    });

    // Return everything except the refresh token in the response body
    const { refreshToken: _, ...response } = result;
    return response;
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
}