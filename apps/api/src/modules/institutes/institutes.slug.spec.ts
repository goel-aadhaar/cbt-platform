import { ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { Prisma } from '../../generated/prisma/client';
import { UpdateInstituteDto } from './dto/update-institute.dto';
import { UpdateMyInstituteDto } from './dto/update-my-institute.dto';
import { InstitutesService } from './institutes.service';

/**
 * The Institute ID is `Institute.slug` - what a student types at sign-in. Both
 * the institute admin (`PATCH /institutes/me`) and the platform admin
 * (`PATCH /institutes/:id`) can change it.
 */
describe('InstitutesService - Institute ID (slug) edit', () => {
  const ID = 'inst-1';

  function p2002(meta: unknown) {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
      meta: meta as Record<string, unknown>,
    });
  }

  function build(
    opts: { taken?: boolean; updateError?: unknown; exists?: boolean } = {},
  ) {
    let row: Record<string, unknown> = {
      id: ID,
      name: 'Sunrise Academy',
      slug: 'sunrise',
      code: '1234',
      isActive: true,
      createdAt: new Date(),
      logoKey: null,
    };
    const prisma = {
      institute: {
        findUnique: jest.fn(({ where }) =>
          opts.exists === false || where.id !== ID ? null : row,
        ),
        findFirst: jest.fn(() => (opts.taken ? { id: 'inst-2' } : null)),
        update: jest.fn(({ data }) => {
          if (opts.updateError) throw opts.updateError as Error;
          row = { ...row, ...data };
          return row;
        }),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const storage = { name: 'test', publicUrl: jest.fn(() => null) };
    const service = new InstitutesService(
      prisma as never,
      storage as never,
      audit as never,
    );
    return { service, prisma, audit };
  }

  const callers: [
    string,
    (s: InstitutesService, dto: Record<string, unknown>) => Promise<unknown>,
  ][] = [
    ['updateMyInstitute', (s, dto) => s.updateMyInstitute(ID, dto)],
    ['update (superadmin)', (s, dto) => s.update(ID, dto)],
  ];

  describe.each(callers)('%s', (_label, call) => {
    it('changes the slug and returns slug and code', async () => {
      const { service, prisma } = build();
      const out = await call(service, { slug: 'new-id' });
      expect(prisma.institute.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { slug: 'new-id' } }),
      );
      expect(out).toMatchObject({ slug: 'new-id', code: '1234' });
    });

    it('checks for another institute holding the slug, excluding itself', async () => {
      const { service, prisma } = build();
      await call(service, { slug: 'new-id' });
      expect(prisma.institute.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'new-id', id: { not: ID } },
        }),
      );
    });

    it('is a no-op when the slug is unchanged: no lookup, no slug write, no audit', async () => {
      const { service, prisma, audit } = build();
      await call(service, { slug: 'sunrise', name: 'Renamed' });
      expect(prisma.institute.findFirst).not.toHaveBeenCalled();
      expect(prisma.institute.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Renamed' } }),
      );
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('does not look the slug up at all when it is omitted', async () => {
      const { service, prisma, audit } = build();
      await call(service, { name: 'Renamed' });
      expect(prisma.institute.findFirst).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('answers 409 when another institute already has it', async () => {
      const { service, prisma } = build({ taken: true });
      const err = await call(service, { slug: 'taken' }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).message).toBe(
        'That Institute ID is already taken',
      );
      expect(prisma.institute.update).not.toHaveBeenCalled();
    });

    it.each([
      [
        'driver-adapter shape',
        { driverAdapterError: { cause: { constraint: { fields: ['slug'] } } } },
      ],
      ['target array', { target: ['slug'] }],
      ['bare constraint name', { target: 'institutes_slug_key' }],
      ['no detail at all', undefined],
    ])(
      'maps a lost unique-index race (%s) to the same 409',
      async (_n, meta) => {
        const { service, audit } = build({ updateError: p2002(meta) });
        const err = await call(service, { slug: 'racy' }).catch(
          (e: unknown) => e,
        );
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).message).toBe(
          'That Institute ID is already taken',
        );
        expect(audit.record).not.toHaveBeenCalled();
      },
    );

    it('does not turn an unrelated P2002 into the slug message', async () => {
      const boom = p2002({ target: ['code'] });
      const { service } = build({ updateError: boom });
      await expect(call(service, { slug: 'racy' })).rejects.toBe(boom);
    });

    it('audits the old and the new slug', async () => {
      const { service, audit } = build();
      await call(service, { slug: 'new-id' });
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INSTITUTE_SLUG_CHANGED',
          entityType: 'Institute',
          entityId: ID,
          instituteId: ID,
          metadata: { oldSlug: 'sunrise', newSlug: 'new-id' },
        }),
      );
    });
  });

  it('update() 404s for an unknown institute before touching the slug', async () => {
    const { service } = build({ exists: false });
    await expect(service.update(ID, { slug: 'x-y-z' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('Institute ID validation on the update DTOs', () => {
  async function errorsFor<T extends object>(cls: new () => T, plain: object) {
    const dto = plainToInstance(cls, plain);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return { dto, errors };
  }

  describe.each([
    ['UpdateMyInstituteDto', UpdateMyInstituteDto],
    ['UpdateInstituteDto', UpdateInstituteDto],
  ])('%s', (_n, cls) => {
    it('trims and lowercases', async () => {
      const { dto, errors } = await errorsFor(cls, {
        slug: '  Sunrise-Academy ',
      });
      expect(errors).toEqual([]);
      expect((dto as { slug: string }).slug).toBe('sunrise-academy');
    });

    it('accepts an omitted slug', async () => {
      const { errors } = await errorsFor(cls, { name: 'Fine Name' });
      expect(errors).toEqual([]);
    });

    it.each([
      ['too short', 'ab'],
      ['too long', 'a'.repeat(41)],
      ['spaces inside', 'my academy'],
      ['underscore', 'my_academy'],
      ['leading hyphen', '-academy'],
      ['trailing hyphen', 'academy-'],
      ['double hyphen', 'my--academy'],
      ['symbols', 'academy!'],
      ['empty', ''],
    ])('rejects %s', async (_why, slug) => {
      const { errors } = await errorsFor(cls, { slug });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('slug');
    });

    it.each(['admin', 'API', ' Login ', 'superadmin', 'www', 'student'])(
      'rejects the reserved word %p',
      async (slug) => {
        const { errors } = await errorsFor(cls, { slug });
        expect(JSON.stringify(errors)).toContain('reserved');
      },
    );

    it('accepts a normal hyphenated or numeric ID', async () => {
      expect((await errorsFor(cls, { slug: 'abc-123' })).errors).toEqual([]);
      expect((await errorsFor(cls, { slug: '2601' })).errors).toEqual([]);
    });
  });
});
