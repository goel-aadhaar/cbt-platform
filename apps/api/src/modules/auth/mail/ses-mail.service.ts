import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthConfig } from '../../../config/auth.config';
import { InvitationEmail, MailService, OtpEmail } from './mail.service';

/**
 * AWS SES mail adapter (§2.6) — the production adapter.
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
  private readonly region: string;
  /** Typed loosely: the SDK is an optional peer, resolved at runtime. */
  private client: unknown = null;

  constructor(config: ConfigService) {
    super();
    const auth = config.getOrThrow<AuthConfig>('auth');
    this.fromEmail = auth.sesFromEmail ?? '';
    this.fromName = auth.sesFromName;
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
  }): Promise<void> {
    const { client, SendEmailCommand } = await this.sdk();
    await client.send(
      new SendEmailCommand({
        Source: `${this.fromName} <${this.fromEmail}>`,
        Destination: { ToAddresses: [params.to] },
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
    const subject = email.institute
      ? `You're invited to join ${email.institute} on DRSK CBT`
      : "You're invited to DRSK CBT";
    const greeting = `Hi ${escapeHtml(email.name)},`;
    const body = email.institute
      ? `You've been invited to join <strong>${escapeHtml(email.institute)}</strong> as ${escapeHtml(roleLabel(email.role))}.`
      : `You've been invited to DRSK CBT as ${escapeHtml(roleLabel(email.role))}.`;

    await this.send({
      to: email.to,
      subject,
      html: layout(`
        <p>${greeting}</p>
        <p>${body}</p>
        <p style="margin: 28px 0;">
          <a href="${email.inviteUrl}" style="${buttonStyle}">Accept invitation</a>
        </p>
        <p style="color:#6b7280;font-size:13px;">
          If the button doesn't work, copy this link into your browser:<br />
          <a href="${email.inviteUrl}">${email.inviteUrl}</a>
        </p>
      `),
      text:
        `${greeting}\n\n` +
        `${stripHtml(body)}\n\n` +
        `Accept your invitation: ${email.inviteUrl}\n`,
    });
  }

  /**
   * The code is never logged here — only the console adapter does that, and
   * only because it has no other way to deliver it in development.
   */
  async sendLoginOtp(email: OtpEmail): Promise<void> {
    const subject = `${email.code} is your DRSK CBT sign-in code`;
    await this.send({
      to: email.to,
      subject,
      html: layout(`
        <p>Hi ${escapeHtml(email.name)},</p>
        <p>Use this code to finish signing in. It expires in ${email.expiresInMinutes} minutes.</p>
        <p style="margin: 28px 0; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #111827;">
          ${email.code}
        </p>
        <p style="color:#6b7280;font-size:13px;">
          Didn't try to sign in? You can ignore this email — the code will
          simply expire.
        </p>
      `),
      text:
        `Hi ${email.name},\n\n` +
        `Your DRSK CBT sign-in code: ${email.code}\n` +
        `Expires in ${email.expiresInMinutes} minutes.\n\n` +
        `Didn't try to sign in? You can ignore this email.\n`,
    });
    this.logger.log(`Login code emailed to ${email.to}`);
  }
}

const buttonStyle =
  'display:inline-block;background:#111827;color:#ffffff;text-decoration:none;' +
  'padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;';

function layout(inner: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
      <tr><td>
        <p style="font-weight:700;font-size:18px;margin:0 0 20px;">DRSK CBT</p>
        ${inner}
      </td></tr>
    </table>
  </body>
</html>`;
}

function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '');
}
