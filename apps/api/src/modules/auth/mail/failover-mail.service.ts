import { Logger } from '@nestjs/common';

import {
  ContactMessageEmail,
  InvitationEmail,
  MailService,
  OtpEmail,
  WelcomeEmail,
} from './mail.service';

/**
 * Primary/secondary mail transport (§2.6): every send goes to `primary`
 * (Resend) first; if that call throws for ANY reason — bad credentials, a
 * transient 5xx, Resend's own outage, a 429 — it is retried once against
 * `secondary` (SES) before giving up. A transactional email (a login OTP
 * especially) failing silently locks someone out for no reason a retry
 * couldn't have fixed, so "the primary provider had a bad five minutes"
 * must not be that reason.
 *
 * Not registered as its own DI provider — AuthModule's `MailService`
 * factory constructs one directly from the two already-injected adapters
 * only when both are configured; either one, or a stated preference for
 * exactly one, is used un-wrapped.
 */
export class FailoverMailService extends MailService {
  private readonly logger = new Logger(FailoverMailService.name);

  constructor(
    private readonly primary: MailService,
    private readonly secondary: MailService,
  ) {
    super();
  }

  private async withFallback(
    label: string,
    run: (svc: MailService) => Promise<void>,
  ): Promise<void> {
    try {
      await run(this.primary);
    } catch (err) {
      this.logger.warn(
        `Primary mail provider failed sending ${label} (${errorMessage(err)}) — falling back to secondary.`,
      );
      await run(this.secondary);
    }
  }

  sendInvitation(email: InvitationEmail): Promise<void> {
    return this.withFallback('invitation', (svc) => svc.sendInvitation(email));
  }

  sendLoginOtp(email: OtpEmail): Promise<void> {
    return this.withFallback('login OTP', (svc) => svc.sendLoginOtp(email));
  }

  sendWelcome(email: WelcomeEmail): Promise<void> {
    return this.withFallback('welcome email', (svc) => svc.sendWelcome(email));
  }

  sendContactMessage(email: ContactMessageEmail): Promise<void> {
    return this.withFallback('contact message', (svc) =>
      svc.sendContactMessage(email),
    );
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
