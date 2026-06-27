/**
 * Portfolio Controller
 *
 * HTTP route handlers for portfolio operations.
 * Routes ONLY — no business logic, no calculations.
 *
 * All routes require JWT authentication.
 */

import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  /**
   * Returns the authenticated user's full portfolio with P&L.
   */
  @Get('me')
  async getPortfolio(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.portfolioService.getPortfolio(userId);
  }

  /**
   * Returns the authenticated user's holdings list with P&L.
   */
  @Get('holdings')
  async getHoldings(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.portfolioService.getHoldings(userId);
  }
}