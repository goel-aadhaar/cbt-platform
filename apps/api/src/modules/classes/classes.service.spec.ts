import { BadRequestException } from '@nestjs/common';

import { ClassesService } from './classes.service';

describe('ClassesService.destroy', () => {
  const tenant = { getInstituteId: jest.fn(() => 'inst-1') };

  function build(counts: { batches?: number; subjects?: number }) {
    const prisma = {
      class: {
        findFirst: jest.fn().mockResolvedValue({ id: 'c1', name: 'Class 11' }),
        delete: jest.fn().mockResolvedValue({}),
      },
      batch: { count: jest.fn().mockResolvedValue(counts.batches ?? 0) },
      subject: { count: jest.fn().mockResolvedValue(counts.subjects ?? 0) },
    };
    return {
      prisma,
      service: new ClassesService(prisma as never, tenant as never),
    };
  }

  it('is refused while any subject references the class', async () => {
    const { service, prisma } = build({ subjects: 2 });
    await expect(service.destroy('c1')).rejects.toThrow(BadRequestException);
    await expect(service.destroy('c1')).rejects.toThrow(/2 subject\(s\)/);
    expect(prisma.subject.count).toHaveBeenCalledWith({
      where: { classId: 'c1' },
    });
    expect(prisma.class.delete).not.toHaveBeenCalled();
  });

  it('is still refused while batches exist', async () => {
    const { service, prisma } = build({ batches: 1 });
    await expect(service.destroy('c1')).rejects.toThrow(/batch/);
    expect(prisma.class.delete).not.toHaveBeenCalled();
  });

  it('deletes a class nothing references', async () => {
    const { service, prisma } = build({});
    await expect(service.destroy('c1')).resolves.toEqual({
      id: 'c1',
      deleted: true,
    });
    expect(prisma.class.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});
