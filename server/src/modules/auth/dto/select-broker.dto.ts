/**
 * Select Broker DTO
 *
 * Used during trader onboarding to assign a broker.
 * The broker ID must reference an existing, active (non-suspended) BROKER user.
 * After selection, isOnboardingComplete is set to true.
 */

import { IsString } from 'class-validator';

export class SelectBrokerDto {
  @IsString()
  brokerId!: string;
}