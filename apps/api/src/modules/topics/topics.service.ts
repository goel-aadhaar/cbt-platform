import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { tenantSetConfigStatement } from '../../database/tenant-rls.extension';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';

const topicSelect = {
  id: true,
  name: true,
  chapterId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

/** Topic management (§2.4) — a topic belongs to a chapter, scoped to the
 * caller's institute. Mirrors BatchesService; readable by TEACHER too. */
@Injectable()
export class TopicsService {
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

  async create(dto: CreateTopicDto) {
    const instituteId = this.instituteId();
    const chapter = await this.prisma.chapter.findFirst({
      where: { id: dto.chapterId, instituteId },
    });
    if (!chapter) throw new NotFoundException('Chapter not found');

    const existing = await this.prisma.topic.findFirst({
      where: { chapterId: dto.chapterId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `Topic '${dto.name}' already exists in this chapter`,
      );
    }
    return this.prisma.topic.create({
      data: { name: dto.name, chapterId: dto.chapterId, instituteId },
      select: topicSelect,
    });
  }

  findAll(chapterId?: string) {
    const instituteId = this.instituteId();
    return this.prisma.topic.findMany({
      where: { instituteId, ...(chapterId ? { chapterId } : {}) },
      orderBy: { name: 'asc' },
      select: topicSelect,
    });
  }

  async findOne(id: string) {
    const topic = await this.prisma.topic.findFirst({
      where: { id, instituteId: this.instituteId() },
      select: topicSelect,
    });
    if (!topic) throw new NotFoundException('Topic not found');
    return topic;
  }

  async update(id: string, dto: UpdateTopicDto) {
    const existing = await this.findOne(id);
    if (dto.name === undefined || dto.name === existing.name) {
      return this.prisma.topic.update({
        where: { id },
        data: { name: dto.name },
        select: topicSelect,
      });
    }

    const clash = await this.prisma.topic.findFirst({
      where: { chapterId: existing.chapterId, name: dto.name, id: { not: id } },
    });
    if (clash) {
      throw new ConflictException(
        `Topic '${dto.name}' already exists in this chapter`,
      );
    }
    // Questions carry the topic name as denormalised text (search, export,
    // review screens read it), so the rename and the resync are one unit.
    return this.prisma.raw.$transaction(async (tx) => {
      await tenantSetConfigStatement(tx, this.tenant);
      const updated = await tx.topic.update({
        where: { id },
        data: { name: dto.name },
        select: topicSelect,
      });
      await tx.question.updateMany({
        where: { topicId: id },
        data: { topic: dto.name },
      });
      return updated;
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.topic.update({
      where: { id },
      data: { isActive: false },
      select: topicSelect,
    });
  }
}
