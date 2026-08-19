import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { UpdateChapterDto } from './dto/update-chapter.dto';

const chapterSelect = {
  id: true,
  name: true,
  subjectId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

/** Chapter management (§2.4) — a chapter belongs to a subject, scoped to the
 * caller's institute. Mirrors ClassesService; readable by TEACHER too. */
@Injectable()
export class ChaptersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private instituteId(): string {
    const id = this.tenant.getInstituteId();
    if (!id)
      throw new ForbiddenException('No institute in the current context');
    return id;
  }

  async create(dto: CreateChapterDto) {
    const instituteId = this.instituteId();
    const subject = await this.prisma.subject.findFirst({
      where: { id: dto.subjectId, instituteId },
    });
    if (!subject) throw new NotFoundException('Subject not found');

    const existing = await this.prisma.chapter.findFirst({
      where: { subjectId: dto.subjectId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `Chapter '${dto.name}' already exists in this subject`,
      );
    }
    return this.prisma.chapter.create({
      data: { name: dto.name, subjectId: dto.subjectId, instituteId },
      select: chapterSelect,
    });
  }

  findAll(subjectId?: string) {
    const instituteId = this.instituteId();
    return this.prisma.chapter.findMany({
      where: { instituteId, ...(subjectId ? { subjectId } : {}) },
      orderBy: { name: 'asc' },
      select: chapterSelect,
    });
  }

  async findOne(id: string) {
    const chapter = await this.prisma.chapter.findFirst({
      where: { id, instituteId: this.instituteId() },
      select: chapterSelect,
    });
    if (!chapter) throw new NotFoundException('Chapter not found');
    return chapter;
  }

  async update(id: string, dto: UpdateChapterDto) {
    await this.findOne(id);
    return this.prisma.chapter.update({
      where: { id },
      data: { name: dto.name },
      select: chapterSelect,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.chapter.update({
      where: { id },
      data: { isActive: false },
      select: chapterSelect,
    });
  }
}
