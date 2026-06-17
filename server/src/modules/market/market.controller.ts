/**
 * Market Controller
 *
 * REST endpoints for market data — stock listings, price history,
 * market status, and watchlist management.
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Req,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketService } from './market.service';
import { AddToWatchlistDto } from './dto/watchlist.dto';

@Controller('market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('status')
  @HttpCode(HttpStatus.OK)
  getStatus() {
    return this.marketService.getMarketStatus();
  }

  @Get('stocks')
  @HttpCode(HttpStatus.OK)
  getStocks() {
    return this.marketService.getStocks();
  }

    @Get('index-history')
  @HttpCode(HttpStatus.OK)
  getIndexHistory(
    @Query('interval') interval?: string,
    @Query('limit') limit?: string,
  ) {
    return this.marketService.getIndexHistory(
      interval || '1m',
      limit ? parseInt(limit, 10) : 30,
    );
  }

  @Get('stocks/:symbol/history')
  @HttpCode(HttpStatus.OK)
  getStockHistory(
    @Param('symbol') symbol: string,
    @Query('interval') interval?: string,
    @Query('limit') limit?: string,
  ) {
    return this.marketService.getStockHistory(
      symbol,
      interval || '1m',
      limit ? parseInt(limit, 10) : 100,
    );
  }

  @Get('stocks/:symbol')
  @HttpCode(HttpStatus.OK)
  getStock(@Param('symbol') symbol: string) {
    return this.marketService.getStock(symbol);
  }

@Post('watchlist')
@HttpCode(HttpStatus.OK)
@UseGuards(JwtAuthGuard)
addToWatchlist(
  @Req() req: Request,
  @Body() dto: AddToWatchlistDto,
) {
  const user = req.user as { id: string };
  return this.marketService.addToWatchlist(user.id, dto.symbol);
}

  @Get('watchlist')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  getWatchlist(@Req() req: Request) {
    const user = req.user as { id: string };
    return this.marketService.getWatchlist(user.id);
  }

  @Delete('watchlist/:symbol')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  removeFromWatchlist(
    @Req() req: Request,
    @Param('symbol') symbol: string,
  ) {
    const user = req.user as { id: string };
    return this.marketService.removeFromWatchlist(user.id, symbol);
  }
}