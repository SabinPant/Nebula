import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BrokerController } from './broker.controller';
import { BrokerDashboardController } from './broker-dashboard.controller';
import { BrokerService } from './broker.service';
import { BrokerRepository } from './broker.repository';
import { BrokerGuard } from './guards/broker.guard';
import { AuthRepository } from '../auth/auth.repository';
import { PrismaService } from '../../core/database/prisma.service';

@Module({
  imports: [JwtModule, EventEmitterModule.forRoot()],
  controllers: [BrokerController, BrokerDashboardController],
 providers: [
  BrokerService,
  BrokerRepository,
  AuthRepository,
  PrismaService,
  BrokerGuard,
],
  exports: [BrokerService],
})
export class BrokerModule {}