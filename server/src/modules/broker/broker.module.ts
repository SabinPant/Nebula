/**
 * Broker Module
 *
 * Wires together the broker application controller, service,
 * repository, and shared services.
 */

import { Module } from '@nestjs/common';
import { BrokerController } from './broker.controller';
import { BrokerService } from './broker.service';
import { BrokerRepository } from './broker.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { CloudinaryService } from '../../shared/services/cloudinary.service';
import { EmailService } from '../../shared/services/email.service';

@Module({
  controllers: [BrokerController],
  providers: [
    BrokerService,
    BrokerRepository,
    PrismaService,
    CloudinaryService,
    EmailService,
  ],
  exports: [BrokerService],
})
export class BrokerModule {}