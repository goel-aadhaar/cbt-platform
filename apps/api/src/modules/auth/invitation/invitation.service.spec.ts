import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { Prisma } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../database/prisma.service';
import { Role, UserStatus } from '../auth.types';
import type { MailService } from '../mail/mail.service';
import type { PasswordService } from '../password.service';
import { InvitationService } from './invitation.service';

/**
 * An invitation is an account plus the email that announces it, and neither
 * half is any use alone.
 *
 * The send used to happen after the transaction had committed, so a provider
 * refusing the message left a PENDING account holding a token nobody had
 * received: the invitee could not accept, and the address could not be invited
 * again because it was now registered. The response was a bare 500, which said
 * none of that.
 */
describe('InvitationService — the email is part of the transaction', () => {
  const INSTITUTE = {
    id: 'inst-1',
    name: 'Test Institute',
    code: '1000',
    slug: 'test',
  };

  function build(sendInvitation: jest.Mock) {
    /** Records whether the transaction body ran to completion. */
    const state = { committed: false, createdUser: false };

    const tx = {
      user: {
        create: jest.fn(() => {
          state.createdUser = true;
          return Promise.resolve({
            id: 'user-1',
            name: 'Asha',
            email: 'asha@example.com',
            roles: [Role.ADMIN],
            status: UserStatus.PENDING,
          });
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      student: { upsert: jest.fn().mockResolvedValue({}) },
      teacherBatch: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      institute: { findUnique: jest.fn().mockResolvedValue(INSTITUTE) },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      // Mirrors Prisma's contract: the body's throw aborts, so nothing the
      // body did is kept.
      $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => {
        const result = await fn(tx);
        state.committed = true;
        return result;
      }),
    } as unknown as PrismaService;

    const config = {
      getOrThrow: () => ({
        inviteTtlHours: 72,
        frontendUrl: 'https://example.test',
      }),
    } as unknown as ConfigService;

    const service = new InvitationService(
      prisma,
      {} as PasswordService,
      { sendInvitation } as unknown as MailService,
      config,
    );
    return { service, state, prisma };
  }

  const actor = {
    userId: 'admin-1',
    role: Role.ADMIN,
    instituteId: INSTITUTE.id,
  };
  const params = { name: 'Asha', email: 'asha@example.com' };

  it('leaves no account behind when the provider refuses the message', async () => {
    const { service, state } = build(
      jest
        .fn()
        .mockRejectedValue(
          new Error(
            'Email address is not verified. The following identities failed ' +
              'the check in region AP-SOUTH-1: asha@example.com',
          ),
        ),
    );

    await expect(service.inviteAdmin(actor, params)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    // The body reached the create — and then threw, so the transaction never
    // completed. That is the rollback.
    expect(state.createdUser).toBe(true);
    expect(state.committed).toBe(false);
  });

  it('tells the administrator what the provider actually said', async () => {
    const { service } = build(
      jest.fn().mockRejectedValue(new Error('Email address is not verified.')),
    );

    // The provider's own words name both the problem and where to fix it;
    // "internal server error" throws away the only useful part.
    await expect(service.inviteAdmin(actor, params)).rejects.toThrow(
      /not verified/,
    );
    await expect(service.inviteAdmin(actor, params)).rejects.toThrow(
      /nothing was\s+created/,
    );
  });

  it('names the address that could not be reached', async () => {
    const { service } = build(jest.fn().mockRejectedValue(new Error('nope')));

    await expect(service.inviteAdmin(actor, params)).rejects.toThrow(
      /asha@example\.com/,
    );
  });

  it('commits once the message is away', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const { service, state } = build(send);

    const invited = await service.inviteAdmin(actor, params);

    expect(invited.email).toBe('asha@example.com');
    expect(state.committed).toBe(true);
    // The invite link, not a bare token, is what goes out.
    expect(send.mock.calls[0][0].inviteUrl).toMatch(
      /^https:\/\/example\.test\/accept-invite\?token=.+/,
    );
  });

  it('explains a duplicate address instead of returning a bare 500', async () => {
    const { service, prisma } = build(jest.fn());
    (prisma.$transaction as unknown as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.inviteAdmin(actor, params)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.inviteAdmin(actor, params)).rejects.toThrow(
      /already registered/,
    );
  });

  it('explains a transaction timeout as the rollback it is', async () => {
    const { service, prisma } = build(jest.fn());
    (prisma.$transaction as unknown as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Transaction timed out', {
        code: 'P2028',
        clientVersion: 'test',
      }),
    );

    await expect(service.inviteAdmin(actor, params)).rejects.toThrow(
      /no account was created/,
    );
  });
});
