export interface InvitationEmail {
  to: string;
  name: string;
  role: string;
  /** Fully-built accept-invite URL (frontend link with the raw token). */
  inviteUrl: string;
  /** Institute name, when applicable (absent for superadmin invites). */
  institute?: string;
}

export interface OtpEmail {
  to: string;
  name: string;
  /** The plaintext 6-digit code. Only ever held in memory, never persisted. */
  code: string;
  /** Minutes until it stops working, so the message can say so. */
  expiresInMinutes: number;
}

/**
 * Mail port (abstract class used as the DI token). Concrete adapters:
 *   - ConsoleMailService — dev: logs the message + invite link / OTP.
 *   - SesMailService     — prod: AWS SES (added once credentials exist).
 * Following the platform's "port + adapter" pattern (contract §2.6).
 */
export abstract class MailService {
  abstract sendInvitation(email: InvitationEmail): Promise<void>;
  abstract sendLoginOtp(email: OtpEmail): Promise<void>;
}
