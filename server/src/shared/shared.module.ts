import { Module, Global } from '@nestjs/common';
import { EmailService } from './services/email.service';
import { CloudinaryService } from './services/cloudinary.service';
import { TokenStorage } from './utils/token-storage';

@Global()
@Module({
  providers: [EmailService, CloudinaryService, TokenStorage],
  exports: [EmailService, CloudinaryService, TokenStorage],
})
export class SharedModule {}