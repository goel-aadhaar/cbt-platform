import { AuthService } from './auth.service';

/**
 * Issuing a session revokes the user's older ones and creates the new one in
 * ONE batch whose order matters: revoke first, then create. Run through the
 * tenant extension each step became its own transaction and the order was lost,
 * so the create could land first and the revoke then ended the new session.
 * The batch must go through the un-extended client, in that order.
 */
describe('AuthService.issueSession - ordering', () => {
  it('runs revoke, create, link in that order on the raw client', async () => {
    const calls: string[] = [];
    const op = (name: string) => jest.fn(() => ({ name }));
    const raw = {
      session: { updateMany: op('revoke-old'), create: op('create-new') },
      user: { update: op('link-user') },
      $transaction: jest.fn((ops: { name: string }[]) => {
        calls.push(...ops.map((o) => o.name));
        return Promise.resolve([]);
      }),
    };
    const extended = {
      $transaction: jest.fn(),
      session: { updateMany: jest.fn(), create: jest.fn() },
      user: { update: jest.fn() },
      raw,
    };
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('token'),
      decode: jest.fn().mockReturnValue({ exp: 4102444800 }),
    };
    const service = new AuthService(
      extended as never,
      {} as never,
      jwt as never,
      {} as never,
    );

    const token = await (
      service as unknown as {
        issueSession: (
          userId: string,
          meta: object,
          role: string | null,
        ) => Promise<string>;
      }
    ).issueSession('user-1', {}, 'ADMIN');

    expect(token).toBe('token');
    expect(calls).toEqual(['revoke-old', 'create-new', 'link-user']);
    expect(extended.$transaction).not.toHaveBeenCalled();
    expect(extended.session.create).not.toHaveBeenCalled();
  });
});
