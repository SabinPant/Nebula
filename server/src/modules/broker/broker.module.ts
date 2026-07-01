import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BrokerController } from './broker.controller';
import { BrokerService } from './broker.service';
import { BrokerRepository } from './broker.repository';
import { AuthRepository } from '../auth/auth.repository';
import { PrismaService } from '../../core/database/prisma.service';

@Module({
  imports: [JwtModule, EventEmitterModule.forRoot()],
  controllers: [BrokerController],
 providers: [
  BrokerService,
  BrokerRepository,
  AuthRepository,
  PrismaService,
],
  exports: [BrokerService],
})
export class BrokerModule {}