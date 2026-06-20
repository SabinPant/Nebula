/**
 * Trading Controller
 *
 * HTTP route handlers for order operations.
 * Routes ONLY — extracts request data, calls service, returns response.
 *
 * All routes require JWT authentication.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OnboardingGuard } from '../auth/guards/onboarding.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserType } from '@prisma/client';
import { TradingService } from './trading.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard, OnboardingGuard)
@Roles(UserType.TRADER)
export class TradingController {
  constructor(private readonly tradingService: TradingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async placeOrder(
    @Req() req: Request,
    @Body() dto: CreateOrderDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const userId = (req.user as { id: string }).id;
    return this.tradingService.placeOrder(userId, dto, idempotencyKey);
  }

  @Get()
  async getOrders(
    @Req() req: Request,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = (req.user as { id: string }).id;
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.tradingService.getOrders(
      userId,
      cursor,
      isNaN(parsedLimit) ? 20 : parsedLimit,
    );
  }

  @Patch(':id/cancel')
  async cancelOrder(
    @Req() req: Request,
    @Param('id') orderId: string,
  ) {
    const userId = (req.user as { id: string }).id;
    return this.tradingService.cancelOrder(userId, orderId);
  }
}