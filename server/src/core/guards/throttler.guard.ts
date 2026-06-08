/**
 * Custom Throttler Guard
 *
 * Extends the NestJS ThrottlerGuard to throw a standardized error
 * with the machine-readable RATE_LIMIT_EXCEEDED code.
 *
 * Without this, the default guard throws a generic 429 with no code field,
 * which breaks the frontend error handling pattern (switches on code, not status).
 */

import { Injectable } from '@nestjs/common';
import { ThrottlerGuard as NestThrottlerGuard } from '@nestjs/throttler';
import { HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class ThrottlerGuard extends NestThrottlerGuard {
  protected async throwThrottlingException(): Promise<void> {
    throw new HttpException(
      {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please wait before trying again.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}