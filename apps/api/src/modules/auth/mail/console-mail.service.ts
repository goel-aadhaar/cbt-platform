import { Injectable, Logger } from '@nestjs/common';

import { InvitationEmail, MailService } from './mail.service';

/**
 * Dev mail adapter — logs the message + invite link instead of sending.
 * Lets us build and test the invitation flow with no AWS dependency.
 */
@Injectable()
export class ConsoleMailService extends MailService {
  private readonly logger = new Logger(ConsoleMailService.name);

  sendInvitation(email: InvitationEmail): Promise<void> {
    this.logger.log(
      `📧 Invitation → ${email.name} <${email.to}> as ${email.role}` +
        (email.institute ? ` @ ${email.institute}` : '') +
        ` | accept: ${email.inviteUrl}`,
    );
    return Promise.resolve();
  }
}
