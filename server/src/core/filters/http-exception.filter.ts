/**
 * Global Exception Filter
 *
 * Single exception handler for the entire server.
 * Catches every unhandled error and returns a standardized response.
 *
 * Three error sources handled:
 * 1. HttpException — typed errors thrown by services (code + message preserved)
 * 2. PrismaClientKnownRequestError — database constraint violations mapped to
 *    appropriate HTTP errors (e.g., unique constraint on email → EMAIL_ALREADY_EXISTS)
 * 3. Unknown errors — logged with full stack trace, returned as 500 INTERNAL_ERROR
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
   * Only known constraint targets are mapped explicitly — unknown P2002
   * targets fall through and become logged 500s so we catch unhandled
   * constraints early during development without leaking schema details.
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
    }

    // Unknown Prisma error — log and return generic 500
    this.logger.error(
      `Unhandled Prisma error: ${exception.code}`,
      exception.stack,
    );

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    };
  }

  private getErrorName(status: number): string {
    if (status >= 500) return 'INTERNAL_SERVER_ERROR';
    if (status >= 400) return 'BAD_REQUEST';
    return 'ERROR';
  }
}