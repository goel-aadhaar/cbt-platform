import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { UserStatus } from '../auth/auth.types';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { UpdateStudentDto } from './dto/update-student.dto';

/**
 * Student management (contract §2.10), scoped to the caller's institute.
 * Students are *created* via the invitation flow; here admins list, view,
 * reassign batch, edit name, and deactivate them. A flattened view joins the
 * academic record (Student) with the auth record (User) and the batch.
 */
@Injectable()
export class StudentsService {
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

  async findAll(batchId?: string) {
    const students = await this.prisma.student.findMany({
      where: {
        instituteId: this.instituteId(),
        ...(batchId ? { batchId } : {}),
      },
      select: {
        id: true,
        rollNumber: true,
        createdAt: true,
        user: { select: { name: true, email: true, status: true } },
        batch: { select: { id: true, name: true } },
      },
      orderBy: { rollNumber: 'asc' },
    });
    return students.map((s) => ({
      id: s.id,
      rollNumber: s.rollNumber,
      name: s.user.name,
      email: s.user.email,
      status: s.user.status,
      batch: s.batch,
      createdAt: s.createdAt,
    }));
  }

  async findOne(id: string) {
    const s = await this.prisma.student.findFirst({
      where: { id, instituteId: this.instituteId() },
      select: {
        id: true,
        rollNumber: true,
        createdAt: true,
        user: { select: { name: true, email: true, status: true } },
        batch: { select: { id: true, name: true } },
      },
    });
    if (!s) throw new NotFoundException('Student not found');
    return {
      id: s.id,
      rollNumber: s.rollNumber,
      name: s.user.name,
      email: s.user.email,
      status: s.user.status,
      batch: s.batch,
      createdAt: s.createdAt,
    };
  }

  async update(id: string, dto: UpdateStudentDto) {
    const owned = await this.getOwned(id);

    if (dto.batchId !== undefined && dto.batchId !== owned.batchId) {
      const batch = await this.prisma.batch.findFirst({
        where: { id: dto.batchId, instituteId: this.instituteId() },
      });
      if (!batch) {
        throw new BadRequestException('Batch not found in your institute');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.name !== undefined) {
        await tx.user.update({
          where: { id: owned.userId },
          data: { name: dto.name },
        });
      }
      if (dto.batchId !== undefined) {
        await tx.student.update({
          where: { id },
          data: { batchId: dto.batchId },
        });
      }
    });

    return this.findOne(id);
  }

  /** Soft-delete: disables the student's account (contract §2.10 "delete"). */
  async deactivate(id: string) {
    const owned = await this.getOwned(id);
    await this.prisma.user.update({
      where: { id: owned.userId },
      data: { status: UserStatus.DISABLED },
    });
    return this.findOne(id);
  }

  private async getOwned(id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, instituteId: this.instituteId() },
      select: { id: true, userId: true, batchId: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }
}
