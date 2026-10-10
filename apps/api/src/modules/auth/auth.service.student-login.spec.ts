import { UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';

/** Institute IDs are stored lowercase; what a student types is normalised. */
describe('AuthService.loginStudent - Institute ID lookup', () => {
  function build() {
    const prisma = {
      institute: { findUnique: jest.fn().mockResolvedValue(null) },
      student: { findUnique: jest.fn() },
    };
    const service = new AuthService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  }

  it.each([
    ['Demo ', 'demo'],
    ['  SUNRISE-Academy', 'sunrise-academy'],
    ['demo', 'demo'],
  ])('looks %p up as %p', async (typed, looked) => {
    const { service, prisma } = build();
    await expect(
      service.loginStudent(typed, '2400183920', 'pw', {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.institute.findUnique).toHaveBeenCalledWith({
      where: { slug: looked },
    });
    expect(prisma.student.findUnique).not.toHaveBeenCalled();
  });
});
