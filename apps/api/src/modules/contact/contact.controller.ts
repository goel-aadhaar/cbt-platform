import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';
import { ContactService } from './contact.service';
import { ContactMessageDto } from './dto/contact-message.dto';

@ApiTags('contact')
@Controller({ path: 'contact', version: '1' })
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  /** POST /contact — the public site's contact form. No auth required. */
  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  submit(@Body() dto: ContactMessageDto) {
    return this.contact.submit(dto);
  }
}
