import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BrokerController } from './broker.controller';
import { BrokerService } from './broker.service';
import { BrokerRepository } from './broker.repository';
import { AuthRepository } from '../auth/auth.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { CloudinaryService } from '../../shared/services/cloudinary.service';
import { EmailService } from '../../shared/services/email.service';
import { TokenStorage } from '../../shared/utils/token-storage';

@Module({
  imports: [JwtModule],
  controllers: [BrokerController],
  providers: [
    BrokerService,
    BrokerRepository,
    AuthRepository,
    PrismaService,
    CloudinaryService,
    EmailService,
    TokenStorage,
  ],
  exports: [BrokerService],
})
export class BrokerModule {}