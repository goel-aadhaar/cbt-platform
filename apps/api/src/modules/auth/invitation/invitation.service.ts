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
import type { AuthUser } from '../auth.types';
import { Role, UserStatus } from '../auth.types';
import { MailService } from '../mail/mail.service';
import { PasswordService } from '../password.service';

export interface InvitedUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  status: UserStatus;
}

interface CreateInvitationParams {
  name: string;
  email: string;
  /** An invitation grants exactly one role; extra roles are granted later. */
  roles: Role[];
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

  /**
   * A SUPERADMIN names the institute explicitly (they have none of their
   * own); an ADMIN's own institute is used instead, regardless of what
   * `params.instituteId` says — an admin cannot invite themselves into
   * another tenant by passing a different id.
   */
  async inviteAdmin(
    actor: Pick<AuthUser, 'userId' | 'role' | 'instituteId'>,
    params: { name: string; email: string; instituteId?: string },
  ): Promise<InvitedUser> {
    const targetInstituteId =
      actor.role === Role.SUPERADMIN ? params.instituteId : actor.instituteId;
    if (!targetInstituteId) {
      throw new BadRequestException(
        actor.role === Role.SUPERADMIN
          ? 'instituteId is required'
          : 'No institute in the current context',
      );
    }

    const institute = await this.prisma.institute.findUnique({
      where: { id: targetInstituteId },
    });
    if (!institute) throw new NotFoundException('Institute not found');

    return this.createInvitation({
      name: params.name,
      email: params.email,
      roles: [Role.ADMIN],
      instituteId: institute.id,
      instituteName: institute.name,
      invitedById: actor.userId,
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
      roles: [Role.TEACHER],
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
      select: {
        user: {
          select: { email: true, status: true, invitationExpiresAt: true },
        },
      },
    });
    // The roll number is only a real conflict if it belongs to someone else,
    // or to a still-live invite. If it's this same email's own lapsed invite,
    // createInvitation() below resurrects that user row (and this Student
    // row via upsert) rather than creating a duplicate.
    if (
      duplicateRoll &&
      !(
        duplicateRoll.user.email === params.email &&
        this.isResurrectable(duplicateRoll.user)
      )
    ) {
      throw new ConflictException(
        'Roll number already exists in this institute',
      );
    }

    return this.createInvitation({
      name: params.name,
      email: params.email,
      roles: [Role.STUDENT],
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
    // A genuinely active/disabled account, or a PENDING one whose invite
    // hasn't lapsed yet, still blocks — only a lapsed invite is resurrected.
    // Without this, letting a TTL expire locked that email out of ever being
    // invited again, with no self-service recovery.
    if (existing && !this.isResurrectable(existing)) {
      throw new ConflictException('Email is already registered');
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const { inviteTtlHours, frontendUrl } =
      this.config.getOrThrow<AuthConfig>('auth');
    const expiresAt = new Date(Date.now() + inviteTtlHours * 3_600_000);

    const user = await this.prisma.$transaction(async (tx) => {
      const data = {
        name: params.name,
        email: params.email,
        roles: params.roles,
        status: UserStatus.PENDING,
        instituteId: params.instituteId,
        invitedById: params.invitedById,
        invitationTokenHash: tokenHash,
        invitationExpiresAt: expiresAt,
      };
      const created = existing
        ? await tx.user.update({ where: { id: existing.id }, data })
        : await tx.user.create({ data });
      if (params.student) {
        await tx.student.upsert({
          where: { userId: created.id },
          create: {
            userId: created.id,
            instituteId: params.instituteId,
            batchId: params.student.batchId,
            rollNumber: params.student.rollNumber,
          },
          update: {
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
      role: user.roles[0],
      inviteUrl: `${frontendUrl}/accept-invite?token=${rawToken}`,
      institute: params.instituteName,
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      status: user.status,
    };
  }

  /** A PENDING account whose invite TTL has already passed — safe to reissue. */
  private isResurrectable(user: {
    status: UserStatus;
    invitationExpiresAt: Date | null;
  }): boolean {
    return (
      user.status === UserStatus.PENDING &&
      (user.invitationExpiresAt === null ||
        user.invitationExpiresAt <= new Date())
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
