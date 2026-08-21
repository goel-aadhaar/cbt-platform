import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../../database/prisma.service';
import type { MailService } from './mail/mail.service';
import { OtpService } from './otp.service';

/**
 * A code that never reached the person signing in.
 *
 * The delivery failure used to escape `issue()` untouched and surface as a 500
 * "Internal server error" — indistinguishable, from the outside, from a crashed
 * server. It cost a live deployment an afternoon: SES was still in its sandbox
 * and refused the recipient, and nothing in the response said so.
 *
 * Two things have to hold, and neither is visible from the HTTP status alone:
 * the caller must be told this is a delivery problem rather than a bad
 * password, and the challenge row must be burned. A live challenge for a code
 * nobody has is only a trap.
 */
describe('OtpService.issue — mail delivery fails', () => {
  const CHALLENGE_ID = 'chal_1';

  function build(sendLoginOtp: jest.Mock) {
    const consumed: unknown[] = [];
    const prisma = {
      otpChallenge: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn((args: unknown) => {
          consumed.push(args);
          return Promise.resolve({ count: 1 });
        }),
      },
      $transaction: jest.fn(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          await fn({
            otpChallenge: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
              create: jest.fn().mockResolvedValue({
                id: CHALLENGE_ID,
                expiresAt: new Date(Date.now() + 600_000),
              }),
            },
          }),
      ),
    } as unknown as PrismaService;

    const config = {
      getOrThrow: () => ({ otpMaxPerWindow: 30, otpWindowMinutes: 15 }),
    } as unknown as ConfigService;

    const service = new OtpService(
      prisma,
      { sendLoginOtp } as unknown as MailService,
      config,
    );
    return { service, consumed, prisma };
  }

  const params = {
    userId: 'user_1',
    name: 'Platform Owner',
    email: 'superadmin@drsk.local',
    allowedRoles: [],
  };

  it('reports a delivery problem, not a server fault', async () => {
    const { service } = build(
      jest
        .fn()
        .mockRejectedValue(
          new Error(
            'Email address is not verified. The following identities failed ' +
              'the check in region AP-SOUTH-1: superadmin@drsk.local',
          ),
        ),
    );

    await expect(service.issue(params)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('does not blame the password, which was already accepted', async () => {
    const { service } = build(jest.fn().mockRejectedValue(new Error('nope')));

    await expect(service.issue(params)).rejects.toThrow(/mail-delivery/i);
  });

  it('burns the challenge, so no undelivered code stays redeemable', async () => {
    const { service, consumed } = build(
      jest.fn().mockRejectedValue(new Error('nope')),
    );

    await expect(service.issue(params)).rejects.toThrow();

    expect(consumed).toHaveLength(1);
    const args = consumed[0] as {
      where: { id: string; consumedAt: null };
      data: { consumedAt: Date };
    };
    expect(args.where.id).toBe(CHALLENGE_ID);
    expect(args.where.consumedAt).toBeNull();
    expect(args.data.consumedAt).toBeInstanceOf(Date);
  });

  it('still issues normally when the mail goes out', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const { service, consumed } = build(send);

    const issued = await service.issue(params);

    expect(issued.challengeId).toBe(CHALLENGE_ID);
    // The success path must not consume what it just created.
    expect(consumed).toHaveLength(0);
    // A six-digit code reached the mailer, not a hash of one.
    expect(send.mock.calls[0][0].code).toMatch(/^\d{6}$/);
  });
});
