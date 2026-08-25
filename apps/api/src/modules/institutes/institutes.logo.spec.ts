import { NotFoundException } from '@nestjs/common';

import { InstitutesService } from './institutes.service';

/**
 * Institute branding (§ institute branding): an ADMIN sets/clears their own
 * institute's logo via `updateMyInstitute`, and every read path resolves the
 * stored key to a URL rather than ever handing a raw key back to a caller.
 */
describe('InstitutesService — logo', () => {
  const INSTITUTE = 'inst-mine';
  const OTHER_INSTITUTE = 'inst-theirs';
  const LOGO_KEY = 'logo-key-123.png';

  function build(opts: { publicUrl?: string | null } = {}) {
    let instituteRow: Record<string, unknown> = {
      id: INSTITUTE,
      name: 'Sunrise Academy',
      slug: 'sunrise',
      code: '1234',
      isActive: true,
      createdAt: new Date(),
      logoKey: null as string | null,
    };

    const prisma = {
      institute: {
        findUnique: jest.fn(({ where }) =>
          where.id === instituteRow.id ? instituteRow : null,
        ),
        update: jest.fn(({ data }) => {
          instituteRow = { ...instituteRow, ...data };
          return instituteRow;
        }),
      },
      media: {
        findFirst: jest.fn(({ where }) => {
          if (where.key !== LOGO_KEY) return null;
          if (where.instituteId !== INSTITUTE) return null;
          return { id: 'media-1' };
        }),
      },
    };

    const storage = {
      name: 'test',
      publicUrl: jest.fn((key: string) =>
        opts.publicUrl === undefined
          ? `https://cdn.test/${key}`
          : opts.publicUrl,
      ),
    };

    const service = new InstitutesService(prisma as never, storage as never);
    return { service, prisma, storage, getInstituteRow: () => instituteRow };
  }

  it('sets the logo when the key belongs to the caller institute, returning a resolved logoUrl', async () => {
    const { service, getInstituteRow } = build();
    const out = await service.updateMyInstitute(INSTITUTE, {
      logoKey: LOGO_KEY,
    });
    expect(getInstituteRow().logoKey).toBe(LOGO_KEY);
    expect(out.logoUrl).toBe(`https://cdn.test/${LOGO_KEY}`);
    // The raw key is never handed back to the caller.
    expect('logoKey' in out).toBe(false);
  });

  it('falls back to the streaming route when the backend has no public URL', async () => {
    const { service } = build({ publicUrl: null });
    const out = await service.updateMyInstitute(INSTITUTE, {
      logoKey: LOGO_KEY,
    });
    expect(out.logoUrl).toBe(`/media/file/${encodeURIComponent(LOGO_KEY)}`);
  });

  it('refuses a logo key that belongs to a different institute', async () => {
    const { service } = build();
    await expect(
      service.updateMyInstitute(OTHER_INSTITUTE, { logoKey: LOGO_KEY }),
    ).rejects.toThrow(NotFoundException);
  });

  it('clears the logo when logoKey is explicitly null', async () => {
    const { service, getInstituteRow } = build();
    await service.updateMyInstitute(INSTITUTE, { logoKey: LOGO_KEY });
    expect(getInstituteRow().logoKey).toBe(LOGO_KEY);

    const out = await service.updateMyInstitute(INSTITUTE, { logoKey: null });
    expect(getInstituteRow().logoKey).toBeNull();
    expect(out.logoUrl).toBeNull();
  });

  it('leaves the logo untouched when logoKey is omitted (a rename-only call)', async () => {
    const { service, getInstituteRow } = build();
    await service.updateMyInstitute(INSTITUTE, { logoKey: LOGO_KEY });
    await service.updateMyInstitute(INSTITUTE, { name: 'New Name' });
    expect(getInstituteRow().logoKey).toBe(LOGO_KEY);
    expect(getInstituteRow().name).toBe('New Name');
  });

  it('myInstitute() reports logoUrl: null when no logo has ever been set', async () => {
    const { service } = build();
    const out = await service.myInstitute(INSTITUTE);
    expect(out.logoUrl).toBeNull();
  });
});
