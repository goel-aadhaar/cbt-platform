import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

@Module({
  imports: [AuthModule], // for MailService
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
