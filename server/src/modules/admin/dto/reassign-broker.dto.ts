/**
 * ReassignBrokerDto
 *
 * Validates the broker-reassignment payload before it reaches the service
 * layer. brokerId must be a valid CUID — the service layer verifies it
 * actually references an existing, active BROKER user.
 */

import { IsNotEmpty, IsString } from 'class-validator';

export class ReassignBrokerDto {
  @IsString()
  @IsNotEmpty({ message: 'Broker ID is required' })
  brokerId!: string;
}
