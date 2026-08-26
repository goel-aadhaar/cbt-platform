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
 * AWS SES mail adapter (§2.6) — the secondary transport, used when Resend is
 * unconfigured or fails (see AuthModule's `MailService` factory).
 *
 * The AWS SDK is loaded lazily so the package is only required once SES is
 * actually configured; the platform ships and runs without it (infrastructure
 * is the client's responsibility, §4/§14), matching S3MediaAdapter's pattern.
 * Install `@aws-sdk/client-ses` and set AWS_SES_FROM_EMAIL / AWS_REGION /
 * credentials to activate — the sending identity (address or domain) must
 * already be verified in SES, and the account out of the sandbox to reach
 * recipients who haven't themselves been verified.
 *
 * Credentials are resolved by the SDK's own default provider chain (env vars,
 * shared config file, or an IAM role) — nothing here reads a secret directly.
 */
@Injectable()
export class SesMailService extends MailService {
  private readonly logger = new Logger(SesMailService.name);
  /**
   * Empty when unconfigured. NestJS instantiates every registered provider
   * regardless of which one AuthModule's factory ends up picking, so this
   * constructor must never throw on missing config — only AuthModule routes
   * traffic here at all once sesFromEmail is set (see the MailService
   * factory), so `send()` failing loudly on an empty from-address in that
   * case would be a wiring bug, not a normal condition to guard against here.
   */
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly contactEmail: string;
  private readonly region: string;
  /** Typed loosely: the SDK is an optional peer, resolved at runtime. */
  private client: unknown = null;

  constructor(config: ConfigService) {
    super();
    const auth = config.getOrThrow<AuthConfig>('auth');
    this.fromEmail = auth.sesFromEmail ?? '';
    this.fromName = auth.sesFromName;
    this.contactEmail = auth.contactEmail;
    this.region = config.get<string>('AWS_REGION') ?? 'ap-south-1';
  }

  private async sdk(): Promise<{
    client: { send: (cmd: unknown) => Promise<unknown> };
    SendEmailCommand: new (i: unknown) => unknown;
  }> {
    // Indirect specifier: the SDK is an OPTIONAL dependency, so the import
    // must not be resolved at compile time on installs that don't have it.
    const specifier = '@aws-sdk/client-ses';
    const mod = (await (import(specifier) as Promise<unknown>)) as {
      SESClient: new (cfg: unknown) => {
        send: (cmd: unknown) => Promise<unknown>;
      };
      SendEmailCommand: new (i: unknown) => unknown;
    };
    this.client ??= new mod.SESClient({ region: this.region });
    return {
      client: this.client as { send: (cmd: unknown) => Promise<unknown> },
      SendEmailCommand: mod.SendEmailCommand,
    };
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
    const { client, SendEmailCommand } = await this.sdk();
    await client.send(
      new SendEmailCommand({
        Source: `${this.fromName} <${this.fromEmail}>`,
        Destination: { ToAddresses: [params.to] },
        ...(params.replyTo ? { ReplyToAddresses: [params.replyTo] } : {}),
        Message: {
          Subject: { Data: params.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: params.html, Charset: 'UTF-8' },
            Text: { Data: params.text, Charset: 'UTF-8' },
          },
        },
      }),
    );
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
