/**
 * Broker Controller
 *
 * HTTP route handlers for broker applications.
 * Routes ONLY — no business logic, no database calls.
 *
 * Public routes only: submit application, check application status,
 * complete setup via invitation. Admin routes (approve, reject) moved
 * to AdminController in Sprint 13 — see admin.controller.ts.
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { BrokerService } from './broker.service';
import { CreateBrokerApplicationDto } from './dto/create-broker-application.dto';
import { Response } from 'express';
import { BrokerSetupDto } from './dto/broker-setup.dto';
import { getRefreshCookieOptions } from '../../shared/utils/cookie';

@Controller('broker-applications')
export class BrokerController {
  constructor(private readonly brokerService: BrokerService) {}

  /**
   * Submits a new broker application with document upload.
   * Public — anyone can apply.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('document', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (_req, file, callback) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
          return callback(
            new BadRequestException({
              code: 'INVALID_FILE_TYPE',
              message: 'Only JPEG, PNG, and WebP images are allowed.',
            }),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async submitApplication(
    @Body() dto: CreateBrokerApplicationDto,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Document photo is required',
      });
    }

    return this.brokerService.submitApplication(dto, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
    });
  }

  /**
   * Checks the status of a broker application by email.
   * Public — anyone can check their application status.
   */
  @Get('status/:email')
  async checkStatus(@Param('email') email: string) {
    return this.brokerService.checkStatus(email);
  }

    /**
   * Completes broker account setup via invitation token.
   * Public — accessed via the link sent in the approval email.
   * Returns JWT tokens so the broker is immediately logged in.
   */
  @Post('setup')
  @HttpCode(HttpStatus.OK)
  async setupBroker(
    @Body() dto: BrokerSetupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.brokerService.setupBroker(dto);

    // Set refresh cookie — shared/utils/cookie.ts is the single source of
    // truth (this previously hand-rolled its own options that had drifted:
    // sameSite: 'strict' in dev instead of 'lax', and a narrower path than
    // every other login flow uses — see cookie.ts's docstring).
    res.cookie('refreshToken', result.refreshToken, getRefreshCookieOptions());

    const { refreshToken: _, ...response } = result;
    return response;
  }
}