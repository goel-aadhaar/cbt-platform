import { Injectable, Logger } from '@nestjs/common';

import { InvitationEmail, MailService, OtpEmail } from './mail.service';

/**
 * Dev mail adapter — logs the message instead of sending.
 * Lets us build and test the invitation and OTP flows with no AWS dependency.
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

  /**
   * The code is printed because there is no mail provider in development —
   * that is the whole point of this adapter. In production the SES adapter
   * sends it and logs nothing, so a real code never reaches a log file.
   */
  sendLoginOtp(email: OtpEmail): Promise<void> {
    this.logger.log(
      `🔐 Login code → ${email.name} <${email.to}> | code: ${email.code} ` +
        `(expires in ${email.expiresInMinutes} min)`,
    );
    return Promise.resolve();
  }
}
