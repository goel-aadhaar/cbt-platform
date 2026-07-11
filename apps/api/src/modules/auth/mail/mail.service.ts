export interface InvitationEmail {
  to: string;
  name: string;
  role: string;
  /** Fully-built accept-invite URL (frontend link with the raw token). */
  inviteUrl: string;
  /** Institute name, when applicable (absent for superadmin invites). */
  institute?: string;
}

/**
 * Mail port (abstract class used as the DI token). Concrete adapters:
 *   - ConsoleMailService — dev: logs the message + invite link.
 *   - SesMailService     — prod: AWS SES (added once credentials exist).
 * Following the platform's "port + adapter" pattern (contract §2.6).
 */
export abstract class MailService {
  abstract sendInvitation(email: InvitationEmail): Promise<void>;
}
