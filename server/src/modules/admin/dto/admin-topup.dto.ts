/**
 * AdminTopupDto
 *
 * Validates the admin top-up override payload before it reaches the
 * service layer. Distinct from broker's CreateTopupDto — no paymentMethod
 * or transactionRef (no receipt, no external payment to reference); reason
 * and reference are mandatory instead, per CLAUDE.md's admin override rule
 * ("reason + reference mandatory — no silent credits ever").
 */

import { IsInt, IsPositive, IsString, Matches, MinLength } from 'class-validator';

export class AdminTopupDto {
  @IsString()
  @Matches(/^c[a-z0-9]{24}$/, { message: 'Trader ID must be a valid CUID' })
  traderId!: string;

  @IsInt({ message: 'Amount must be an integer (paise)' })
  @IsPositive({ message: 'Amount must be at least 1 paise' })
  amountPaise!: number;

  @IsString()
  @MinLength(10, { message: 'Reason must be at least 10 characters' })
  reason!: string;

  @IsString()
  @MinLength(3, { message: 'Reference must be at least 3 characters' })
  reference!: string;
}
