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
}));
