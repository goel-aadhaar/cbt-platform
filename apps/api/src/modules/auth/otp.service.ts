import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthConfig } from '../../config/auth.config';
import { PrismaService } from '../../database/prisma.service';
import { Role } from './auth.types';
import { MailService } from './mail/mail.service';

/** How long a code stays usable. Short: it is delivered instantly by email. */
const TTL_MINUTES = 10;
/** Wrong guesses before the challenge is burned. 6 digits = 1e6 space. */
const MAX_ATTEMPTS = 5;

export interface OtpChallengeIssued {
  challengeId: string;
  expiresAt: Date;
}

/**
 * Email one-time codes — the mandatory second factor for every non-student
 * sign-in (§2.2).
 *
 * Design rules, all of which matter:
 *  - Issued ONLY after a password has already verified. A code is a second
 *    factor, never a login on its own.
 *  - Only the sha256 hash is stored, so a database leak yields no usable code.
 *  - Single use, short TTL, capped wrong guesses, capped issuance rate.
 *  - The roles the original door allowed are captured on the challenge, so a
 *    code minted at the staff login cannot be redeemed for a platform session.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  /**
   * Codes issuable per user inside the window, to bound inbox-spam / cost.
   *
   * This is a spam/cost bound, NOT the brute-force control — guessing is
   * capped by MAX_ATTEMPTS per challenge, and password guessing by the
   * account lockout in AuthService. So it can be generous without weakening
   * anything, and it needs to be: one person legitimately signs in several
   * times a day (new device, cleared storage, session revoked by signing in
   * elsewhere), and a shared operational account like the platform owner
   * does so far more often. Overridable via env for deployments that want it
   * tighter or looser.
   */
  private readonly maxIssuedPerWindow: number;
  private readonly issueWindowMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    const auth = config.getOrThrow<AuthConfig>('auth');
    this.maxIssuedPerWindow = auth.otpMaxPerWindow;
    this.issueWindowMinutes = auth.otpWindowMinutes;
  }

  /**
   * Mint a code, store its hash, email the plaintext.
   *
   * Any earlier live challenge for this user is consumed first: a new code
   * must invalidate the previous one, or two valid codes would exist at once.
   */
  async issue(params: {
    userId: string;
    name: string;
    email: string;
    allowedRoles: Role[];
    userAgent?: string;
    ip?: string;
  }): Promise<OtpChallengeIssued> {
    await this.assertIssueRateOk(params.userId);

    const now = new Date();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60_000);

    const challenge = await this.prisma.$transaction(async (tx) => {
      await tx.otpChallenge.updateMany({
        where: { userId: params.userId, consumedAt: null },
        data: { consumedAt: now },
      });
      return tx.otpChallenge.create({
        data: {
          userId: params.userId,
          codeHash: this.hash(code),
          allowedRoles: params.allowedRoles,
          expiresAt,
          userAgent: params.userAgent,
          ip: params.ip,
        },
        select: { id: true, expiresAt: true },
      });
    });

    try {
      await this.mail.sendLoginOtp({
        to: params.email,
        name: params.name,
        code,
        expiresInMinutes: TTL_MINUTES,
      });
    } catch (err) {
      /**
       * Undeliverable code — a failure of the mail provider, not of the
       * credentials, which have already been verified by this point.
       *
       * This used to escape as an unhandled 500 "Internal server error",
       * which is both alarming and useless: the operator cannot tell it from a
       * crash, and the person signing in has no idea whether to retry, check
       * their password, or call someone. The usual cause is entirely
       * diagnosable — an SES account still in the sandbox refuses any
       * recipient that has not itself been verified.
       *
       * The challenge is consumed on the way out. A code nobody received can
       * never be redeemed, so leaving it live would only keep a dead row
       * around and let a later attempt look, briefly, like it might work.
       */
      await this.prisma.otpChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      this.logger.error(
        `Could not deliver a sign-in code to ${params.email} — ` +
          'sign-in is blocked until mail delivery works. ' +
          `Provider said: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'We could not send your sign-in code. This is a mail-delivery problem ' +
          'on our side — your password was accepted. Please contact your ' +
          'administrator.',
      );
    }

    return { challengeId: challenge.id, expiresAt: challenge.expiresAt };
  }

  /**
   * Redeem a code. Returns the userId and the roles the issuing door allowed.
   *
   * Every failure says the same thing: distinguishing "wrong code" from
   * "expired" from "no such challenge" tells an attacker which of those they
   * are up against.
   */
  async verify(params: {
    challengeId: string;
    code: string;
  }): Promise<{ userId: string; allowedRoles: Role[] }> {
    const invalid = () =>
      new UnauthorizedException('That code is not valid. Request a new one.');

    const challenge = await this.prisma.otpChallenge.findUnique({
      where: { id: params.challengeId },
    });
    if (
      !challenge ||
      challenge.consumedAt !== null ||
      challenge.expiresAt <= new Date() ||
      challenge.attempts >= MAX_ATTEMPTS
    ) {
      throw invalid();
    }

    if (!this.matches(params.code, challenge.codeHash)) {
      // Count the miss before refusing, so guessing is actually bounded.
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw invalid();
    }

    // Consume conditionally: two concurrent redemptions of the same code must
    // not both succeed and mint two sessions.
    const { count } = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (count === 0) throw invalid();

    return {
      userId: challenge.userId,
      allowedRoles: challenge.allowedRoles,
    };
  }

  /** Bounds how many codes one account can trigger, to limit inbox spam. */
  private async assertIssueRateOk(userId: string): Promise<void> {
    const since = new Date(Date.now() - this.issueWindowMinutes * 60_000);
    const recent = await this.prisma.otpChallenge.count({
      where: { userId, createdAt: { gte: since } },
    });
    if (recent >= this.maxIssuedPerWindow) {
      this.logger.warn(`OTP issue rate exceeded for user ${userId}`);
      throw new UnauthorizedException(
        'Too many codes requested. Wait a few minutes and try again.',
      );
    }
  }

  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /** Constant-time compare, so a wrong code cannot be narrowed by timing. */
  private matches(code: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(code), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}
