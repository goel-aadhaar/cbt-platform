import { Injectable } from '@nestjs/common';

import { MailService } from '../auth/mail/mail.service';
import { ContactMessageDto } from './dto/contact-message.dto';

/**
 * The public site's contact form (§ public site). No auth, no tenant — a
 * visitor who isn't a member of any institute yet is exactly who this is
 * for, so it sits outside every other module's tenant-scoped assumptions.
 */
@Injectable()
export class ContactService {
  constructor(private readonly mail: MailService) {}

  async submit(dto: ContactMessageDto): Promise<{ received: true }> {
    await this.mail.sendContactMessage({
      name: dto.name.trim(),
      email: dto.email.trim(),
      organization: dto.organization?.trim() || undefined,
      message: dto.message.trim(),
    });
    return { received: true };
  }
}
