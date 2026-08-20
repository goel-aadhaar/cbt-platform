import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { sanitizeRichText } from '../../common/html/sanitize-html';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import {
  CreateInstructionTemplateDto,
  UpdateInstructionTemplateDto,
} from './dto/instruction-template.dto';

const templateSelect = {
  id: true,
  name: true,
  content: true,
  isActive: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
} as const;

/**
 * Reusable candidate-facing instructions text (§ exam authoring). Admins
 * curate it; teachers read it while authoring an exam and copy one in —
 * there is no live link back to the template afterwards, so archiving or
 * editing one never touches an exam that already used it.
 */
@Injectable()
export class InstructionTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private ctx() {
    const ctx = this.tenant.get();
    if (!ctx?.instituteId) {
      throw new BadRequestException('No institute context');
    }
    return { instituteId: ctx.instituteId, userId: ctx.userId };
  }

  async create(dto: CreateInstructionTemplateDto) {
    const { instituteId, userId } = this.ctx();
    const name = dto.name.trim();

    const clash = await this.prisma.instructionTemplate.findFirst({
      where: { instituteId, name },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(`A template named "${name}" already exists.`);
    }

    return this.prisma.instructionTemplate.create({
      data: {
        instituteId,
        name,
        content: sanitizeRichText(dto.content),
        createdById: userId,
      },
      select: templateSelect,
    });
  }

  async findAll(includeInactive = true) {
    const { instituteId } = this.ctx();
    const items = await this.prisma.instructionTemplate.findMany({
      where: { instituteId, ...(includeInactive ? {} : { isActive: true }) },
      select: templateSelect,
      orderBy: { name: 'asc' },
    });
    return { items, total: items.length };
  }

  async update(id: string, dto: UpdateInstructionTemplateDto) {
    const { instituteId } = this.ctx();
    await this.mustExist(id, instituteId);

    if (dto.name) {
      const clash = await this.prisma.instructionTemplate.findFirst({
        where: { instituteId, name: dto.name.trim(), id: { not: id } },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(
          `A template named "${dto.name.trim()}" already exists.`,
        );
      }
    }

    return this.prisma.instructionTemplate.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.content === undefined
          ? {}
          : { content: sanitizeRichText(dto.content) }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      },
      select: templateSelect,
    });
  }

  /**
   * Archive rather than hard-delete: a template is only ever copied into an
   * exam's `instructions`, never referenced by id, so there is nothing it
   * would "break" — archiving just stops it being offered for new papers.
   */
  async remove(id: string) {
    const { instituteId } = this.ctx();
    await this.mustExist(id, instituteId);
    return this.prisma.instructionTemplate.update({
      where: { id },
      data: { isActive: false },
      select: templateSelect,
    });
  }

  private async mustExist(id: string, instituteId: string) {
    const found = await this.prisma.instructionTemplate.findFirst({
      where: { id, instituteId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Instruction template not found');
  }
}
