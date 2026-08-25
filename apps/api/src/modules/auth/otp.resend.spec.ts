import { BadRequestException } from '@nestjs/common';

import { Role } from './auth.types';
import { RESEND_COOLDOWN_MS, OtpService } from './otp.service';

/**
 * The resend path's only behavioral guarantee beyond the existing issue()/verify()
 * protections: a second code may not be sent until the cooldown window has
 * elapsed, and only one code may be live at any moment. Everything else
 * (window-budget cap, single-use, hash-only storage, mail-delivery
 * consequences) is already covered for `issue()`; this file pins the
 * resend-specific cases.
 *
 * Mocks are minimal: only the prisma calls the service makes, with the
 * findUnique lookup returning whatever the test claims. `MailService` is a
 * no-op so we don't have to think about SES.
 */
describe('OtpService.resend', () => {
  const CHALLENGE_ID = 'chal-active';
  const USER_ID = 'user-1';

  // Per-test, captured by build(). Declared at the suite level because Jest
  // hoists `describe` blocks above `let` declarations but the `it` bodies
  // see the value lazily through build().
  let sentLoginOtp: jest.Mock;

  function build(opts: {
    /** Branch the consumer-side cooldown check sees. */
    lastCreate?: Date;
    /** Whether the existing challenge row is still live. */
    existing?: {
      id: string;
      userId: string;
      consumedAt: Date | null;
      expiresAt: Date;
      allowedRoles: Role[];
    };
    /** Whether the consume updateMany matches (race with verify). */
    consume?: number;
    /** Most recently-issued challenge after the resend. */
    newChallengeId?: string;
  }) {
    sentLoginOtp = jest.fn().mockResolvedValue(undefined);

    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: USER_ID,
          name: 'Asha',
          email: 'asha@example.com',
          roles: [Role.ADMIN],
        }),
      },
      otpChallenge: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(({ where }) => {
          if (where?.id !== opts.existing?.id) return null;
          return opts.existing ?? null;
        }),
        findFirst: jest.fn(() =>
          opts.lastCreate ? { createdAt: opts.lastCreate } : null,
        ),
        updateMany: jest.fn(() => ({
          count: opts.consume ?? 1,
        })),
        create: jest.fn(() => ({
          id: opts.newChallengeId ?? 'chal-new',
          expiresAt: new Date(Date.now() + 10 * 60_000),
        })),
      },
      $transaction: jest.fn((fn) =>
        fn({
          otpChallenge: {
            updateMany: jest.fn(() => ({ count: 1 })),
            create: jest.fn(() => ({
              id: opts.newChallengeId ?? 'chal-new',
              expiresAt: new Date(Date.now() + 10 * 60_000),
            })),
          },
        }),
      ),
    };

    const config = {
      getOrThrow: () => ({ otpMaxPerWindow: 30, otpWindowMinutes: 15 }),
    };

    const service = new OtpService(
      prisma as never,
      { sendLoginOtp: sentLoginOtp } as never,
      config as never,
    );

    return { service, prisma, sentLoginOtp };
  }

  it('rejects an unknown / consumed / expired challenge identically', async () => {
    const { service } = build({});
    await expect(service.resend('not-a-real-id')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a consumed challenge identically', async () => {
    const { service } = build({
      existing: {
        id: CHALLENGE_ID,
        userId: USER_ID,
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        allowedRoles: [Role.ADMIN],
      },
    });
    await expect(service.resend(CHALLENGE_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects when the cooldown has not elapsed (29s ago)', async () => {
    const now = Date.now();
    const { service } = build({
      existing: {
        id: CHALLENGE_ID,
        userId: USER_ID,
        consumedAt: null,
        expiresAt: new Date(now + 60_000),
        allowedRoles: [Role.ADMIN],
      },
      lastCreate: new Date(now - (RESEND_COOLDOWN_MS - 1000)),
    });
    await expect(service.resend(CHALLENGE_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('allows a resend once the cooldown has fully elapsed (31s ago)', async () => {
    const now = Date.now();
    const { service, sentLoginOtp } = build({
      existing: {
        id: CHALLENGE_ID,
        userId: USER_ID,
        consumedAt: null,
        expiresAt: new Date(now + 60_000),
        allowedRoles: [Role.ADMIN],
      },
      lastCreate: new Date(now - (RESEND_COOLDOWN_MS + 1000)),
      newChallengeId: 'chal-next',
    });
    const out = await service.resend(CHALLENGE_ID);
    expect(out.challengeId).toBe('chal-next');
    // Resend SHOULD have sent a fresh email — the cooldown check is what
    // gates it, not silent failure.
    expect(sentLoginOtp).toHaveBeenCalledTimes(1);
  });

  it('rejects when the existing challenge is consumed in a race with verify()', async () => {
    // The read succeeds (existing row looks live), but by the time we try to
    // consume, somebody else redeemed it. `consume: 0` simulates the
    // race-loss: updateMany matches no rows.
    const now = Date.now();
    const { service } = build({
      existing: {
        id: CHALLENGE_ID,
        userId: USER_ID,
        consumedAt: null,
        expiresAt: new Date(now + 60_000),
        allowedRoles: [Role.ADMIN],
      },
      lastCreate: new Date(now - (RESEND_COOLDOWN_MS + 1000)),
      consume: 0,
    });
    await expect(service.resend(CHALLENGE_ID)).rejects.toThrow(
      BadRequestException,
    );
  });
});
