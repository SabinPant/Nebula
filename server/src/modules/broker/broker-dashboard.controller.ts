/**
 * Broker Dashboard Controller
 *
 * HTTP route handlers for broker dashboard operations.
 * Routes ONLY — no business logic, no database calls.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { BrokerService } from './broker.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BrokerGuard } from './guards/broker.guard';
import { CreateTopupDto } from './dto/create-topup.dto';
import { CreateFlagDto } from './dto/create-flag.dto';

@Controller('broker')
@UseGuards(JwtAuthGuard, BrokerGuard)
export class BrokerDashboardController {
  constructor(private readonly brokerService: BrokerService) {}

  @Get('traders')
  async getAssignedTraders(@Req() request: Request) {
    const brokerId = (request.user as { id: string }).id;
    return this.brokerService.getAssignedTraders(brokerId);
  }

  @Get('traders/:traderId')
  async getAssignedTraderDetail(
    @Req() request: Request,
    @Param('traderId') traderId: string,
  ) {
    const brokerId = (request.user as { id: string }).id;
    return this.brokerService.getAssignedTraderDetail(brokerId, traderId);
  }

  @Post('topups')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('receipt'))
  async processTopup(
    @Req() request: Request,
    @Body() dto: CreateTopupDto,
    @UploadedFile() receiptFile?: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!receiptFile) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Receipt image is required',
      });
    }

    const brokerId = (request.user as { id: string }).id;
    return this.brokerService.processTopup(brokerId, dto, receiptFile, request);
  }

  @Get('topups')
  async getTopupHistory(
    @Req() request: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const brokerId = (request.user as { id: string }).id;
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 10;

    return this.brokerService.getTopupHistory(
      brokerId,
      isNaN(parsedPage) ? 1 : parsedPage,
      isNaN(parsedLimit) ? 10 : parsedLimit,
    );
  }

  @Post('flags')
  @HttpCode(HttpStatus.OK)
  async createFlag(@Req() request: Request, @Body() dto: CreateFlagDto) {
    const brokerId = (request.user as { id: string }).id;
    return this.brokerService.createFlag(brokerId, dto);
  }

  @Get('flags')
  async getFlagHistory(
    @Req() request: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const brokerId = (request.user as { id: string }).id;
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 10;

    return this.brokerService.getFlagHistory(
      brokerId,
      isNaN(parsedPage) ? 1 : parsedPage,
      isNaN(parsedLimit) ? 10 : parsedLimit,
    );
  }

  @Get('activity')
  async getActivityHistory(
    @Req() request: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const brokerId = (request.user as { id: string }).id;
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 10;

    return this.brokerService.getActivityHistory(
      brokerId,
      isNaN(parsedPage) ? 1 : parsedPage,
      isNaN(parsedLimit) ? 10 : parsedLimit,
    );
  }
}