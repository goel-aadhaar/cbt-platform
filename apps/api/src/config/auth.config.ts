import { registerAs } from '@nestjs/config';

export interface AuthConfig {
  /** RS256 private key (PEM) — signs tokens. */
  jwtPrivateKey: string;
  /** RS256 public key (PEM) — verifies tokens. */
  jwtPublicKey: string;
  jwtExpiresIn: string;
  /** How long an invitation link stays valid, in hours. */
  inviteTtlHours: number;
  /** Base URL of the frontend, used to build the accept-invite link. */
  frontendUrl: string;
  /** Login OTP issuance cap per account, and the window it applies over. */
  otpMaxPerWindow: number;
  otpWindowMinutes: number;
  /**
   * Verified SES sender address — the SECONDARY mail transport. Used alone
   * if Resend isn't configured, or as AuthModule's live fallback when a
   * Resend send fails.
   */
  sesFromEmail?: string;
  /** Display name on the From header. Falls back to a generic default. */
  sesFromName: string;
  /**
   * Resend API key — the PRIMARY mail transport. Its presence (alongside
   * `resendFromEmail`) is what selects the Resend adapter over SES/console —
   * see AuthModule's `MailService` factory.
   */
  resendApiKey?: string;
  /** Verified sender address/domain in the Resend account. */
  resendFromEmail?: string;
  /** Display name on the From header. Falls back to a generic default. */
  resendFromName: string;
  /** Inbox the public site's contact form delivers to. */
  contactEmail: string;
}

/** Keys are stored base64-encoded in env (so multi-line PEMs fit on one line). */
const decodePem = (base64: string): string =>
  Buffer.from(base64, 'base64').toString('utf8');

/**
 * Typed 'auth' config namespace. Values are guaranteed valid because
 * validateEnv (env.schema.ts) gates bootstrap.
 */
export const authConfig = registerAs('auth', (): AuthConfig => ({
  jwtPrivateKey: decodePem(process.env.JWT_PRIVATE_KEY as string),
  jwtPublicKey: decodePem(process.env.JWT_PUBLIC_KEY as string),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  inviteTtlHours: Number(process.env.INVITE_TTL_HOURS ?? 72),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  otpMaxPerWindow: Number(process.env.OTP_MAX_PER_WINDOW ?? 30),
  otpWindowMinutes: Number(process.env.OTP_WINDOW_MINUTES ?? 15),
  sesFromEmail: process.env.AWS_SES_FROM_EMAIL || undefined,
  sesFromName: process.env.AWS_SES_FROM_NAME ?? 'Codonmind Nexus',
  resendApiKey: process.env.RESEND_API_KEY || undefined,
  resendFromEmail: process.env.RESEND_FROM_EMAIL || undefined,
  resendFromName: process.env.RESEND_FROM_NAME ?? 'Codonmind Nexus',
  contactEmail: process.env.CONTACT_EMAIL || 'business@codonmind.in',
}));
