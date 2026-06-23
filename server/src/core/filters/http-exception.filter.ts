/**
 * Global Exception Filter
 *
 * Single exception handler for the entire server.
 * Catches every unhandled error and returns a standardized response.
 *
 * Error sources handled:
 * 1. HttpException — typed errors thrown by services (code + message preserved)
 * 2. PrismaClientKnownRequestError — database constraint violations mapped to
 *    appropriate HTTP errors (P2002 unique, P2003 foreign key, P2025 not found)
 * 3. PrismaClientValidationError — schema validation failures at query time
 * 4. JWT errors — expired/malformed tokens mapped to 401 UNAUTHORIZED
 * 5. Unknown errors — logged with full stack trace, returned as 500 INTERNAL_ERROR
 *
 * Never exposes: stack traces, SQL queries, internal paths, or raw DB error details.
 *
 * @see shared/constants/errors.ts — all valid error codes
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { TokenExpiredError, JsonWebTokenError, NotBeforeError } from 'jsonwebtoken';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let code: string;

    // ─── Prisma known request errors (database constraint violations) ──────
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const prismaError = this.handlePrismaError(exception);
      status = prismaError.status;
      message = prismaError.message;
      code = prismaError.code;
    }

    // ─── Prisma validation errors (bad query at dev time) ──────────────────
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unexpected error occurred';
      code = 'INTERNAL_ERROR';

      this.logger.error(
        `Prisma validation error: ${exception.message}`,
        exception.stack,
      );
    }

    // ─── JWT errors (expired, malformed, or not-yet-valid tokens) ──────────
    else if (
      exception instanceof TokenExpiredError ||
      exception instanceof JsonWebTokenError ||
      exception instanceof NotBeforeError
    ) {
      status = HttpStatus.UNAUTHORIZED;
      message = 'Invalid or expired token';
      code = 'UNAUTHORIZED';

      this.logger.warn(
        `JWT error [${exception.constructor.name}]: ${exception.message}`,
      );
    }

    // ─── Typed HTTP exceptions thrown by services ──────────────────────────
    else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || exception.message;
        code = (resp.code as string) || 'UNKNOWN_ERROR';
      } else {
        message = exception.message;
        code = 'UNKNOWN_ERROR';
      }
    }

    // ─── Unexpected errors (bugs) — log full details, return generic ───────
    else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unexpected error occurred';
      code = 'INTERNAL_ERROR';

      this.logger.error(
        `Unhandled exception: ${exception instanceof Error ? exception.message : 'Unknown error'}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Log all server errors for monitoring
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status} [${code}] ${message}`,
      );
    }

    // Clear poisoned refresh cookie on token revocation or account suspension
    // so the client doesn't keep sending a dead cookie on every request.
    if (
      request.path === '/api/v1/auth/refresh' &&
      (code === 'TOKEN_REVOKED' || code === 'ACCOUNT_SUSPENDED')
    ) {
      response.clearCookie('refreshToken', { path: '/' });
    }

    // Standardized error response — never exposes internals
    response.status(status).json({
      statusCode: status,
      error: this.getErrorName(status),
      message,
      code,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Maps Prisma database errors to HTTP responses.
   *
   * Only known constraint targets are mapped explicitly — unknown targets
   * fall through and become logged 500s so we catch unhandled constraints
   * early without leaking schema details.
   */
  private handlePrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    code: string;
  } {
    // Unique constraint violation
    if (exception.code === 'P2002') {
      const target = exception.meta?.target as string[] | undefined;

      if (target?.includes('email')) {
        return {
          status: HttpStatus.CONFLICT,
          message: 'An account with this email already exists',
          code: 'EMAIL_ALREADY_EXISTS',
        };
      }

      if (target?.includes('transactionRef')) {
        return {
          status: HttpStatus.CONFLICT,
          message: 'This payment reference has already been used',
          code: 'DUPLICATE_TRANSACTION_REFERENCE',
        };
      }

      if (target?.includes('phone')) {
        return {
          status: HttpStatus.CONFLICT,
          message: 'An application with this phone number already exists',
          code: 'DUPLICATE_PHONE',
        };
      }

      if (target?.includes('brokerNumber')) {
        return {
          status: HttpStatus.CONFLICT,
          message: 'This broker number is already assigned',
          code: 'DUPLICATE_BROKER_NUMBER',
        };
      }
    }

    // Foreign key violation — referenced record does not exist
    if (exception.code === 'P2003') {
      this.logger.warn(`P2003 foreign key violation: ${exception.message}`);
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Referenced record does not exist',
        code: 'FOREIGN_KEY_VIOLATION',
      };
    }

    // Record not found for update/delete — concurrent modification
    if (exception.code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'The requested record was not found',
        code: 'NOT_FOUND',
      };
    }

    // Unknown Prisma error — log and return generic 500
    this.logger.error(
      `Unhandled Prisma error [${exception.code}]: ${exception.message}`,
      exception.stack,
    );

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    };
  }

  /**
   * Maps HTTP status codes to their standard text names.
   * Returns the exact HTTP status text for proper API responses.
   */
  private getErrorName(status: number): string {
    const names: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    };
    return names[status] || 'ERROR';
  }
}