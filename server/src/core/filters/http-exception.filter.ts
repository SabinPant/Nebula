import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine status and message
    let status: number;
    let message: string;
    let code: string;

    if (exception instanceof HttpException) {
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
    } else {
      // Unexpected error — log full details, return generic response
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unexpected error occurred';
      code = 'INTERNAL_ERROR';

      this.logger.error(
        `Unhandled exception: ${exception instanceof Error ? exception.message : 'Unknown error'}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Log server errors
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status} [${code}] ${message}`,
      );
    }

    // Standardized error response — NEVER expose stack traces or internal details
    response.status(status).json({
      statusCode: status,
      error: this.getErrorName(status),
      message,
      code,
      timestamp: new Date().toISOString(),
    });
  }

  private getErrorName(status: number): string {
    switch (true) {
      case status >= 500:
        return 'INTERNAL_SERVER_ERROR';
      case status >= 400 && status < 500:
        return 'BAD_REQUEST';
      default:
        return 'ERROR';
    }
  }
}