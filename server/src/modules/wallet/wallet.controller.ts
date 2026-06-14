/**
 * Wallet Controller
 *
 * HTTP route handlers for wallet operations.
 * Routes ONLY — no business logic, no database calls.
 *
 * All routes require JWT authentication.
 */

import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * Returns the authenticated user's wallet balance and summary.
   */
  @Get()
  async getWallet(@Req() req: Request) {
    const user = req.user as { id: string };
    return this.walletService.getWallet(user.id);
  }

  /**
   * Returns cursor-paginated transaction history for the authenticated user.
   */
  @Get('transactions')
  async getTransactions(
    @Req() req: Request,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as { id: string };
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.walletService.getTransactions(
      user.id,
      cursor,
      isNaN(parsedLimit) ? 20 : parsedLimit,
    );
  }

  /**
   * Returns the assigned broker's contact info and weekly top-up status.
   */
  @Get('topup-info')
  async getTopupInfo(@Req() req: Request) {
    const user = req.user as { id: string };
    return this.walletService.getTopupInfo(user.id);
  }
}