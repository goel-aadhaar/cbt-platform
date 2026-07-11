import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthConfig } from '../../../config/auth.config';
import { PrismaService } from '../../../database/prisma.service';
import { Role, UserStatus } from '../auth.types';
import { MailService } from '../mail/mail.service';
import { PasswordService } from '../password.service';

export interface InvitedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
}

interface CreateInvitationParams {
  name: string;
  email: string;
  role: Role;
  instituteId: string;
  instituteName: string;
  invitedById: string;
  student?: { rollNumber: string; batchId: string };
}

@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async inviteAdmin(
    invitedById: string,
    params: { name: string; email: string; instituteId: string },
  ): Promise<InvitedUser> {
    const institute = await this.prisma.institute.findUnique({
      where: { id: params.instituteId },
    });
    if (!institute) throw new NotFoundException('Institute not found');

    return this.createInvitation({
      name: params.name,
      email: params.email,
      role: Role.ADMIN,
      instituteId: institute.id,
      instituteName: institute.name,
      invitedById,
    });
  }

  async inviteTeacher(
    inviterInstituteId: string | null,
    invitedById: string,
    params: { name: string; email: string },
  ): Promise<InvitedUser> {
    const institute = await this.requireInstitute(inviterInstituteId);
    return this.createInvitation({
      name: params.name,
      email: params.email,
      role: Role.TEACHER,
      instituteId: institute.id,
      instituteName: institute.name,
      invitedById,
    });
  }

  async inviteStudent(
    inviterInstituteId: string | null,
    invitedById: string,
    params: {
      name: string;
      email: string;
      rollNumber: string;
      batchId: string;
    },
  ): Promise<InvitedUser> {
    const institute = await this.requireInstitute(inviterInstituteId);

    const batch = await this.prisma.batch.findFirst({
      where: { id: params.batchId, instituteId: institute.id },
    });
    if (!batch) {
      throw new BadRequestException('Batch not found in your institute');
    }

    const duplicateRoll = await this.prisma.student.findUnique({
      where: {
        instituteId_rollNumber: {
          instituteId: institute.id,
          rollNumber: params.rollNumber,
        },
      },
    });
    if (duplicateRoll) {
      throw new ConflictException(
        'Roll number already exists in this institute',
      );
    }

    return this.createInvitation({
      name: params.name,
      email: params.email,
      role: Role.STUDENT,
      instituteId: institute.id,
      instituteName: institute.name,
      invitedById,
      student: { rollNumber: params.rollNumber, batchId: batch.id },
    });
  }

  async accept(token: string, password: string): Promise<{ email: string }> {
    const tokenHash = this.hashToken(token);
    const user = await this.prisma.user.findFirst({
      where: { invitationTokenHash: tokenHash },
    });
    if (
      !user ||
      user.status !== UserStatus.PENDING ||
      user.invitationExpiresAt === null ||
      user.invitationExpiresAt <= new Date()
    ) {
      throw new BadRequestException('Invalid or expired invitation');
    }

    const passwordHash = await this.passwords.hash(password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: UserStatus.ACTIVE,
        invitationTokenHash: null,
        invitationExpiresAt: null,
      },
    });
    return { email: user.email };
  }

  private async requireInstitute(instituteId: string | null) {
    if (!instituteId) {
      throw new BadRequestException('No institute in the current context');
    }
    const institute = await this.prisma.institute.findUnique({
      where: { id: instituteId },
    });
    if (!institute) throw new NotFoundException('Institute not found');
    return institute;
  }

  private async createInvitation(
    params: CreateInvitationParams,
  ): Promise<InvitedUser> {
    const existing = await this.prisma.user.findUnique({
      where: { email: params.email },
    });
    if (existing) throw new ConflictException('Email is already registered');

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const { inviteTtlHours, frontendUrl } =
      this.config.getOrThrow<AuthConfig>('auth');
    const expiresAt = new Date(Date.now() + inviteTtlHours * 3_600_000);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: params.name,
          email: params.email,
          role: params.role,
          status: UserStatus.PENDING,
          instituteId: params.instituteId,
          invitedById: params.invitedById,
          invitationTokenHash: tokenHash,
          invitationExpiresAt: expiresAt,
        },
      });
      if (params.student) {
        await tx.student.create({
          data: {
            userId: created.id,
            instituteId: params.instituteId,
            batchId: params.student.batchId,
            rollNumber: params.student.rollNumber,
          },
        });
      }
      return created;
    });

    await this.mail.sendInvitation({
      to: user.email,
      name: user.name,
      role: user.role,
      inviteUrl: `${frontendUrl}/accept-invite?token=${rawToken}`,
      institute: params.instituteName,
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
