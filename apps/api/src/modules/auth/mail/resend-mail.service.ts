import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthConfig } from '../../../config/auth.config';
import {
  contactMessageContent,
  invitationContent,
  loginOtpContent,
  welcomeContent,
} from './mail-content';
import {
  ContactMessageEmail,
  InvitationEmail,
  MailService,
  OtpEmail,
  WelcomeEmail,
} from './mail.service';

/**
 * Resend transactional email adapter (§2.6) — the PRIMARY mail transport;
 * see AuthModule's `MailService` factory for how it pairs with SES as the
 * secondary.
 *
 * A plain REST call, not the `resend` SDK: Resend's send-email API
 * (https://resend.com/docs/api-reference/emails/send-email) is a single
 * authenticated JSON POST with no request-signing step, so pulling in a
 * whole SDK for one endpoint would only add a dependency this module
 * doesn't need — `fetch` is already global at the Node version this API
 * runs on. Activate by setting RESEND_API_KEY and RESEND_FROM_EMAIL; the
 * sending domain must already be verified in the Resend account (or use
 * their shared `onboarding@resend.dev` sender while testing).
 */
@Injectable()
export class ResendMailService extends MailService {
  private readonly logger = new Logger(ResendMailService.name);
  private static readonly API_URL = 'https://api.resend.com/emails';

  /** Empty when unconfigured — see SesMailService's constructor for why this
   * must never throw: every provider is instantiated regardless of which
   * one the factory ends up routing traffic to. */
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly contactEmail: string;

  constructor(config: ConfigService) {
    super();
    const auth = config.getOrThrow<AuthConfig>('auth');
    this.apiKey = auth.resendApiKey ?? '';
    this.fromEmail = auth.resendFromEmail ?? '';
    this.fromName = auth.resendFromName;
    this.contactEmail = auth.contactEmail;
  }

  private async send(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
    /** Set on outbound notifications that a human should be able to just
     * hit "Reply" on — e.g. the contact form, where the visitor's own
     * address is the useful destination for a reply, not this From. */
    replyTo?: string;
  }): Promise<void> {
    const res = await fetch(ResendMailService.API_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: params.to,
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
        subject: params.subject,
        html: params.html,
        text: params.text,
        tags: [{ name: 'source', value: 'codonmind-nexus' }],
      }),
    });

    if (!res.ok) {
      // Resend's error body is consistently { statusCode, name, message }
      // (§ Resend API error format) — surfaced verbatim so a 401
      // ("missing_api_key") reads differently from a 422
      // ("missing_required_field: ...") in the logs.
      const body: unknown = await res.json().catch(() => null);
      const detail =
        body && typeof body === 'object' && 'message' in body
          ? String(body.message)
          : res.statusText;
      throw new Error(`Resend send failed (${res.status}): ${detail}`);
    }

    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    this.logger.debug(`Resend accepted message ${body?.id ?? '(no id)'}`);
  }

  async sendInvitation(email: InvitationEmail): Promise<void> {
    const { subject, html, text } = invitationContent(email);
    await this.send({ to: email.to, subject, html, text });
  }

  async sendLoginOtp(email: OtpEmail): Promise<void> {
    const { subject, html, text } = loginOtpContent(email);
    await this.send({ to: email.to, subject, html, text });
    this.logger.log(`Login code emailed to ${email.to}`);
  }

  async sendWelcome(email: WelcomeEmail): Promise<void> {
    const { subject, html, text } = welcomeContent(email);
    await this.send({ to: email.to, subject, html, text });
  }

  /**
   * Delivers a public contact-form submission to the business inbox, with
   * Reply-To set to the visitor's own address — answering it is one click,
   * same as replying to a forwarded email.
   */
  async sendContactMessage(email: ContactMessageEmail): Promise<void> {
    const { subject, html, text } = contactMessageContent(email);
    await this.send({
      to: this.contactEmail,
      replyTo: email.email,
      subject,
      html,
      text,
    });
    this.logger.log(`Contact form message emailed from ${email.email}`);
  }
}
