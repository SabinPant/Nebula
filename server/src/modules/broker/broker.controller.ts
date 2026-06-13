/**
 * Broker Controller
 *
 * HTTP route handlers for broker applications.
 * Routes ONLY — no business logic, no database calls.
 *
 * Public routes: submit application, check application status
 * Admin routes: approve, reject (in a separate admin controller later)
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { BrokerService } from './broker.service';
import { CreateBrokerApplicationDto } from './dto/create-broker-application.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
   * Approves a broker application and sends a setup invitation.
   * Admin only — will be moved to AdminController in Sprint 13.
   */
  @UseGuards(JwtAuthGuard)
  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approveApplication(
    @Param('id') id: string,
    @Body() body: { adminId: string; brokerNumber: string; adminNote?: string },
  ) {
    return this.brokerService.approveApplication(
      id,
      body.adminId,
      body.brokerNumber,
      body.adminNote,
    );
  }

  /**
   * Rejects a broker application with a mandatory reason.
   * Admin only — will be moved to AdminController in Sprint 13.
   */
  @UseGuards(JwtAuthGuard)
  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectApplication(
    @Param('id') id: string,
    @Body() body: { adminId: string; adminNote: string },
  ) {
    if (!body.adminNote || body.adminNote.trim().length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'A rejection reason is required',
      });
    }

    return this.brokerService.rejectApplication(id, body.adminId, body.adminNote);
  }
}