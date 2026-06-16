/**
 * Watchlist DTO
 *
 * Validates the stock symbol for watchlist operations.
 */

import { IsString, IsNotEmpty } from 'class-validator';

export class AddToWatchlistDto {
  @IsString()
  @IsNotEmpty({ message: 'Stock symbol is required' })
  symbol!: string;
}