import {
  createPublicKey,
  verify as verifySignature,
  type JsonWebKey,
} from 'node:crypto';

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** The subset of Google's ID-token claims this platform needs. */
export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name?: string;
  sub: string;
}

interface Jwk {
  kid: string;
  n: string;
  e: string;
  kty: string;
  alg?: string;
}

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
/** Google rotates signing keys; re-fetch rather than trust a stale cache. */
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Verifies a Google ID token (the credential returned by Google Identity
 * Services) without adding a dependency.
 *
 * Node's crypto can build a public key straight from a JWK and check an RS256
 * signature, so the whole verification is: fetch Google's published keys, check
 * the signature, then check the claims. Doing it by hand means being explicit
 * about every claim that matters — an unverified email or a token minted for a
 * different client would both be accepted by a signature check alone.
 *
 * Inactive unless GOOGLE_OAUTH_CLIENT_ID is set, so the platform runs without
 * any Google configuration (§4/§14 make infrastructure the client's).
 */
@Injectable()
export class GoogleTokenService {
  private readonly logger = new Logger(GoogleTokenService.name);
  private keys: { fetchedAt: number; jwks: Jwk[] } | null = null;

  constructor(private readonly config: ConfigService) {}

  get clientId(): string | null {
    return this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID') ?? null;
  }

  get enabled(): boolean {
    return Boolean(this.clientId);
  }

  /**
   * Verify a credential and return the identity it asserts.
   *
   * Throws UnauthorizedException for anything suspect: this runs before we know
   * who the caller is, so it fails closed on every check.
   */
  async verify(credential: string): Promise<GoogleIdentity> {
    const clientId = this.clientId;
    if (!clientId) {
      throw new UnauthorizedException(
        'Google sign-in is not configured on this server.',
      );
    }

    const parts = credential.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Malformed Google credential.');
    }
    const [rawHeader, rawPayload, rawSignature] = parts;

    const header = decodeSegment<{ alg: string; kid: string }>(rawHeader);
    if (header.alg !== 'RS256') {
      throw new UnauthorizedException('Unexpected Google token algorithm.');
    }

    const jwk = (await this.jwks()).find((k) => k.kid === header.kid);
    if (!jwk) {
      throw new UnauthorizedException('Unknown Google signing key.');
    }

    const signatureOk = verifySignature(
      'RSA-SHA256',
      Buffer.from(`${rawHeader}.${rawPayload}`),
      createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' }),
      Buffer.from(rawSignature, 'base64url'),
    );
    if (!signatureOk) {
      throw new UnauthorizedException(
        'Google credential signature is invalid.',
      );
    }

    const payload = decodeSegment<{
      iss: string;
      aud: string;
      exp: number;
      email?: string;
      email_verified?: boolean | string;
      name?: string;
      sub: string;
    }>(rawPayload);

    if (!ISSUERS.has(payload.iss)) {
      throw new UnauthorizedException('Google credential has a wrong issuer.');
    }
    // Without this check, a token minted for ANY other Google app would be
    // accepted here — the single most important claim to pin down.
    if (payload.aud !== clientId) {
      throw new UnauthorizedException(
        'Google credential was issued for a different application.',
      );
    }
    if (payload.exp * 1000 <= Date.now()) {
      throw new UnauthorizedException('Google credential has expired.');
    }
    if (!payload.email) {
      throw new UnauthorizedException('Google credential carries no email.');
    }
    // Google encodes this as a boolean or the string "true" depending on flow.
    const emailVerified =
      payload.email_verified === true || payload.email_verified === 'true';
    if (!emailVerified) {
      throw new UnauthorizedException(
        'That Google account has an unverified email address.',
      );
    }

    return {
      email: payload.email.toLowerCase(),
      emailVerified,
      name: payload.name,
      sub: payload.sub,
    };
  }

  private async jwks(): Promise<Jwk[]> {
    const fresh =
      this.keys && Date.now() - this.keys.fetchedAt < CACHE_TTL_MS
        ? this.keys.jwks
        : null;
    if (fresh) return fresh;

    try {
      const res = await fetch(CERTS_URL);
      if (!res.ok) throw new Error(`certs endpoint returned ${res.status}`);
      const body = (await res.json()) as { keys: Jwk[] };
      this.keys = { fetchedAt: Date.now(), jwks: body.keys };
      return body.keys;
    } catch (error) {
      this.logger.error(
        `Could not fetch Google signing keys: ${String(error)}`,
      );
      // Fall back to a stale cache rather than lock everyone out on a blip;
      // the signature check still has to pass against those keys.
      if (this.keys) return this.keys.jwks;
      throw new UnauthorizedException(
        'Could not reach Google to verify that sign-in. Try again.',
      );
    }
  }
}

function decodeSegment<T>(segment: string): T {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString()) as T;
  } catch {
    throw new UnauthorizedException('Malformed Google credential.');
  }
}
