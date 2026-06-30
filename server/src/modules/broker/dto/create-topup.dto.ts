/**
 * CreateTopupDto
 *
 * Validates broker top-up payload before it reaches the service layer.
 * All amount values are in integer paise.
 */

import {
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MARKET_CONSTANTS } from '../../../shared/constants/market.constants';

const TOPUP_PAYMENT_METHODS = ['eSewa', 'Khalti', 'Bank Transfer', 'QR'] as const;

export class CreateTopupDto {
  @IsString()
  @IsNotEmpty({ message: 'Trader ID is required' })
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'Trader ID must be a valid CUID',
  })
  traderId!: string;

  @IsInt({ message: 'Top-up amount must be a whole number in paise' })
  @Min(10_000, { message: 'Minimum top-up amount is Rs. 100 (10000 paise)' })
  @Max(MARKET_CONSTANTS.ORDER_MAX_PRICE_PAISE, {
    message: 'Maximum single top-up amount is Rs. 100,000 (10000000 paise)',
  })
  amountPaise!: number;

  @IsIn(TOPUP_PAYMENT_METHODS, {
    message: `Payment method must be one of: ${TOPUP_PAYMENT_METHODS.join(', ')}`,
  })
  paymentMethod!: (typeof TOPUP_PAYMENT_METHODS)[number];

  @IsString()
  @IsNotEmpty({ message: 'Transaction reference is required' })
  @MinLength(3, { message: 'Transaction reference must be at least 3 characters' })
  @MaxLength(50, { message: 'Transaction reference must be at most 50 characters' })
  transactionRef!: string;

  @IsOptional()
  @IsString({ message: 'Note must be a string' })
  @MaxLength(200, { message: 'Note must be at most 200 characters' })
  note?: string;
}
