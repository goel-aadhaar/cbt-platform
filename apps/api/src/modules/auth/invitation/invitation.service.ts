import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthConfig } from '../../../config/auth.config';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../auth.types';
import { Role, UserStatus } from '../auth.types';
import { MailService } from '../mail/mail.service';
import { PasswordService } from '../password.service';

const MAX_ROLL_ATTEMPTS = 5;

export interface InvitedUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  status: UserStatus;
  /** Present only for a student invite — the server-generated roll number. */
  rollNumber?: string;
}

export interface AcceptInviteResult {
  email: string;
  name: string;
  role: Role;
  /** Absent for a superadmin account. */
  institute: { name: string; slug: string } | null;
  /** Present only for a student account. */
  rollNumber?: string;
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
  teacherBatchIds?: string[];
}

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

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
    params: { name: string; email: string; batchIds?: string[] },
  ): Promise<InvitedUser> {
    const institute = await this.requireInstitute(inviterInstituteId);

    if (params.batchIds?.length) {
      const found = await this.prisma.batch.count({
        where: { id: { in: params.batchIds }, instituteId: institute.id },
      });
      if (found !== params.batchIds.length) {
        throw new BadRequestException(
          'One or more batches were not found in your institute',
        );
      }
    }

    return this.createInvitation({
      name: params.name,
      email: params.email,
      roles: [Role.TEACHER],
      instituteId: institute.id,
      instituteName: institute.name,
      invitedById,
      teacherBatchIds: params.batchIds,
    });
  }

  /**
   * The roll number is never caller-supplied — it is always generated as
   * {yy}{institute code}{4-digit sequence}, the sequence resetting every
   * year per institute (§2.10). A resurrected lapsed invite (same email,
   * already has a Student row) keeps its existing roll number rather than
   * being issued a new one — re-sending an invite must not change the
   * candidate's login identifier.
   */
  async inviteStudent(
    inviterInstituteId: string | null,
    invitedById: string,
    params: {
      name: string;
      email: string;
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

    const existingStudent = await this.prisma.student.findFirst({
      where: { instituteId: institute.id, user: { email: params.email } },
      select: { rollNumber: true },
    });

    for (let attempt = 1; attempt <= MAX_ROLL_ATTEMPTS; attempt++) {
      const rollNumber =
        existingStudent?.rollNumber ??
        (await this.nextRollNumber(institute.id, institute.code));
      try {
        return await this.createInvitation({
          name: params.name,
          email: params.email,
          roles: [Role.STUDENT],
          instituteId: institute.id,
          instituteName: institute.name,
          invitedById,
          student: { rollNumber, batchId: batch.id },
        });
      } catch (err) {
        // A concurrent invite claimed the same computed roll number first —
        // retry with a freshly-recomputed one. Never applies to a
        // resurrected invite's own existing roll number, which cannot
        // collide with anything but itself.
        const lostRace =
          !existingStudent &&
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002';
        if (!lostRace || attempt === MAX_ROLL_ATTEMPTS) throw err;
      }
    }
    // Unreachable — the loop above always returns or throws.
    throw new Error('Could not allocate a roll number');
  }

  /**
   * Next free roll number for this institute this year:
   * {yy}{code}{sequence}. The sequence is the highest existing suffix for
   * this institute+year plus one, so it stays contiguous even if an earlier
   * student was later deactivated.
   */
  private async nextRollNumber(
    instituteId: string,
    code: string,
  ): Promise<string> {
    const yy = String(new Date().getFullYear() % 100).padStart(2, '0');
    const prefix = `${yy}${code}`;
    const existing = await this.prisma.student.findMany({
      where: { instituteId, rollNumber: { startsWith: prefix } },
      select: { rollNumber: true },
    });
    let max = 0;
    for (const { rollNumber } of existing) {
      const suffix = rollNumber.slice(prefix.length);
      if (/^\d{4}$/.test(suffix)) max = Math.max(max, Number(suffix));
    }
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }

  async accept(token: string, password: string): Promise<AcceptInviteResult> {
    const tokenHash = this.hashToken(token);
    const user = await this.prisma.user.findFirst({
      where: { invitationTokenHash: tokenHash },
      include: {
        institute: { select: { name: true, slug: true } },
        student: { select: { rollNumber: true } },
      },
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

    const role = user.roles[0];
    const { frontendUrl } = this.config.getOrThrow<AuthConfig>('auth');
    const loginUrl = `${frontendUrl}/login${role === Role.STUDENT ? '' : '?as=staff'}`;

    // Best-effort: a welcome email failing to send must not undo the
    // account activation that already succeeded above.
    await this.mail
      .sendWelcome({
        to: user.email,
        name: user.name,
        role,
        institute: user.institute?.name,
        rollNumber: user.student?.rollNumber,
        loginUrl,
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `Welcome email to ${user.email} failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    return {
      email: user.email,
      name: user.name,
      role,
      institute: user.institute
        ? { name: user.institute.name, slug: user.institute.slug }
        : null,
      rollNumber: user.student?.rollNumber,
    };
  }

  /**
   * Re-send the invite email for a still-PENDING account, refreshing the
   * token and its TTL. Unlike createInvitation's implicit resurrection
   * (which only kicks in once the old invite has actually lapsed), this is
   * an explicit admin action and works on a still-live PENDING invite too.
   */
  async resendInvite(
    userId: string,
    instituteId: string,
  ): Promise<{ email: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, instituteId },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== UserStatus.PENDING) {
      throw new BadRequestException('Only a pending invitation can be resent');
    }

    const institute = await this.requireInstitute(instituteId);
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const { inviteTtlHours, frontendUrl } =
      this.config.getOrThrow<AuthConfig>('auth');
    const expiresAt = new Date(Date.now() + inviteTtlHours * 3_600_000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { invitationTokenHash: tokenHash, invitationExpiresAt: expiresAt },
    });

    await this.mail.sendInvitation({
      to: user.email,
      name: user.name,
      role: user.roles[0],
      inviteUrl: `${frontendUrl}/accept-invite?token=${rawToken}`,
      institute: institute.name,
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
      if (params.teacherBatchIds) {
        // Clear-then-create rather than a diff: keeps a resurrected invite
        // (same email, lapsed PENDING invite reusing `existing.id`) idempotent
        // even if it carries a different batch set than the stale invite did.
        await tx.teacherBatch.deleteMany({ where: { teacherId: created.id } });
        if (params.teacherBatchIds.length) {
          await tx.teacherBatch.createMany({
            data: params.teacherBatchIds.map((batchId) => ({
              teacherId: created.id,
              batchId,
              instituteId: params.instituteId,
            })),
          });
        }
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
      rollNumber: params.student?.rollNumber,
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
